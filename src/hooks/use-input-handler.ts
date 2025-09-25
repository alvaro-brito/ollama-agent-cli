import { useState, useMemo, useEffect } from "react";
import { useInput } from "ink";
import { OllamaAgent, ChatEntry } from "../agent/ollama-agent";
import { ConfirmationService } from "../utils/confirmation-service";

import { filterCommandSuggestions } from "../ui/components/command-suggestions";
import { loadModelConfig, updateCurrentModel } from "../utils/model-config";

interface UseInputHandlerProps {
  agent: OllamaAgent;
  chatHistory: ChatEntry[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatEntry[]>>;
  setIsProcessing: (processing: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setTokenCount: (count: number) => void;
  setProcessingTime: (time: number) => void;
  processingStartTime: React.MutableRefObject<number>;
  isProcessing: boolean;
  isStreaming: boolean;
  isConfirmationActive?: boolean;
}

interface CommandSuggestion {
  command: string;
  description: string;
}

interface ModelOption {
  model: string;
}

export function useInputHandler({
  agent,
  chatHistory,
  setChatHistory,
  setIsProcessing,
  setIsStreaming,
  setTokenCount,
  setProcessingTime,
  processingStartTime,
  isProcessing,
  isStreaming,
  isConfirmationActive = false,
}: UseInputHandlerProps) {
  const [input, setInput] = useState("");
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [showModelSelection, setShowModelSelection] = useState(false);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [autoEditEnabled, setAutoEditEnabled] = useState(() => {
    const confirmationService = ConfirmationService.getInstance();
    const sessionFlags = confirmationService.getSessionFlags();
    return sessionFlags.allOperations;
  });

  const commandSuggestions: CommandSuggestion[] = [
    { command: "/help", description: "Show help information" },
    { command: "/clear", description: "Clear chat history" },
    { command: "/logs", description: "Show system logs (summary)" },
    { command: "/last-error-log", description: "Show last 4xx error with payload" },
    { command: "/models", description: "Switch Ollama Model" },
    { command: "/pull", description: "Pull a new model from Ollama" },
    { command: "/commit-and-push", description: "AI commit & push to remote" },
    { command: "/exit", description: "Exit the application" },
  ];

  // Load models from configuration with fallback to defaults
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await loadModelConfig();
        setAvailableModels(models);
      } catch (error) {
        console.warn('Failed to load models:', error);
        // Fallback to empty array or default models
        setAvailableModels([]);
      }
    };
    
