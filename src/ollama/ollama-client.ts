import axios, { AxiosInstance } from "axios";

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
}

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface OllamaToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
}

// Modelos padrão do Ollama (podem ser expandidos dinamicamente)
export const OLLAMA_MODELS = {
  QWEN_CODER: "qwen2.5-coder:3b",
  LLAMA: "llama3.2:3b", 
  CODELLAMA: "codellama:7b",
  MISTRAL: "mistral:7b",
  DEEPSEEK_CODER: "deepseek-coder:6.7b",
  QWEN: "qwen2.5:7b"
} as const;

export type OllamaModelType = typeof OLLAMA_MODELS[keyof typeof OLLAMA_MODELS] | string;

export interface LastErrorDetails {
  timestamp: string;
  status: number;
  message: string;
  response?: any;
  headers?: any;
  payload: {
    model: string;
    messages: any[];
    tools?: any[];
    stream?: boolean;
  };
}

export class OllamaClient {
  private client: AxiosInstance;
  private currentModel: string = OLLAMA_MODELS.QWEN_CODER;
  private logCallback?: (message: string) => void;
  private lastErrorDetails: LastErrorDetails | null = null;
  private availableModels: string[] = [];

  constructor(model?: string, baseURL?: string) {
    const ollamaBaseURL = baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    
    this.client = axios.create({
      baseURL: ollamaBaseURL,
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || "300000"), // 5 minutos
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (model) {
      this.currentModel = model;
    }

    // Inicializar lista de modelos disponíveis
    this.refreshAvailableModels().catch(error => {
      this.log(`[OLLAMA] Warning: Could not fetch available models: ${error.message}`);
    });
  }

  setLogCallback(callback: (message: string) => void): void {
    this.logCallback = callback;
  }

  private log(message: string): void {
    if (this.logCallback) {
      this.logCallback(message);
    } else {
      console.log(message);
    }
  }

  private logError(message: string, data?: any): void {
    const fullMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    if (this.logCallback) {
      this.logCallback(fullMessage);
    } else {
      console.error(message, data);
    }
  }

  async refreshAvailableModels(): Promise<string[]> {
    try {
      this.log('[OLLAMA] Fetching available models...');
      const response = await this.client.get<OllamaModelsResponse>('/api/tags');
      this.availableModels = response.data.models.map(model => model.name);
      this.log(`[OLLAMA] Found ${this.availableModels.length} available models`);
      return this.availableModels;
    } catch (error: any) {
      this.logError('[OLLAMA] Failed to fetch models:', error.message);
      // Fallback para modelos padrão se não conseguir buscar
      this.availableModels = Object.values(OLLAMA_MODELS);
      return this.availableModels;
    }
  }

  setModel(model: string): void {
    this.currentModel = model;
    this.log(`[OLLAMA] Model changed to: ${model}`);
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  getAvailableModels(): string[] {
    return [...this.availableModels];
  }

  getLastErrorDetails(): LastErrorDetails | null {
    return this.lastErrorDetails;
  }

  clearLastErrorDetails(): void {
    this.lastErrorDetails = null;
  }

  // Converter mensagens para formato Ollama
  private convertMessages(messages: OllamaMessage[]): any[] {
    return messages.map(msg => {
      const converted: any = {
        role: msg.role,
        content: msg.content
      };

      if (msg.tool_calls) {
        // Converter tool calls para formato Ollama (arguments deve ser objeto, não string)
        converted.tool_calls = msg.tool_calls.map(toolCall => {
          let parsedArguments;
          try {
            parsedArguments = typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
          } catch (error) {
            // Se não conseguir fazer parse, usar objeto vazio
            parsedArguments = {};
          }
          
          return {
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.function.name,
              arguments: parsedArguments
            }
          };
        });
      }

      if (msg.tool_call_id) {
        converted.tool_call_id = msg.tool_call_id;
      }

      return converted;
    });
  }

  // Converter ferramentas para formato Ollama
  private convertTools(tools: OllamaTool[]): any[] {
    return tools.map(tool => ({
      type: "function",
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }
    }));
  }

