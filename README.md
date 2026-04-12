# LM Studio Agent CLI

`lms-cli` is a minimal terminal agent for LM Studio's OpenAI-compatible local server. It gives you an interactive chat UI, lets the model inspect or modify files in a workspace, and asks for approval before every tool call.

This project is especially useful when you want a local coding assistant that can:

- chat in the terminal
- inspect files in the current workspace
- create, update, and delete files inside that workspace
- run terminal commands after explicit approval
- auto-select a loaded LM Studio model if you do not choose one up front

## What The CLI Does

When you start `lms-cli`, it opens an interactive session tied to one active workspace directory.

Inside a session, the model can request these tools:

- `pwd`
- `list_files`
- `read_file`
- `write_file`
- `make_directory`
- `delete_file`
- `run_terminal_command`

Every tool request is shown in the terminal and requires your approval before it runs.

## Requirements

- Node.js 18+
- LM Studio running locally
- LM Studio local server enabled, usually at `http://127.0.0.1:1234/v1`
- At least one loaded model in LM Studio if you want auto-selection to work

## Install

### Run From This Repository

If you are working directly from this project folder, you can start the CLI without installing it globally:

```powershell
node src/index.js
```

Or:

```powershell
npm start
```

### Install Globally

To make the `lms-cli` command available everywhere on your machine from this source checkout:

```powershell
cmd /c npm install -g .
```

If PowerShell blocks `npm.ps1`, keep using `cmd /c npm ...` as shown above.

After that, you can run:

```powershell
lms-cli
```

from any directory.

## Quick Start

1. Start LM Studio.
2. Enable the local server.
3. Load a model in LM Studio.
4. Start `lms-cli` in the folder you want to use as the workspace.
5. Ask for help, edits, inspection, or commands.
6. Approve or deny tool requests as they appear.

## Working With `lms-cli` Inside A Directory

This is the project-scoped workflow. You first move into a directory, then start the CLI there.

### When To Use This Mode

Use this when:

- you are already inside the project you want the assistant to work on
- you want the current shell directory to become the workspace
- you want all relative file operations scoped to the folder you are standing in

### How It Works

If you launch `lms-cli` with no path argument, the active workspace becomes your shell's current working directory.

That means this:

```powershell
cd C:\path\to\my-project
lms-cli
```

is equivalent to telling the CLI:

- use `C:\path\to\my-project` as the workspace
- run file tools relative to that workspace
- run terminal commands from that workspace

At startup, the banner shows:

- the active workspace
- the LM Studio endpoint
- the selected model, or that model auto-selection will happen on first prompt

### Typical Inside-A-Directory Workflow

```powershell
cd C:\Users\amrit\Desktop\Work\Projects\my-app
lms-cli
```

Then ask things like:

- "Show me the files in this project."
- "Read `package.json` and explain the scripts."
- "Create a `README.md` for this app."
- "Update `src/index.js` to log a startup message."

Because the workspace is your current directory, file paths should be thought of as relative to that folder.

For example, if your workspace is:

```text
C:\Users\amrit\Desktop\Work\Projects\my-app
```

then:

- `src/index.js` is allowed
- `README.md` is allowed
- `..\another-project\file.txt` is rejected because it is outside the active workspace

### Why This Mode Is Good

This is usually the safest and simplest way to work because:

- the workspace is obvious
- project-relative paths feel natural
- file tools are constrained to the folder you intentionally entered

## Working With `lms-cli` Globally

This is the machine-wide workflow. You install the command once, then use it anywhere.

### When To Use This Mode

Use this when:

- you want `lms-cli` available in every terminal
- you switch between multiple projects often
- you do not want to start the CLI with `node src/index.js` from the repo each time

### What "Global" Means Here

Global installation does not mean the assistant gets global filesystem access.

It only means:

- the `lms-cli` command is available system-wide
- you can launch it from any folder
- you can optionally pass a target directory to choose the workspace

The actual workspace is still determined per session.

### Global Usage Pattern 1: Launch In The Current Directory

If you are already inside the folder you want:

```powershell
cd C:\path\to\project-a
lms-cli
```

The current directory becomes the workspace for that session.

### Global Usage Pattern 2: Launch Against Another Directory

