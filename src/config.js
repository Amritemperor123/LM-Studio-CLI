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
  maxReadBytes: 100_000,
  maxCommandOutputBytes: 24_000,
  commandTimeoutMs: 30_000,
  maxToolRecoveryNudges: 2,
};

export const APPROVAL_POLICY = {
  alwaysConfirmTerminal: true,
};

export const TOOL_CONFIG = {
  supportedTools: new Set([
    "pwd",
    "list_files",
    "read_file",
    "write_file",
    "make_directory",
    "delete_file",
    "run_terminal_command",
  ]),
  toolSpec: [
    "You can request local tools inside the active workspace folder.",
    "If a tool is needed, reply with only a single JSON object and no extra text.",
    'Schema: {"type":"tool_request","tool":"pwd|list_files|read_file|write_file|make_directory|delete_file|run_terminal_command","path":"optional relative path","content":"required for write_file","command":"required for run_terminal_command"}',
    "Rules:",
    "- Paths must be relative to the active workspace.",
    "- Use pwd to learn the active workspace path.",
    "- Use list_files to inspect a directory.",
    "- Use read_file to inspect a file before editing it when accuracy matters.",
    "- Use write_file to create or overwrite a file.",
    "- Use make_directory to create a directory.",
    "- Use delete_file to remove a file.",
    "- Use delete_file to remove a file.",
    "- Use run_terminal_command when a shell command is the best tool for the task.",
    "- When using run_terminal_command, provide the exact command string in the command field.",
    "- After receiving a tool result, continue the task using that result.",
    "- If no tool is needed, answer normally.",
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

// Logger levels
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] : LOG_LEVELS.INFO;
