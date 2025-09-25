# 🦙 Ollama Agent CLI

<div align="center">

**The most advanced AI agent for your terminal**

*Transform your command line into an intelligent assistant with the power of local Ollama models*

[![npm version](https://badge.fury.io/js/ollama-agent-cli.svg)](https://badge.fury.io/js/ollama-agent-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org/)

[🚀 Installation](#-installation) • [✨ Features](#-features) • [📖 Usage Guide](#-usage-guide) • [🔧 Configuration](#-configuration)

</div>

---

## 🎯 **What is Ollama Agent CLI?**

**Ollama Agent CLI** is a revolutionary AI agent that brings artificial intelligence directly to your terminal using local Ollama models. With natural conversational interface and advanced tools, it transforms complex tasks into simple conversations, all running locally on your machine.

### 🌟 **Why choose Ollama Agent CLI?**

- 🧠 **Local and Private AI** - All models run locally, your data stays secure
- 🛠️ **Intelligent Automation** - AI automatically chooses and executes tools
- 🎨 **Modern Interface** - Beautiful and responsive terminal with React + Ink
- 🔌 **Extensible** - Full Model Context Protocol (MCP) support
- 🚀 **No API Keys** - No need for API keys, everything works offline
- 🦙 **Powered by Ollama** - Access to dozens of open-source models

---

## ✨ **Key Features**

### 🤖 **Conversational AI**
Natural language interface powered by the best local Ollama models
- Intelligent contextual conversation
- Multiple models available (Qwen, Llama, CodeLlama, Mistral)
- Real-time response streaming
- Persistent conversation history
- Completely offline and private

### 📝 **Smart File Operations**
AI automatically uses tools to view, create, and edit files
- **Intelligent viewing**: `"Show me the contents of config.json"`
- **Automatic creation**: `"Create a README for my Python project"`
- **Precise editing**: `"Replace version 1.0 with 2.0 in package.json"`

### ⚡ **Bash Integration**
Execute shell commands through natural conversation
- **Commands**: `"List all .js files in the project"`
- **Complex operations**: `"Find files modified in the last 7 days"`
- **Automation**: `"Install dependencies and run tests"`

### 🔧 **Automatic Tool Selection**
AI intelligently chooses the right tools for your requests
- Automatic request analysis
- Sequential execution of multiple tools
- Agent loop system for complex tasks
- Infinite loop prevention

### 🔌 **MCP Tools**
Extend capabilities with Model Context Protocol servers
- Integration with Linear, GitHub, Slack and more
- Dynamic server configuration
- Industry standard protocol
- Unlimited extensibility

### 💬 **Interactive UI**
Beautiful terminal interface built with React + Ink
- Modern and responsive components
- Visual progress indicators
- Interactive chat history
- Real-time model selection

### 🌍 **Global Installation**
Install and use anywhere
- `ollama-agent` command available globally
- Cross-platform compatibility
- Persistent configuration
- Automatic updates

---

## 🚀 **Installation**

### **Prerequisites**

First, install Ollama:

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download
```

Start Ollama:
```bash
ollama serve
```

Download a model (recommended):
```bash
ollama pull qwen2.5-coder:3b
```

### **Global Installation (Recommended)**

```bash
npm install -g ollama-agent-cli
```

### **Installation Verification**

```bash
ollama-agent --version
ollama-agent --help
```

### **Initial Configuration**

```bash
# Optional configuration (defaults work well)
export OLLAMA_BASE_URL="http://localhost:11434"  # default
export OLLAMA_MODEL="qwen2.5-coder:3b"          # default
```

---

## 🎮 **Supported Models**

Ollama Agent CLI works with any Ollama model:

| Model | Size | Specialty | Recommendation |
|-------|------|-----------|----------------|
| **qwen2.5-coder:3b** | 3B | Programming | 🥇 **Default** |
| **llama3.2:3b** | 3B | General use | 🥈 **Fast** |
| **codellama:7b** | 7B | Programming | 💻 **Coding** |
| **mistral:7b** | 7B | General use | 🔧 **Robust** |
| **deepseek-coder:6.7b** | 6.7B | Programming | 🚀 **Advanced** |
| **qwen2.5:7b** | 7B | General use | 🌟 **Complete** |

**Local Model Advantages**:
- 🔒 **Total Privacy** - Your data never leaves your machine
- ⚡ **No Network Latency** - Instant responses
- 💰 **No API Costs** - Use as much as you want, for free
- 🌐 **Works Offline** - No internet required

---

## 📖 **Usage Guide**

### **🎯 Interactive Mode (Recommended)**

```bash
# Start an interactive session
ollama-agent

# With specific model
ollama-agent --model "llama3.2:3b"
```

### **⚡ Headless Mode (Single Prompt)**

```bash
# Execute a direct command
ollama-agent --prompt "List files in current directory"

# With specific model
ollama-agent --model "codellama:7b" --prompt "Create a test file"
```

### **📋 Useful Commands**

```bash
# View available models (local)
ollama-agent models

# Download new models
ollama pull llama3.2:3b

# Configure MCP servers
ollama-agent mcp add linear

# View MCP server status
ollama-agent mcp status

# Complete help
ollama-agent --help
```

---

## 🛠️ **Practical Examples**

### **📁 File Operations**

```bash
# View project structure
"Show me the project file structure"

# Create documentation
"Create a README.md for my React project with installation and usage sections"

# Edit configurations
"In package.json file, update version to 2.1.0 and add 'deploy' script"
```

### **⚡ Bash Automation**

```bash
# Project analysis
"Count how many .ts files exist in the project and show total size"

# Automatic cleanup
"Remove all .log and .tmp files from current directory"

# Automated deployment
"Run npm run build and then npm run deploy"
```

### **🔍 Advanced Search**

```bash
# Code search
"Find all functions containing 'async' in TypeScript files"

# File search
"List all files modified today"

# Regex search
"Search for valid emails in all .md files"
```

### **✅ Task Management**

```bash
# Create task list
"Create a task list to implement authentication in the project"

# Mark as completed
"Mark the 'configure database' task as completed"

# View progress
"Show current status of my tasks"
```

---

## 🔧 **Advanced Configuration**

### **🌐 Environment Variables**

```bash
# Ollama configuration (optional)
OLLAMA_BASE_URL=http://localhost:11434  # default
OLLAMA_MODEL=qwen2.5-coder:3b           # default
OLLAMA_TIMEOUT=300000                   # 5 minutes
```

### **📁 Configuration Structure**

```
~/.ollama-agent/
├── settings.json          # Global settings
├── mcp-servers.json       # MCP servers
├── custom-instructions.md # Custom instructions
└── chat-history/         # Conversation history
```

### **🔌 MCP Configuration**

```json
{
  "servers": {
    "linear": {
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["@linear/mcp-server"]
      }
    },
    "github": {
      "transport": {
        "type": "stdio", 
        "command": "npx",
        "args": ["@github/mcp-server"]
      }
    }
  }
}
```

---

## 🎨 **Interface and Experience**

### **💬 Interactive Chat**

- **Persistent History**: All conversations are saved
- **Visual Indicators**: Spinners and progress bars
- **Syntax Highlighting**: Colored code in terminal
- **Streaming**: Real-time responses

### **🎯 Model Selection**

- **Dynamic Switching**: Change models during conversation
- **Comparison**: Test different models on same prompt
- **Optimization**: Each model for different task types

### **🔔 Smart Confirmations**

- **Sensitive Operations**: Confirmation before deleting files
- **Dangerous Commands**: Warning before destructive commands
- **Customizable**: Configure confirmation levels

---

## 🚀 **Use Cases**

### **👨‍💻 For Developers**

```bash
# Code analysis
"Analyze this file and suggest performance improvements"

# Debugging
"Find possible bugs in this JavaScript code"

# Documentation
"Generate JSDoc documentation for all functions in this file"
```

### **📊 For Data Analysis**

```bash
# Log processing
"Analyze access.log file and show most frequent IPs"

# Reports
"Create a CSV report with project file statistics"

# Monitoring
"Check system CPU and memory usage"
```

### **🎯 For Automation**

```bash
# Automated deployment
"Execute complete pipeline: build, test and deploy"

# Smart backup
"Backup only files modified today"

# Project cleanup
"Remove unused dependencies and temporary files"
```

---

## 🔍 **Available Tools**

| Tool | Description | Usage Example |
|------|-------------|---------------|
| **view_file** | View files and directories | `"Show contents of src/"` |
| **create_file** | Create new files | `"Create a .gitignore for Node.js"` |
| **str_replace_editor** | Edit files precisely | `"Replace 'localhost' with '0.0.0.0'"` |
| **bash** | Execute shell commands | `"List files by size"` |
| **search** | Unified search (text/files) | `"Find 'TODO' in all files"` |
| **todo** | Manage task lists | `"Add task: implement login"` |
| **MCP Tools** | External tools | Linear, GitHub, Slack, etc. |

---

## 📈 **Performance and Limits**

### **⚡ Optimizations**

- **Streaming**: Real-time responses
- **Cache**: Context reuse
- **Tokens**: Smart usage monitoring
- **Parallel**: Simultaneous execution when possible

### **🎯 Recommended Limits**

- **Maximum tools per round**: 10 (configurable)
- **Maximum file size**: 1MB for viewing
- **Chat history**: 100 messages (configurable)
- **Command timeout**: 30 seconds (configurable)

---

## 🛡️ **Security**

### **🔒 Security Practices**

- **Confirmations**: Sensitive operations require confirmation
- **Sandbox**: Isolated command execution
- **Logs**: Complete action auditing
- **Permissions**: Granular access control

### **⚠️ Dangerous Commands**

Ollama Agent CLI detects and confirms potentially dangerous commands:
- File removal (`rm`, `del`)
- System modification (`sudo`, `chmod`)
- Network operations (`curl`, `wget`)
- Package installation (`npm install`, `pip install`)

---

## 🚀 **How to Publish to NPM**

### **1. Publication Preparation**

The project is already correctly configured for publication:

- ✅ `package.json` with `bin` configuration for global CLI
- ✅ `tsconfig.json` configured for compilation
- ✅ `.npmignore` configured to include only necessary files
- ✅ Compiled code in `dist/`
- ✅ MIT license included

### **2. Publication Steps**

```bash
# 1. Login to npm (if not already logged in)
npm login

# 2. Verify build is up to date
npm run build

# 3. Test package locally
npm pack --dry-run

# 4. Publish to npm
npm publish

# To publish as scoped package (recommended for organizations)
npm publish --access public
```

### **3. Post-Publication Verification**

```bash
# Install globally from npm
npm install -g ollama-agent-cli

# Test installation
ollama-agent --version
ollama-agent --help
```

## 🔧 **How to Install Locally**

### **Method 1: Local Global Installation**

```bash
# In project directory
npm run build
npm install -g .

# Test
ollama-agent --version
```

### **Method 2: Symbolic Link (Development)**

```bash
# In project directory
npm run build
npm link

# Test
ollama-agent --version

# To remove link
npm unlink -g ollama-agent-cli
```

### **Method 3: Direct Execution**

```bash
# Execute directly without global installation
node dist/index.js --help
node dist/index.js --prompt "List files in current directory"
```

## 📦 **NPM Package Structure**

The package will include:

- **Compiled code** (`dist/`) - 451.3 kB unpacked
- **README.md** - Complete documentation
- **LICENSE** - MIT license
- **package.json** - Metadata and dependencies

**Excluded files** (via `.npmignore`):

- TypeScript source code (`src/`)
- Development configuration files
- Tests and development documentation
- Temporary files and logs

## ⚙️ **Usage Configuration**

### **Prerequisites:**

```bash
# Install and start Ollama
ollama serve

# Download default model
ollama pull qwen2.5-coder:3b
```

### **Main Commands:**

```bash
# Interactive mode
ollama-agent

# Headless mode
ollama-agent --prompt "Create a README.md file"

# List available models
ollama-agent models

# Download new models
ollama pull llama3.2:3b

# Git operations with AI
ollama-agent git commit-and-push

# Manage MCP servers
ollama-agent mcp status
```

---

## 🤝 **Contributing**

### **🔧 Local Development**

```bash
# Clone repository
git clone https://github.com/ollama-agent/ollama-agent-cli.git
cd ollama-agent-cli

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

### **🧪 Testing**

```bash
# Run tests
npm test

# Tests with coverage
npm run test:coverage

# Linting
npm run lint
