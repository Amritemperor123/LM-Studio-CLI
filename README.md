# LM Studio Agent CLI

`lms-cli` is a fully local AI-powered coding assistant that uses LM Studio's OpenAI-compatible API to create an autonomous terminal-based coding agent. It provides both a command-line interface and a web dashboard for interacting with locally hosted LLMs.

This project turns locally hosted LLMs into autonomous software engineering agents capable of:

- understanding and navigating repositories
- editing code with precision
- executing terminal commands
- performing multi-step reasoning and planning
- using a comprehensive tool system
- retrieving project context
- managing workspace memory
- autonomously solving development tasks

## Architecture

This is a modular monorepo with the following structure:

- **`apps/cli/`** - Terminal-based chat interface
- **`apps/dashboard/`** - Web-based dashboard with telemetry and monitoring
- **`packages/agent-core/`** - Core agent orchestration and reasoning loop
- **`packages/llm-client/`** - LM Studio API client with streaming support
- **`packages/tool-runtime/`** - Tool execution system and registry
- **`packages/shared/`** - Common utilities (config, logging, telemetry, path utils)

## What The Agent Does

When you start `lms-cli`, it opens an interactive session tied to one active workspace directory.

Inside a session, the agent can request these tools:

- `pwd` - Show current working directory
- `list_files` - List directory contents
- `read_file` - Read file contents
- `write_file` - Create or update files
- `make_directory` - Create directories
- `delete_file` - Remove files
- `run_terminal_command` - Execute shell commands

Every tool request is shown in the terminal and requires your approval before it runs.

## Requirements

- Node.js 18+
- LM Studio running locally
- LM Studio local server enabled (usually at `http://127.0.0.1:1234/v1`)
- At least one loaded model in LM Studio

## Installation

### Install Globally

To make the `lms-cli` command available everywhere on your machine:

```powershell
npm install -g .
```

If PowerShell blocks `npm.ps1`, use:

```powershell
cmd /c npm install -g .
```

### Run From Source

If you are working directly from this project folder:

```powershell
npm install
npm start
```

## Quick Start

1. Start LM Studio and enable the local server
2. Load a model in LM Studio
3. Start `lms-cli` in the folder you want to use as the workspace:

```powershell
cd C:\path\to\your\project
lms-cli
```

4. Ask for help, edits, inspection, or commands
5. Approve or deny tool requests as they appear

## Dashboard

The project includes a web dashboard for monitoring agent activity:

```powershell
npm run dashboard
```

Then open `http://localhost:3001` in your browser to see:
- Real-time telemetry
- Session history
- Tool usage statistics
- Agent performance metrics

## Working With `lms-cli`

### Project-Scoped Workflow

Use this when you are already inside the project you want the assistant to work on:

```powershell
cd C:\path\to\my-project
lms-cli
```

The current directory becomes the workspace for that session.

### Global Workflow

If installed globally, you can launch from anywhere:

```powershell
lms-cli C:\path\to\project
```

This lets you target specific folders without changing your shell directory first.

## Session Commands

Use these slash commands during an interactive session:

- `/help` - Show help
- `/models` - List available models from LM Studio
- `/model <id>` - Switch to a different model
- `/system <prompt>` - Update the system prompt
- `/pwd` - Show the active workspace
- `/clear` - Clear chat history
- `/exit` or `/quit` - Leave the session

## Environment Variables

Configure the CLI with environment variables:

```powershell
$env:LM_STUDIO_BASE_URL="http://127.0.0.1:1234/v1"
$env:LM_STUDIO_MODEL="your-loaded-model-id"
$env:LM_STUDIO_SYSTEM_PROMPT="You are a helpful coding assistant."
$env:LM_STUDIO_TEMPERATURE="0.2"
lms-cli
```

### Supported Variables

- `LM_STUDIO_BASE_URL` - LM Studio server URL
- `LM_STUDIO_MODEL` - Preferred model ID
- `LM_STUDIO_SYSTEM_PROMPT` - System prompt
- `LM_STUDIO_TEMPERATURE` - Sampling temperature
- `LMS_DASHBOARD_PORT` - Dashboard port (default: 3001)

## Workspace Rules

The workspace defines where the agent can read and write files.

### File Tools

File operations are restricted to the active workspace:
- `list_files`
- `read_file`
- `write_file`
- `make_directory`
- `delete_file`

Paths outside the workspace are rejected.

### Terminal Commands

Terminal commands run from the workspace directory but can affect the broader system. Be cautious when approving `run_terminal_command` requests.

## Development

This is a monorepo using npm workspaces. To work on the codebase:

```powershell
npm install
```

Run the CLI:
```powershell
npm start
```

Run the dashboard:
```powershell
npm run dashboard
```

## Troubleshooting

### `lms-cli` Is Not Found

- Run from source with `npm start`
- Or install globally with `npm install -g .`

### LM Studio Connection Errors

- Ensure LM Studio is running
- Verify the local server is enabled
- Check the base URL matches your LM Studio setup

### No Models Available

- Load a model in LM Studio first
- Or set `LM_STUDIO_MODEL` manually
- Use `/model <id>` during the session

### PowerShell Blocks npm

Use `cmd /c npm install -g .` instead.

## Roadmap

This project is in active development with planned features including:

- Streaming responses for real-time interaction
- Structured outputs and improved tool calling
- Embeddings and RAG for better context awareness
- Advanced planning and multi-step reasoning
- Code intelligence and AST parsing
- Git integration tools
- MCP (Model Context Protocol) support
- Enhanced security and sandboxing
- TypeScript migration
- Multi-model provider support

