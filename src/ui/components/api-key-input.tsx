import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { OllamaAgent } from "../../agent/ollama-agent";
import { getSettingsManager } from "../../utils/settings-manager";

interface ApiKeyInputProps {
  onAgentReady: (agent: OllamaAgent) => void;
}

export default function ApiKeyInput({ onAgentReady }: ApiKeyInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { exit } = useApp();

  useInput((inputChar, key) => {
    if (isSubmitting) return;

    if (key.ctrl && inputChar === "c") {
      exit();
      return;
    }

    if (key.return) {
      handleSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setError("");
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      setInput((prev) => prev + inputChar);
      setError("");
    }
  });

  const handleSubmit = async () => {
    if (!input.trim()) {
      setError("Model name cannot be empty");
      return;
    }

    setIsSubmitting(true);
    try {
      const modelName = input.trim();
      const agent = new OllamaAgent(modelName);
      
      // Save to user settings
      try {
        const manager = getSettingsManager();
        manager.updateUserSetting('defaultModel', modelName);
        console.log(`\n✅ Model saved to ~/.ollama-agent/user-settings.json`);
      } catch (error) {
        console.log('\n⚠️ Could not save model to settings file');
        console.log('Model set for current session only');
      }
      
      onAgentReady(agent);
    } catch (error: any) {
      setError("Invalid model name");
      setIsSubmitting(false);
    }
  };

  const displayText = input.length > 0 ?
    (isSubmitting ? input : input + "█") :
    (isSubmitting ? " " : "█");

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow">🤖 Ollama Model Required</Text>
      <Box marginBottom={1}>
        <Text color="gray">Please enter an Ollama model name to continue:</Text>
      </Box>
      
      <Box borderStyle="round" borderColor="blue" paddingX={1} marginBottom={1}>
        <Text color="gray">❯ </Text>
        <Text>{displayText}</Text>
      </Box>

      {error ? (
        <Box marginBottom={1}>
          <Text color="red">❌ {error}</Text>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        <Text color="gray" dimColor>• Press Enter to submit</Text>
        <Text color="gray" dimColor>• Press Ctrl+C to exit</Text>
        <Text color="gray" dimColor>• Example: qwen2.5-coder:3b</Text>
        <Text color="gray" dimColor>Note: Model will be saved to ~/.ollama-agent/user-settings.json</Text>
      </Box>

      {isSubmitting ? (
        <Box marginTop={1}>
          <Text color="yellow">🔄 Setting up model...</Text>
        </Box>
      ) : null}
    </Box>
  );
}
