import process from "node:process";

export const MODEL_CONFIG = {
  baseUrl: process.env.LM_STUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1",
  defaultModel: process.env.LM_STUDIO_MODEL ?? "",
  defaultSystemPrompt:
    process.env.LM_STUDIO_SYSTEM_PROMPT ??
    [
      "You are a local coding assistant running through LM Studio.",
      "Behave like an agent when useful: inspect files, gather context, and then answer.",
      "If you need a local tool, respond with only one JSON object matching the declared tool_request schema.",
      "Some local models are inconsistent about tool JSON; always use the declared schema exactly when possible.",
      "Do not invent tool results.",
    ].join(" "),
  defaultTemperature: Number.parseFloat(process.env.LM_STUDIO_TEMPERATURE ?? "0.2"),
};

export const RUNTIME_LIMITS = {
  maxToolRounds: 8,
  maxReadBytes: 20_000,
  maxCommandOutputBytes: 24_000,
  commandTimeoutMs: 30_000,
  maxToolRecoveryNudges: 2,
};

export const APPROVAL_POLICY = {
  alwaysConfirmTerminal: true,
  confirmDestructive: true,
};

export const TOOL_SAFETY_CLASSES = {
  SAFE: "safe", // Read-only
  MUTATING: "mutating", // Writes/updates
  DESTRUCTIVE: "destructive", // Deletes/moves that overwrite
  TERMINAL: "terminal", // Shell commands
};

export const TOOL_CONFIG = {
  supportedTools: new Set([
    "pwd",
    "list_files",
    "read_file",
    "write_file",
    "append_file",
    "move_file",
    "make_directory",
    "delete_file",
    "search_files",
    "run_terminal_command",
    "git_status",
    "git_diff",
  ]),
  toolSpec: [
    "You can request local tools inside the active workspace folder.",
    "If a tool is needed, reply with only a single JSON object and NO extra text.",
    'Example: {"type":"tool_request","tool":"list_files","path":"src"}',
    "Available Tools:",
    "- pwd(): Current workspace path.",
    "- list_files(path): List files in a directory.",
    "- read_file(path): Read a file's content.",
    "- write_file(path, content): Create or overwrite a file.",
    "- append_file(path, content): Append text to a file.",
    "- move_file(from, to, overwrite?): Move/rename a file.",
    "- make_directory(path): Create a directory.",
    "- delete_file(path): Delete a file.",
    "- search_files(query, path?): Search for text in files.",
    "- run_terminal_command(command): Run a shell command.",
    "- git_status(): Current git status.",
    "- git_diff(path?): Show git differences.",
    "Rules:",
    "- All paths must be RELATIVE to the workspace.",
    "- Do not include any text before or after the JSON.",
  ].join("\n"),
};

export const EXIT_COMMANDS = new Set(["/exit", "/quit"]);

export const RESULT_TYPES = {
  MODEL: "model",
  TOOL: "tool",
};

export const ERROR_CODES = {
  MODEL_NETWORK_ERROR: "MODEL_NETWORK_ERROR",
  TOOL_VALIDATION_ERROR: "TOOL_VALIDATION_ERROR",
  TOOL_EXECUTION_ERROR: "TOOL_EXECUTION_ERROR",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  TIMEOUT: "TIMEOUT",
  CANCELLATION: "CANCELLATION",
};

export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] : LOG_LEVELS.INFO;
