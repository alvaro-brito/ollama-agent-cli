import { OllamaClient, OllamaMessage, OllamaToolCall, OllamaModelType, OLLAMA_MODELS } from "../ollama/ollama-client";
import {
  OLLAMA_TOOLS,
  addMCPToolsToOllamaTools,
  getAllOllamaTools,
  getMCPManager,
  initializeMCPServers,
} from "../ollama/tools";
import { loadMCPConfig } from "../mcp/config";
import {
  TextEditorTool,
  BashTool,
  TodoTool,
  ConfirmationTool,
  SearchTool,
} from "../tools";
import { ToolResult } from "../types";
import { EventEmitter } from "events";
import { createTokenCounter, TokenCounter } from "../utils/token-counter";
import { loadCustomInstructions } from "../utils/custom-instructions";
import { getSettingsManager } from "../utils/settings-manager";

export interface ChatEntry {
  type: "user" | "assistant" | "tool_result" | "tool_call";
  content: string;
  timestamp: Date;
  toolCalls?: OllamaToolCall[];
  toolCall?: OllamaToolCall;
  toolResult?: { success: boolean; output?: string; error?: string };
  isStreaming?: boolean;
}

export interface StreamingChunk {
  type: "content" | "tool_calls" | "tool_result" | "done" | "token_count";
  content?: string;
  toolCalls?: OllamaToolCall[];
  toolCall?: OllamaToolCall;
  toolResult?: ToolResult;
  tokenCount?: number;
}

export class OllamaAgent extends EventEmitter {
  private ollamaClient: OllamaClient;
  private textEditor: TextEditorTool;
  private bash: BashTool;
  private todoTool: TodoTool;
  private confirmationTool: ConfirmationTool;
  private search: SearchTool;
  private chatHistory: ChatEntry[] = [];
  private messages: OllamaMessage[] = [];
  private tokenCounter: TokenCounter;
  private abortController: AbortController | null = null;
  private mcpInitialized: boolean = false;
  private sessionLogs: string[] = [];
  private currentPromptLogs: string[] = [];

  constructor(model?: string, baseURL?: string) {
    super();
    const manager = getSettingsManager();
    let modelToUse = model;
    
    if (!modelToUse) {
      try {
        modelToUse = manager.getCurrentModelSync();
      } catch (error) {
        // Fallback to default if no model is configured
        modelToUse = OLLAMA_MODELS.QWEN_CODER;
      }
    }
    
    this.ollamaClient = new OllamaClient(modelToUse, baseURL);
    this.textEditor = new TextEditorTool();
    this.bash = new BashTool();
    this.todoTool = new TodoTool();
    this.confirmationTool = new ConfirmationTool();
    this.search = new SearchTool();
    this.tokenCounter = createTokenCounter(modelToUse);

    // Setup log callback for silent logging
    this.ollamaClient.setLogCallback((message: string) => {
      this.currentPromptLogs.push(`${new Date().toISOString()} ${message}`);
    });

    // Initialize MCP servers if configured
    this.initializeMCP();

    // Load custom instructions
    const customInstructions = loadCustomInstructions();
    const customInstructionsSection = customInstructions
      ? `\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}\n\nThe above custom instructions should be followed alongside the standard instructions below.`
      : "";

    // Initialize with system message
    this.messages.push({
      role: "system",
      content: `You are Ollama Agent CLI, an AI assistant powered by Ollama that helps with file editing, coding tasks, and system operations.${customInstructionsSection}

You have access to various tools for file operations, bash commands, and system tasks. Always be helpful and accurate in your responses.`
    });
  }

  private async initializeMCP(): Promise<void> {
    try {
      const config = loadMCPConfig();
      if (config.servers.length > 0) {
        console.log(
          `Found ${config.servers.length} MCP server(s) - connecting now...`
        );
        await initializeMCPServers();
        console.log(`Successfully connected to MCP servers`);
      }
      this.mcpInitialized = true;
    } catch (error) {
      console.warn("Failed to initialize MCP servers:", error);
      this.mcpInitialized = true; // Don't block if MCP fails
    }
  }