If you are somewhere else but want to target a specific folder:

```powershell
lms-cli C:\path\to\project-a
```

The CLI resolves that path, changes into it, and uses it as the workspace.

This is useful when:

- your shell is currently in a different folder
- you want a shortcut or script that always opens the same workspace
- you want to operate on a project without manually `cd`-ing first

### Example Global Workflows

Start in the current folder:

```powershell
cd C:\repos\api-service
lms-cli
```

Start in another folder without changing your shell first:

```powershell
lms-cli C:\repos\web-client
```

Start in the current folder using the local source checkout instead of a global install:

```powershell
node C:\Users\amrit\Desktop\Work\Projects\LM-Studio-CLI\src\index.js C:\repos\tooling
```

## Workspace Rules

The workspace is the most important concept in `lms-cli`.

### File Tools

The dedicated file tools are restricted to the active workspace folder:

- `list_files`
- `read_file`
- `write_file`
- `make_directory`
- `delete_file`

These tools reject paths outside the workspace.

### Terminal Commands

Terminal commands are started from the active workspace directory, but shell commands are more powerful than the dedicated file tools.

That means:

- the command runs with the workspace as its current directory
- you still have to approve it before it runs
- the command may affect locations outside the workspace if the shell command itself does that

Be more cautious approving `run_terminal_command` than simple file reads or writes.

## Session Commands

Use these slash commands during an interactive session:

- `/help` - show help
- `/models` - list models returned by LM Studio
- `/model <id>` - set the active model
- `/system <prompt>` - replace the system prompt
- `/pwd` - show the active workspace
- `/clear` - clear chat history
- `/exit` or `/quit` - leave the session

## Environment Variables

You can configure the CLI before launch with environment variables:

```powershell
$env:LM_STUDIO_BASE_URL="http://127.0.0.1:1234/v1"
$env:LM_STUDIO_MODEL="your-loaded-model-id"
$env:LM_STUDIO_SYSTEM_PROMPT="You are a concise coding assistant."
$env:LM_STUDIO_TEMPERATURE="0.2"
lms-cli
```

### Supported Variables

- `LM_STUDIO_BASE_URL` - LM Studio server URL
- `LM_STUDIO_MODEL` - preferred model id
- `LM_STUDIO_SYSTEM_PROMPT` - startup system prompt
- `LM_STUDIO_TEMPERATURE` - sampling temperature

If no model is specified, the CLI queries `/models` and uses the first available model.

## Practical Usage Tips

### For Project Work

Use the inside-a-directory workflow when you are actively editing one codebase:

```powershell
cd C:\repos\my-app
lms-cli
```

This keeps the mental model simple and makes relative paths easy.

### For Multi-Project Work

Use the global workflow when you bounce between repos:

```powershell
lms-cli C:\repos\project-one
lms-cli C:\repos\project-two
```

This lets you keep one command and point it at different workspaces as needed.

### For Safer Approvals

Before approving a tool call, check:

- which file path it wants
- whether that path is inside the expected project
- whether a terminal command is doing more than necessary

## Troubleshooting

### `lms-cli` Is Not Found

If the command is not available:

- run from the repo with `node src/index.js`
- or install it globally with `cmd /c npm install -g .`

### LM Studio Connection Errors

If startup or chat fails:

- make sure LM Studio is running
- make sure the local server is enabled
- make sure the base URL matches your LM Studio setup

Example:

```powershell
$env:LM_STUDIO_BASE_URL="http://127.0.0.1:1234/v1"
lms-cli
```

### No Models Returned

If `/models` returns nothing or the first prompt fails model selection:

- load a model in LM Studio first
- or set `LM_STUDIO_MODEL` manually
- or use `/model <id>` during the session

### PowerShell Blocks `npm`

If PowerShell blocks `npm.ps1`, use:

```powershell
cmd /c npm install -g .
```

## Summary

Use `lms-cli` inside a directory when you want the current folder to become the workspace immediately.

Use `lms-cli` globally when you want one command available everywhere and the flexibility to either:

- launch in the current folder with `lms-cli`
- or target a folder directly with `lms-cli C:\path\to\project`

In both cases, the active workspace is what defines where the agent reads and writes files.