  async chat(
    messages: OllamaMessage[],
    tools?: OllamaTool[],
    model?: string
  ): Promise<OllamaResponse> {
    const maxRetries = 3;
    let retryCount = 0;
    
    const requestPayload: any = {
      model: model || this.currentModel,
      messages: this.convertMessages(messages),
      stream: false,
    };

    // Adicionar ferramentas se fornecidas
    if (tools && tools.length > 0) {
      requestPayload.tools = this.convertTools(tools);
    }
    
    while (retryCount <= maxRetries) {
      try {
        const payloadSize = JSON.stringify(requestPayload).length;
        this.log(`[OLLAMA CHAT] Attempt ${retryCount + 1}/${maxRetries + 1}`);
        this.log(`[OLLAMA CHAT] Payload size: ${payloadSize} bytes`);
        this.log(`[OLLAMA CHAT] Model: ${requestPayload.model}`);
        
        if (payloadSize > 100000) {
          this.log(`[OLLAMA CHAT] Large payload detected: ${payloadSize} bytes`);
        }

        const response = await this.client.post<OllamaResponse>('/api/chat', requestPayload);
        
        this.log(`[OLLAMA CHAT] Response received successfully`);
        return response.data;
        
      } catch (error: any) {
        retryCount++;
        
        let errorMessage = `Ollama API error: ${error.message}`;
        
        if (error.response?.status) {
          errorMessage += ` (status: ${error.response.status})`;
        }
        
        if (error.response?.data) {
          errorMessage += ` - ${JSON.stringify(error.response.data)}`;
        }
        
        this.logError(`[OLLAMA CHAT] Error on attempt ${retryCount}/${maxRetries + 1}:`, {
          status: error.response?.status,
          message: error.message,
          response: error.response?.data,
          headers: error.response?.headers
        });

        // Armazenar detalhes do erro para 4xx
        if (error.response?.status >= 400 && error.response?.status < 500) {
          this.lastErrorDetails = {
            timestamp: new Date().toISOString(),
            status: error.response.status,
            message: error.message,
            response: error.response.data,
            headers: error.response.headers,
            payload: {
              model: requestPayload.model,
              messages: requestPayload.messages,
              tools: requestPayload.tools,
              stream: false
            }
          };
        }
        
        // Verificar se é um erro que pode ser tentado novamente
        const isRetryable = error.response?.status === 429 || 
                           error.response?.status >= 500 && error.response?.status <= 504 ||
                           error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
        
        if (retryCount <= maxRetries && isRetryable) {
          const delay = Math.pow(2, retryCount - 1) * 1000;
          this.log(`[OLLAMA CHAT] Retrying in ${delay}ms...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new Error(errorMessage);
      }
    }
    
    throw new Error('Unexpected error: exceeded retry loop');
  }

  async *chatStream(
    messages: OllamaMessage[],
    tools?: OllamaTool[],
    model?: string
  ): AsyncGenerator<any, void, unknown> {
    const maxRetries = 3;
    let retryCount = 0;
    
    const requestPayload: any = {
      model: model || this.currentModel,
      messages: this.convertMessages(messages),
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestPayload.tools = this.convertTools(tools);
    }
    
    while (retryCount <= maxRetries) {
      try {
        const payloadSize = JSON.stringify(requestPayload).length;
        this.log(`[OLLAMA STREAMING] Attempt ${retryCount + 1}/${maxRetries + 1}`);
        this.log(`[OLLAMA STREAMING] Payload size: ${payloadSize} bytes`);
        this.log(`[OLLAMA STREAMING] Model: ${requestPayload.model}`);
        
        if (payloadSize > 100000) {
          this.log(`[OLLAMA STREAMING] Large payload detected: ${payloadSize} bytes`);
        }

        this.log(`[OLLAMA STREAMING] Making request to Ollama API...`);
        
        const response = await this.client.post('/api/chat', requestPayload, {
          responseType: 'stream'
        });
        
        this.log(`[OLLAMA STREAMING] Stream created successfully`);

        let buffer = '';
        let chunkCount = 0;
        let lastChunkTime = Date.now();
        
        this.log(`[OLLAMA STREAMING] Starting to process chunks...`);
        
        try {
          for await (const chunk of response.data) {
            chunkCount++;
            lastChunkTime = Date.now();
            
            this.log(`[OLLAMA STREAMING] Processing chunk ${chunkCount}, size: ${chunk.length} bytes`);
            
            buffer += chunk.toString();
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            this.log(`[OLLAMA STREAMING] Found ${lines.length} lines to process`);
            
            for (const line of lines) {
              if (line.trim()) {
                this.log(`[OLLAMA STREAMING] Processing line: ${line.substring(0, 100)}...`);
                try {
                  const data = JSON.parse(line);
                  this.log(`[OLLAMA STREAMING] Parsed JSON successfully, done: ${data.done}`);
                  
                  // Convert to OpenAI compatible format
                  const convertedChunk = {
                    choices: [{
                      delta: {
                        content: data.message?.content || '',
                        tool_calls: data.message?.tool_calls
                      },
                      finish_reason: data.done ? 'stop' : null
                    }]
                  };
                  
                  this.log(`[OLLAMA STREAMING] Yielding chunk with content: ${data.message?.content?.substring(0, 50) || 'no content'}`);
                  yield convertedChunk;
                  
                  if (data.done) {
                    this.log(`[OLLAMA STREAMING] Stream completed (done=true)`);
                    return;
                  }
                } catch (parseError) {
                  this.logError('[OLLAMA STREAMING] Failed to parse chunk:', parseError);
                  this.logError('[OLLAMA STREAMING] Raw line:', line);
                }
              }
            }
            
            // Add a small delay to prevent overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          
          this.log(`[OLLAMA STREAMING] Stream ended naturally after ${chunkCount} chunks`);
          
        } catch (streamError) {
          this.logError('[OLLAMA STREAMING] Stream processing error:', streamError);
          throw streamError;
        }
        
        return;
        
      } catch (error: any) {
        retryCount++;
        
        let errorMessage = `Ollama API streaming error: ${error.message}`;
        
        if (error.response?.status) {
          errorMessage += ` (status: ${error.response.status})`;
        }
        
        this.logError(`[OLLAMA STREAMING] Error on attempt ${retryCount}/${maxRetries + 1}:`, {
          status: error.response?.status,
          message: error.message,
          response: error.response?.data,
          headers: error.response?.headers
        });

        if (error.response?.status >= 400 && error.response?.status < 500) {
          this.lastErrorDetails = {
            timestamp: new Date().toISOString(),
            status: error.response.status,
            message: error.message,
            response: error.response.data,
            headers: error.response.headers,
            payload: {
              model: requestPayload.model,
              messages: requestPayload.messages,
              tools: requestPayload.tools,
              stream: true
            }
          };
        }
        
        const isRetryable = error.response?.status === 429 || 
                           error.response?.status >= 500 && error.response?.status <= 504 ||
                           error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
        
        if (retryCount <= maxRetries && isRetryable) {
          const delay = Math.pow(2, retryCount - 1) * 1000;
          this.log(`[OLLAMA STREAMING] Retrying in ${delay}ms...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new Error(errorMessage);
      }
    }
  }

  // Método para verificar se o Ollama está rodando
  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/api/tags');
      return true;
    } catch (error) {
      return false;
    }
  }

  // Método para baixar um modelo
  async pullModel(modelName: string): Promise<void> {
    try {
      this.log(`[OLLAMA] Pulling model: ${modelName}`);
      await this.client.post('/api/pull', { name: modelName });
      this.log(`[OLLAMA] Model ${modelName} pulled successfully`);
      
      // Atualizar lista de modelos disponíveis
      await this.refreshAvailableModels();
    } catch (error: any) {
      this.logError(`[OLLAMA] Failed to pull model ${modelName}:`, error.message);
      throw error;
    }
  }
}