  private async waitForMCPInitialization(): Promise<void> {
    while (!this.mcpInitialized) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async processUserMessage(message: string): Promise<ChatEntry[]> {
    // Wait for MCP initialization before processing
    await this.waitForMCPInitialization();

    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    this.messages.push({ role: "user", content: message });

    const newEntries: ChatEntry[] = [userEntry];
    const maxToolRounds = 50; // Increased limit for comprehensive project analysis
    let toolRounds = 0;

    try {
      const tools = await getAllOllamaTools();
      let currentResponse = await this.ollamaClient.chat(
        this.messages,
        tools,
        undefined
      );

      // Agent loop - continue until no more tool calls or max rounds reached
      while (toolRounds < maxToolRounds) {
        const assistantMessage = currentResponse.message;

        if (!assistantMessage) {
          throw new Error("No response from Ollama");
        }

        // Parse tool calls from content if not in tool_calls format
        let toolCalls = assistantMessage.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          toolCalls = this.parseToolCallsFromContent(assistantMessage.content);
        }

        // Handle tool calls
        if (toolCalls && toolCalls.length > 0) {
          toolRounds++;

          // Add assistant message with tool calls
          const assistantEntry: ChatEntry = {
            type: "assistant",
            content: assistantMessage.content || "Using tools to help you...",
            timestamp: new Date(),
            toolCalls: toolCalls,
          };
          this.chatHistory.push(assistantEntry);
          newEntries.push(assistantEntry);

          // Add assistant message to conversation
          this.messages.push({
            role: "assistant",
            content: assistantMessage.content || "",
            tool_calls: toolCalls,
          } as any);

          // Create initial tool call entries to show tools are being executed
          toolCalls.forEach((toolCall) => {
            const toolCallEntry: ChatEntry = {
              type: "tool_call",
              content: "Executing...",
              timestamp: new Date(),
              toolCall: toolCall,
            };
            this.chatHistory.push(toolCallEntry);
            newEntries.push(toolCallEntry);
          });

          // Execute tool calls and update the entries
          for (const toolCall of toolCalls) {
            const result = await this.executeTool(toolCall);

            // Update the existing tool_call entry with the result
            const entryIndex = this.chatHistory.findIndex(
              (entry) =>
                entry.type === "tool_call" && entry.toolCall?.id === toolCall.id
            );

            if (entryIndex !== -1) {
              const updatedEntry: ChatEntry = {
                ...this.chatHistory[entryIndex],
                type: "tool_result",
                content: result.success
                  ? result.output || "Success"
                  : result.error || "Error occurred",
                toolResult: result,
              };
              this.chatHistory[entryIndex] = updatedEntry;

              // Also update in newEntries for return value
              const newEntryIndex = newEntries.findIndex(
                (entry) =>
                  entry.type === "tool_call" &&
                  entry.toolCall?.id === toolCall.id
              );
              if (newEntryIndex !== -1) {
                newEntries[newEntryIndex] = updatedEntry;
              }
            }

            // Add tool result to messages with proper format (needed for AI context)
            this.messages.push({
              role: "tool",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error",
              tool_call_id: toolCall.id,
            });
          }

          // Get next response - this might contain more tool calls
          currentResponse = await this.ollamaClient.chat(
            this.messages,
            tools,
            undefined
          );
        } else {
          // No more tool calls, add final response
          const finalEntry: ChatEntry = {
            type: "assistant",
            content:
              assistantMessage.content ||
              "I understand, but I don't have a specific response.",
            timestamp: new Date(),
          };
          this.chatHistory.push(finalEntry);
          this.messages.push({
            role: "assistant",
            content: assistantMessage.content || "",
          });
          newEntries.push(finalEntry);
          break; // Exit the loop
        }
      }

      if (toolRounds >= maxToolRounds) {
        const warningEntry: ChatEntry = {
          type: "assistant",
          content:
            "Maximum tool execution rounds reached. Stopping to prevent infinite loops.",
          timestamp: new Date(),
        };
        this.chatHistory.push(warningEntry);
        newEntries.push(warningEntry);
      }

      return newEntries;
    } catch (error: any) {
      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
      };
      this.chatHistory.push(errorEntry);
      return [userEntry, errorEntry];
    }
  }

  private messageReducer(previous: any, item: any): any {
    const reduce = (acc: any, delta: any) => {
      acc = { ...acc };
      for (const [key, value] of Object.entries(delta)) {
        if (acc[key] === undefined || acc[key] === null) {
          acc[key] = value;
          // Clean up index properties from tool calls
          if (Array.isArray(acc[key])) {
            for (const arr of acc[key]) {
              delete arr.index;
            }
          }
        } else if (typeof acc[key] === "string" && typeof value === "string") {
          (acc[key] as string) += value;
        } else if (Array.isArray(acc[key]) && Array.isArray(value)) {
          const accArray = acc[key] as any[];
          for (let i = 0; i < value.length; i++) {
            if (!accArray[i]) accArray[i] = {};
            accArray[i] = reduce(accArray[i], value[i]);
          }
        } else if (typeof acc[key] === "object" && typeof value === "object") {
          acc[key] = reduce(acc[key], value);
        }
      }
      return acc;
    };

    return reduce(previous, item.choices[0]?.delta || {});
  }

  async *processUserMessageStream(
    message: string
  ): AsyncGenerator<StreamingChunk, void, unknown> {
    // Create new abort controller for this request
    this.abortController = new AbortController();

    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    this.messages.push({ role: "user", content: message });

    // Calculate input tokens and manage context size
    let inputTokens = this.tokenCounter.countMessageTokens(
      this.messages as any
    );
    
    // If context is getting too large, summarize older messages
    if (inputTokens > 15000) { // 15k token threshold
      this.addLog(`[AGENT] Context too large (${inputTokens} tokens), summarizing...`);
      await this.summarizeContext();
      inputTokens = this.tokenCounter.countMessageTokens(this.messages as any);
      this.addLog(`[AGENT] Context reduced to ${inputTokens} tokens`);
    }
    
    yield {
      type: "token_count",
      tokenCount: inputTokens,
    };

    const maxToolRounds = 50; // Prevent infinite loops
    let toolRounds = 0;
    let totalOutputTokens = 0;

    try {
      // Agent loop - continue until no more tool calls or max rounds reached
      while (toolRounds < maxToolRounds) {
        this.addLog(`[AGENT] Starting tool round ${toolRounds + 1}/${maxToolRounds}`);
        
        // Check if operation was cancelled
        if (this.abortController?.signal.aborted) {
          this.addLog(`[AGENT] Operation cancelled by user`);
          yield {
            type: "content",
            content: "\n\n[Operation cancelled by user]",
          };
          yield { type: "done" };
          return;
        }

        // Stream response and accumulate
        this.addLog(`[AGENT] Getting tools...`);
        const tools = await getAllOllamaTools();
        this.addLog(`[AGENT] Got ${tools.length} tools`);
        this.addLog(`[AGENT] Current messages count: ${this.messages.length}`);
        this.addLog(`[AGENT] Starting stream...`);
        
        const stream = this.ollamaClient.chatStream(
          this.messages,
          tools,
          undefined
        );
        let accumulatedMessage: any = {};
        let accumulatedContent = "";
        let toolCallsYielded = false;

        for await (const chunk of stream) {
          // Check for cancellation in the streaming loop
          if (this.abortController?.signal.aborted) {
            yield {
              type: "content",
              content: "\n\n[Operation cancelled by user]",
            };
            yield { type: "done" };
            return;
          }

          if (!chunk.choices?.[0]) continue;

          // Accumulate the message using reducer
          accumulatedMessage = this.messageReducer(accumulatedMessage, chunk);

          // Check for tool calls - yield when we have complete tool calls with function names
          if (!toolCallsYielded && accumulatedMessage.tool_calls?.length > 0) {
            // Check if we have at least one complete tool call with a function name
            const hasCompleteTool = accumulatedMessage.tool_calls.some(
              (tc: any) => tc.function?.name
            );
            if (hasCompleteTool) {
              yield {
                type: "tool_calls",
                toolCalls: accumulatedMessage.tool_calls,
              };
              toolCallsYielded = true;
            }
          }

          // Stream content as it comes
          if (chunk.choices[0].delta?.content) {
            accumulatedContent += chunk.choices[0].delta.content;

            // Update token count in real-time including accumulated content and any tool calls
            const currentOutputTokens =
              this.tokenCounter.estimateStreamingTokens(accumulatedContent) +
              (accumulatedMessage.tool_calls
                ? this.tokenCounter.countTokens(
                    JSON.stringify(accumulatedMessage.tool_calls)
                  )
                : 0);
            totalOutputTokens = currentOutputTokens;

            yield {
              type: "content",
              content: chunk.choices[0].delta.content,
            };

            // Emit token count update
            yield {
              type: "token_count",
              tokenCount: inputTokens + totalOutputTokens,
            };
          }
        }

        // Parse tool calls from content if not in tool_calls format
        let toolCalls = accumulatedMessage.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          toolCalls = this.parseToolCallsFromContent(accumulatedMessage.content);
        }

        // Add assistant entry to history
        const assistantEntry: ChatEntry = {
          type: "assistant",
          content: accumulatedMessage.content || "Using tools to help you...",
          timestamp: new Date(),
          toolCalls: toolCalls || undefined,
        };
        this.chatHistory.push(assistantEntry);

        // Add accumulated message to conversation
        this.messages.push({
          role: "assistant",
          content: accumulatedMessage.content || "",
          tool_calls: toolCalls,
        } as any);

        // Handle tool calls if present
        if (toolCalls?.length > 0) {
          toolRounds++;

          // Only yield tool_calls if we haven't already yielded them during streaming
          if (!toolCallsYielded) {
            yield {
              type: "tool_calls",
              toolCalls: toolCalls,
            };
          }

          // Execute tools
          for (const toolCall of toolCalls) {
            // Check for cancellation before executing each tool
            if (this.abortController?.signal.aborted) {
              yield {
                type: "content",
                content: "\n\n[Operation cancelled by user]",
              };
              yield { type: "done" };
              return;
            }

            const result = await this.executeTool(toolCall);

            const toolResultEntry: ChatEntry = {
              type: "tool_result",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error occurred",
              timestamp: new Date(),
              toolCall: toolCall,
              toolResult: result,
            };
            this.chatHistory.push(toolResultEntry);

            yield {
              type: "tool_result",
              toolCall,
              toolResult: result,
            };

            // Add tool result with proper format (needed for AI context)
            this.messages.push({
              role: "tool",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error",
              tool_call_id: toolCall.id,
            });
          }

          // Update token count after processing all tool calls to include tool results
          inputTokens = this.tokenCounter.countMessageTokens(
            this.messages as any
          );
          yield {
            type: "token_count",
            tokenCount: inputTokens + totalOutputTokens,
          };

          // Continue the loop to get the next response (which might have more tool calls)
        } else {
          // No tool calls, we're done
          break;
        }
      }

      if (toolRounds >= maxToolRounds) {
        yield {
          type: "content",
          content:
            "\n\nMaximum tool execution rounds reached. Stopping to prevent infinite loops.",
        };
      }

      yield { type: "done" };
    } catch (error: any) {
      // Check if this was a cancellation
      if (this.abortController?.signal.aborted) {
        yield {
          type: "content",
          content: "\n\n[Operation cancelled by user]",
        };
        yield { type: "done" };
        return;
      }

      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
      };
      this.chatHistory.push(errorEntry);
      yield {
        type: "content",
        content: errorEntry.content,
      };
      yield { type: "done" };
    } finally {
      // Clean up abort controller
      this.abortController = null;
    }
  }

  private parseToolCallsFromContent(content: string): OllamaToolCall[] {
    if (!content) return [];
    
    try {
      // Look for JSON blocks in markdown format
      const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
      const matches = [...content.matchAll(jsonBlockRegex)];
      
      const toolCalls: OllamaToolCall[] = [];
      
      for (const match of matches) {
        try {
          const jsonContent = match[1].trim();
          const parsed = JSON.parse(jsonContent);
          
          // Check if this looks like a tool call
          if (parsed.name && parsed.arguments) {
            const toolCall: OllamaToolCall = {
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: "function",
              function: {
                name: parsed.name,
                arguments: typeof parsed.arguments === 'string'
                  ? parsed.arguments
                  : JSON.stringify(parsed.arguments)
              }
            };
            toolCalls.push(toolCall);
          }
        } catch (parseError) {
          // Skip invalid JSON blocks
          continue;
        }
      }
      
      // Also try to parse direct JSON without markdown blocks
      if (toolCalls.length === 0) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.name && parsed.arguments) {
            const toolCall: OllamaToolCall = {
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: "function",
              function: {
                name: parsed.name,
                arguments: typeof parsed.arguments === 'string'
                  ? parsed.arguments
                  : JSON.stringify(parsed.arguments)
              }
            };
            toolCalls.push(toolCall);
          }
        } catch (directParseError) {
          // Not direct JSON, that's fine
        }
      }
      
      return toolCalls;
    } catch (error) {
      console.error('Error parsing tool calls from content:', error);
      return [];
    }
  }

  private safeJsonParse(jsonString: string): any {
    // Handle null, undefined, or empty strings
    if (!jsonString || typeof jsonString !== 'string') {
      return {};
    }
    
    try {
      // First, try normal JSON parsing
      return JSON.parse(jsonString);
    } catch (error) {
      try {
        // Clean and fix the JSON string
        let fixedJson = jsonString.trim();
        
        // If it doesn't start and end with braces, try to extract the JSON object
        if (!fixedJson.startsWith('{') || !fixedJson.endsWith('}')) {
          const match = fixedJson.match(/\{.*\}/s);
          if (match) {
            fixedJson = match[0];
          }
        }
        
        // Fix common JSON issues step by step
        fixedJson = this.fixJsonString(fixedJson);
        
        // Try to parse the fixed JSON
        return JSON.parse(fixedJson);
      } catch (secondError) {
        try {
          // Last resort: try to manually extract key-value pairs
          return this.extractArgumentsManually(jsonString);
        } catch (thirdError) {
          // If all else fails, return a safe default
          return {};
        }
      }
    }
  }

  private fixJsonString(jsonString: string): string {
    let fixed = jsonString;
    
    // Step 1: Handle unescaped quotes within string values
    // This is a complex regex that tries to identify string values and escape quotes within them
    fixed = fixed.replace(/"([^"]*)"(\s*:\s*)"([^"]*)"/g, (match, key, colon, value) => {
      // Escape any unescaped quotes in the value
      const escapedValue = value.replace(/(?<!\\)"/g, '\\"');
      return `"${key}"${colon}"${escapedValue}"`;
    });
    
    // Step 2: Handle unescaped quotes in string values (more comprehensive)
    fixed = fixed.replace(/":\s*"([^"]*(?:\\.[^"]*)*)"/g, (match, value) => {
      // Only escape quotes that aren't already escaped
      const escapedValue = value.replace(/(?<!\\)"/g, '\\"');
      return match.replace(value, escapedValue);
    });
    
    // Step 3: Handle newlines in string values
    fixed = fixed.replace(/(":\s*"[^"]*)\n([^"]*")/g, '$1\\n$2');
    
    // Step 4: Handle other control characters
    fixed = fixed.replace(/(":\s*"[^"]*)\t([^"]*")/g, '$1\\t$2');
    fixed = fixed.replace(/(":\s*"[^"]*)\r([^"]*")/g, '$1\\r$2');
    
    // Step 5: Handle unescaped backslashes (but not already escaped ones)
    fixed = fixed.replace(/(?<!\\)\\(?!["\\/bfnrt])/g, '\\\\');
    
    return fixed;
  }

  private extractArgumentsManually(jsonString: string): any {
    const result: any = {};
    
    try {
      // Try to extract key-value pairs manually using regex
      // This is a fallback for when JSON parsing completely fails
      
      // Look for patterns like "key": "value" or "key": value
      const keyValuePattern = /"([^"]+)"\s*:\s*(?:"([^"]*)"|([^,}\s]+))/g;
      let match;
      
      while ((match = keyValuePattern.exec(jsonString)) !== null) {
        const key = match[1];
        const stringValue = match[2];
        const nonStringValue = match[3];
        
        if (stringValue !== undefined) {
          // It's a string value
          result[key] = stringValue;
        } else if (nonStringValue !== undefined) {
          // It's a non-string value (number, boolean, etc.)
          try {
            // Try to parse as JSON to get the correct type
            result[key] = JSON.parse(nonStringValue);
          } catch {
            // If that fails, keep it as a string
            result[key] = nonStringValue;
          }
        }
      }
      
      // If we didn't extract anything, try a simpler approach
      if (Object.keys(result).length === 0) {
        // Look for any quoted strings that might be values
        const simplePattern = /"([^"]+)"/g;
        const values: string[] = [];
        let simpleMatch;
        
        while ((simpleMatch = simplePattern.exec(jsonString)) !== null) {
          values.push(simpleMatch[1]);
        }
        
        // If we have an even number of values, assume they're key-value pairs
        if (values.length >= 2 && values.length % 2 === 0) {
          for (let i = 0; i < values.length; i += 2) {
            result[values[i]] = values[i + 1];
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error('Manual extraction also failed:', error);
      return {};
    }
  }

  private async executeTool(toolCall: OllamaToolCall): Promise<ToolResult> {
    try {
      const args = this.safeJsonParse(toolCall.function.arguments);

      switch (toolCall.function.name) {
        case "view_file":
          // Validate that path is provided and is a string
          if (!args || !args.path || typeof args.path !== 'string' || args.path.trim() === '') {
            return {
              success: false,
              error: `Invalid path parameter: ${JSON.stringify(args?.path)}. Path must be a non-empty string.`,
            };
          }
          
          const range: [number, number] | undefined =
            args.start_line && args.end_line
              ? [args.start_line, args.end_line]
              : undefined;
          return await this.textEditor.view(args.path, range);

        case "create_file":
          return await this.textEditor.create(args.path, args.content);

        case "str_replace_editor":
          return await this.textEditor.strReplace(
            args.path,
            args.old_str,
            args.new_str,
            args.replace_all
          );

        case "bash":
          return await this.bash.execute(args.command);

        case "create_todo_list":
          return await this.todoTool.createTodoList(args.todos);

        case "update_todo_list":
          return await this.todoTool.updateTodoList(args.updates);

        case "search":
          // Validate that query is provided
          if (!args || !args.query || typeof args.query !== 'string' || args.query.trim() === '') {
            return {
              success: false,
              error: `Invalid query parameter: ${JSON.stringify(args?.query)}. Query must be a non-empty string.`,
            };
          }
          
          return await this.search.search(args.query, {
            searchType: args.search_type,
            includePattern: args.include_pattern,
            excludePattern: args.exclude_pattern,
            caseSensitive: args.case_sensitive,
            wholeWord: args.whole_word,
            regex: args.regex,
            maxResults: args.max_results,
            fileTypes: args.file_types,
            includeHidden: args.include_hidden,
          });

        default:
          // Check if this is an MCP tool
          if (toolCall.function.name.startsWith("mcp__")) {
            return await this.executeMCPTool(toolCall);
          }

          return {
            success: false,
            error: `Unknown tool: ${toolCall.function.name}`,
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Tool execution error: ${error.message}`,
      };
    }
  }

  private async executeMCPTool(toolCall: OllamaToolCall): Promise<ToolResult> {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const mcpManager = getMCPManager();

      const result = await mcpManager.callTool(toolCall.function.name, args);

      if (result.isError) {
        return {
          success: false,
          error: (result.content[0] as any)?.text || "MCP tool error",
        };
      }

      // Extract content from result
      const output = result.content
        .map((item) => {
          if (item.type === "text") {
            return item.text;
          } else if (item.type === "resource") {
            return `Resource: ${item.resource?.uri || "Unknown"}`;
          }
          return String(item);
        })
        .join("\n");

      return {
        success: true,
        output: output || "Success",
      };
    } catch (error: any) {
      return {
        success: false,
        error: `MCP tool execution error: ${error.message}`,
      };
    }
  }

  getChatHistory(): ChatEntry[] {
    return [...this.chatHistory];
  }

  getCurrentDirectory(): string {
    return this.bash.getCurrentDirectory();
  }

  async executeBashCommand(command: string): Promise<ToolResult> {
    return await this.bash.execute(command);
  }

  getCurrentModel(): string {
    return this.ollamaClient.getCurrentModel();
  }

  setModel(model: string): void {
    this.ollamaClient.setModel(model);
    // Update token counter for new model
    this.tokenCounter.dispose();
    this.tokenCounter = createTokenCounter(model);
  }

  getAvailableModels(): string[] {
    return this.ollamaClient.getAvailableModels();
  }

  async refreshAvailableModels(): Promise<string[]> {
    return await this.ollamaClient.refreshAvailableModels();
  }

  abortCurrentOperation(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private async summarizeContext(): Promise<void> {
    // Keep system message and recent messages, summarize the middle part
    if (this.messages.length <= 10) return; // Not enough messages to summarize
    
    const systemMessage = this.messages[0]; // Keep system message
    const recentMessages = this.messages.slice(-6); // Keep last 6 messages
    const messagesToSummarize = this.messages.slice(1, -6); // Middle messages to summarize
    
    if (messagesToSummarize.length === 0) return;
    
    try {
      // Create a summary of the middle messages
      const summaryContent = messagesToSummarize
        .map(msg => {
          if (msg.role === 'user') return `User: ${msg.content}`;
          if (msg.role === 'assistant') return `Assistant: ${msg.content}`;
          if (msg.role === 'tool') {
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            return `Tool result: ${content.substring(0, 100)}...`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
      
      const summaryMessage: OllamaMessage = {
        role: 'assistant',
        content: `[Context Summary] Previous conversation included:\n${summaryContent.substring(0, 1000)}...`
      };
      
      // Replace messages with system + summary + recent
      this.messages = [systemMessage, summaryMessage, ...recentMessages];
      
      this.addLog(`[AGENT] Context summarized: ${messagesToSummarize.length} messages condensed into summary`);
    } catch (error) {
      this.addLog(`[AGENT] Failed to summarize context: ${error}`);
      // Fallback: just keep system message and recent messages
      this.messages = [systemMessage, ...recentMessages];
    }
  }

  private addLog(message: string): void {
    const timestampedMessage = `${new Date().toISOString()} ${message}`;
    this.currentPromptLogs.push(timestampedMessage);
  }

  startNewPrompt(): void {
    // Move current prompt logs to session logs
    if (this.currentPromptLogs.length > 0) {
      this.sessionLogs.push(...this.currentPromptLogs);
      this.currentPromptLogs = [];
    }
  }

  getCurrentPromptLogs(): string[] {
    return [...this.currentPromptLogs];
  }

  getSessionLogs(): string[] {
    return [...this.sessionLogs];
  }

  getAllLogs(): string[] {
    return [...this.sessionLogs, ...this.currentPromptLogs];
  }

  clearLogs(): void {
    this.sessionLogs = [];
    this.currentPromptLogs = [];
  }

  getLastErrorDetails() {
    return this.ollamaClient.getLastErrorDetails();
  }

  clearLastErrorDetails(): void {
    this.ollamaClient.clearLastErrorDetails();
  }

  // Ollama-specific methods
  async checkOllamaHealth(): Promise<boolean> {
    return await this.ollamaClient.checkHealth();
  }

  async pullModel(modelName: string): Promise<void> {
    return await this.ollamaClient.pullModel(modelName);
  }
}