    loadModels();
  }, []);

  const handleDirectCommand = async (input: string): Promise<boolean> => {
    const trimmedInput = input.trim();

    if (trimmedInput === "/clear") {
      // Reset chat history
      setChatHistory([]);

      // Reset processing states
      setIsProcessing(false);
      setIsStreaming(false);
      setTokenCount(0);
      setProcessingTime(0);
      processingStartTime.current = 0;

      // Reset confirmation service session flags
      const confirmationService = ConfirmationService.getInstance();
      confirmationService.resetSession();

      setInput("");
      return true;
    }

    if (trimmedInput === "/help") {
      const helpEntry: ChatEntry = {
        type: "assistant",
        content: `Ollama Agent CLI Help:

Built-in Commands:
  /clear      - Clear chat history
  /help       - Show this help
  /logs       - Show system logs
  /last-error-log - Show last 4xx error with payload
  /models     - Switch between available models
  /pull <model> - Pull a new model from Ollama
  /exit       - Exit application
  exit, quit  - Exit application

Git Commands:
  /commit-and-push - AI-generated commit + push to remote

Keyboard Shortcuts:
  Shift+Tab   - Toggle auto-edit mode (bypass confirmations)

Direct Commands (executed immediately):
  ls [path]   - List directory contents
  pwd         - Show current directory
  cd <path>   - Change directory
  cat <file>  - View file contents
  mkdir <dir> - Create directory
  touch <file>- Create empty file

Model Management:
  Available models are loaded from your local Ollama installation
  Use "ollama pull <model>" in terminal to download new models
  Use "/models" to switch between available models

For complex operations, just describe what you want in natural language.
Examples:
  "edit package.json and add a new script"
  "create a new React component called Header"
  "show me all TypeScript files in this project"`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, helpEntry]);
      setInput("");
      return true;
    }

    if (trimmedInput === "/logs") {
      const allLogs = agent.getAllLogs();
      
      let logsContent = "";
      if (allLogs.length === 0) {
        logsContent = "No logs available. Logs are generated during AI interactions.";
      } else {
        logsContent = `System Logs (${allLogs.length} entries):\n\n${allLogs.join('\n')}`;
        
        // Limit log display to prevent overwhelming the interface
        if (logsContent.length > 10000) {
          const recentLogs = allLogs.slice(-50); // Show last 50 log entries
          logsContent = `System Logs (showing last 50 of ${allLogs.length} entries):\n\n${recentLogs.join('\n')}\n\n[... ${allLogs.length - 50} older entries truncated ...]`;
        }
      }

      const logsEntry: ChatEntry = {
        type: "assistant",
        content: logsContent,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, logsEntry]);
      setInput("");
      return true;
    }

    if (trimmedInput === "/last-error-log") {
      const lastError = agent.getLastErrorDetails();
      
      let errorContent = "";
      if (!lastError) {
        errorContent = "No 4xx errors recorded yet. This command shows detailed information about the last client error (400-499).";
      } else {
        errorContent = `Last 4xx Error Details:

Timestamp: ${lastError.timestamp}
Status: ${lastError.status}
Message: ${lastError.message}
Response: ${lastError.response || 'No response body'}

Request Payload:
Model: ${lastError.payload.model}
Stream: ${lastError.payload.stream}

Messages (${lastError.payload.messages.length} entries):
${JSON.stringify(lastError.payload.messages, null, 2)}

Tools (${lastError.payload.tools?.length || 0} entries):
${lastError.payload.tools ? JSON.stringify(lastError.payload.tools, null, 2) : 'No tools'}`;
      }

      const errorEntry: ChatEntry = {
        type: "assistant",
        content: errorContent,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, errorEntry]);
      setInput("");
      return true;
    }

    if (trimmedInput === "/exit") {
      process.exit(0);
      return true;
    }

    if (trimmedInput === "/models") {
      setShowModelSelection(true);
      setSelectedModelIndex(0);
      setInput("");
      return true;
    }

    if (trimmedInput.startsWith("/models ")) {
      const modelArg = trimmedInput.split(" ")[1];
      const modelNames = availableModels.map((m) => m.model);

      if (modelNames.includes(modelArg)) {
        agent.setModel(modelArg);
        updateCurrentModel(modelArg); // Update project current model
        const confirmEntry: ChatEntry = {
          type: "assistant",
          content: `✓ Switched to model: ${modelArg}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, confirmEntry]);
      } else {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Invalid model: ${modelArg}

Available models: ${modelNames.join(", ")}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setInput("");
      return true;
    }

    if (trimmedInput.startsWith("/pull ")) {
      const modelName = trimmedInput.split(" ")[1];
      if (!modelName) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: "Usage: /pull <model-name>\nExample: /pull llama3.2:3b",
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
        setInput("");
        return true;
      }

      const pullEntry: ChatEntry = {
        type: "assistant",
        content: `Pulling model: ${modelName}...`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, pullEntry]);

      try {
        await agent.pullModel(modelName);
        const successEntry: ChatEntry = {
          type: "assistant",
          content: `✓ Successfully pulled model: ${modelName}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, successEntry]);
        
        // Refresh available models
        await agent.refreshAvailableModels();
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `❌ Failed to pull model ${modelName}: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setInput("");
      return true;
    }

    // Handle direct bash commands
    const directBashCommands = [
      "ls",
      "pwd",
      "cd",
      "cat",
      "mkdir",
      "touch",
      "echo",
      "grep",
      "find",
      "cp",
      "mv",
      "rm",
    ];
    const firstWord = trimmedInput.split(" ")[0];

    if (directBashCommands.includes(firstWord)) {
      const userEntry: ChatEntry = {
        type: "user",
        content: trimmedInput,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);

      try {
        const result = await agent.executeBashCommand(trimmedInput);

        const commandEntry: ChatEntry = {
          type: "tool_result",
          content: result.success
            ? result.output || "Command completed"
            : result.error || "Command failed",
          timestamp: new Date(),
          toolCall: {
            id: `bash_${Date.now()}`,
            type: "function",
            function: {
              name: "bash",
              arguments: JSON.stringify({ command: trimmedInput }),
            },
          },
          toolResult: result,
        };
        setChatHistory((prev) => [...prev, commandEntry]);
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error executing command: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setInput("");
      return true;
    }

    return false;
  };

  const processUserMessage = async (userInput: string) => {
    // Start new prompt to move previous logs to session
    agent.startNewPrompt();

    const userEntry: ChatEntry = {
      type: "user",
      content: userInput,
      timestamp: new Date(),
    };
    setChatHistory((prev) => [...prev, userEntry]);

    setIsProcessing(true);
    setInput("");

    try {
      setIsStreaming(true);
      let streamingEntry: ChatEntry | null = null;

      for await (const chunk of agent.processUserMessageStream(userInput)) {
        switch (chunk.type) {
          case "content":
            if (chunk.content) {
              if (!streamingEntry) {
                const newStreamingEntry = {
                  type: "assistant" as const,
                  content: chunk.content,
                  timestamp: new Date(),
                  isStreaming: true,
                };
                setChatHistory((prev) => [...prev, newStreamingEntry]);
                streamingEntry = newStreamingEntry;
              } else {
                setChatHistory((prev) =>
                  prev.map((entry, idx) =>
                    idx === prev.length - 1 && entry.isStreaming
                      ? { ...entry, content: entry.content + chunk.content }
                      : entry
                  )
                );
              }
            }
            break;

          case "token_count":
            if (chunk.tokenCount !== undefined) {
              setTokenCount(chunk.tokenCount);
            }
            break;

          case "tool_calls":
            if (chunk.toolCalls) {
              // Stop streaming for the current assistant message
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming
                    ? {
                        ...entry,
                        isStreaming: false,
                        toolCalls: chunk.toolCalls,
                      }
                    : entry
                )
              );
              streamingEntry = null;

              // Add individual tool call entries to show tools are being executed
              chunk.toolCalls.forEach((toolCall) => {
                const toolCallEntry: ChatEntry = {
                  type: "tool_call",
                  content: "Executing...",
                  timestamp: new Date(),
                  toolCall: toolCall,
                };
                setChatHistory((prev) => [...prev, toolCallEntry]);
              });
            }
            break;

          case "tool_result":
            if (chunk.toolCall && chunk.toolResult) {
              setChatHistory((prev) =>
                prev.map((entry) => {
                  if (entry.isStreaming) {
                    return { ...entry, isStreaming: false };
                  }
                  // Update the existing tool_call entry with the result
                  if (
                    entry.type === "tool_call" &&
                    entry.toolCall?.id === chunk.toolCall?.id
                  ) {
                    return {
                      ...entry,
                      type: "tool_result",
                      content: chunk.toolResult.success
                        ? chunk.toolResult.output || "Success"
                        : chunk.toolResult.error || "Error occurred",
                      toolResult: chunk.toolResult,
                    };
                  }
                  return entry;
                })
              );
              streamingEntry = null;
            }
            break;

          case "done":
            if (streamingEntry) {
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming ? { ...entry, isStreaming: false } : entry
                )
              );
            }
            setIsStreaming(false);
            break;
        }
      }
    } catch (error: any) {
      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Error: ${error.message}`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, errorEntry]);
      setIsStreaming(false);
    }

    setIsProcessing(false);
    processingStartTime.current = 0;
  };

  useInput(async (inputChar: string, key: any) => {
    // Don't handle input if confirmation dialog is active
    if (isConfirmationActive) {
      return;
    }

    if (key.ctrl && inputChar === "c") {
      process.exit(0);
      return;
    }

    // Handle shift+tab to toggle auto-edit mode
    if (key.shift && key.tab) {
      const newAutoEditState = !autoEditEnabled;
      setAutoEditEnabled(newAutoEditState);

      const confirmationService = ConfirmationService.getInstance();
      if (newAutoEditState) {
        // Enable auto-edit: set all operations to be accepted
        confirmationService.setSessionFlag("allOperations", true);
      } else {
        // Disable auto-edit: reset session flags
        confirmationService.resetSession();
      }

      return;
    }

    if (key.escape) {
      if (showCommandSuggestions) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
        return;
      }
      if (showModelSelection) {
        setShowModelSelection(false);
        setSelectedModelIndex(0);
        return;
      }
      if (isProcessing || isStreaming) {
        agent.abortCurrentOperation();
        setIsProcessing(false);
        setIsStreaming(false);
        setTokenCount(0);
        setProcessingTime(0);
        processingStartTime.current = 0;
        return;
      }
    }

    if (showCommandSuggestions) {
      const filteredSuggestions = filterCommandSuggestions(
        commandSuggestions,
        input
      );

      if (filteredSuggestions.length === 0) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
        // Continue processing the input instead of returning
      } else {
        if (key.upArrow) {
          setSelectedCommandIndex((prev) =>
            prev === 0 ? filteredSuggestions.length - 1 : prev - 1
          );
          return;
        }
        if (key.downArrow) {
          setSelectedCommandIndex(
            (prev) => (prev + 1) % filteredSuggestions.length
          );
          return;
        }
        if (key.tab || key.return) {
          const safeIndex = Math.min(
            selectedCommandIndex,
            filteredSuggestions.length - 1
          );
          const selectedCommand = filteredSuggestions[safeIndex];
          setInput(selectedCommand.command + " ");
          setShowCommandSuggestions(false);
          setSelectedCommandIndex(0);
          return;
        }
      }
    }

    if (showModelSelection) {
      if (key.upArrow) {
        setSelectedModelIndex((prev) =>
          prev === 0 ? availableModels.length - 1 : prev - 1
        );
        return;
      }
      if (key.downArrow) {
        setSelectedModelIndex((prev) => (prev + 1) % availableModels.length);
        return;
      }
      if (key.tab || key.return) {
        const selectedModel = availableModels[selectedModelIndex];
        agent.setModel(selectedModel.model);
        updateCurrentModel(selectedModel.model); // Update project current model
        const confirmEntry: ChatEntry = {
          type: "assistant",
          content: `✓ Switched to model: ${selectedModel.model}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, confirmEntry]);
        setShowModelSelection(false);
        setSelectedModelIndex(0);
        return;
      }
    }

    if (key.return) {
      const userInput = input.trim();
      if (userInput === "exit" || userInput === "quit") {
        process.exit(0);
        return;
      }

      if (userInput) {
        const directCommandResult = await handleDirectCommand(userInput);
        if (!directCommandResult) {
          await processUserMessage(userInput);
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      const newInput = input.slice(0, -1);
      setInput(newInput);

      if (!newInput.startsWith("/")) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
      }
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      const newInput = input + inputChar;
      setInput(newInput);

      if (newInput.startsWith("/")) {
        setShowCommandSuggestions(true);
        setSelectedCommandIndex(0);
      } else {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
      }
    }
  });

  return {
    input,
    showCommandSuggestions,
    selectedCommandIndex,
    showModelSelection,
    selectedModelIndex,
    commandSuggestions,
    availableModels,
    agent,
    autoEditEnabled,
  };
}
