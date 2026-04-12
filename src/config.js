import process from "node:process";

export const DEFAULT_BASE_URL = process.env.LM_STUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1";
export const DEFAULT_MODEL = process.env.LM_STUDIO_MODEL ?? "";
export const DEFAULT_SYSTEM_PROMPT =
  process.env.LM_STUDIO_SYSTEM_PROMPT ??
  [
    "You are a local coding assistant running through LM Studio.",
    "Behave like an agent when useful: inspect files, gather context, and then answer.",
    "If you need a local tool, respond with only one JSON object matching the declared tool_request schema.",
    "Some local models are inconsistent about tool JSON; always use the declared schema exactly when possible.",
    "Do not invent tool results.",
  ].join(" ");
export const DEFAULT_TEMPERATURE = Number.parseFloat(process.env.LM_STUDIO_TEMPERATURE ?? "0.2");
export const MAX_TOOL_ROUNDS = 8;
export const MAX_READ_BYTES = 100_000;
export const MAX_COMMAND_OUTPUT_BYTES = 24_000;
export const COMMAND_TIMEOUT_MS = 30_000;
export const MAX_TOOL_RECOVERY_NUDGES = 2;
export const EXIT_COMMANDS = new Set(["/exit", "/quit"]);
export const SUPPORTED_TOOLS = new Set([
  "pwd",
  "list_files",
  "read_file",
  "write_file",
  "make_directory",
  "delete_file",
  "run_terminal_command",
]);
export const TOOL_SPEC = [
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
  "- Use run_terminal_command when a shell command is the best tool for the task.",
  "- When using run_terminal_command, provide the exact command string in the command field.",
  "- After receiving a tool result, continue the task using that result.",
  "- If no tool is needed, answer normally.",
].join("\n");
