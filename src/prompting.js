import { TOOL_CONFIG } from "./config.js";
import { extractJsonObject, normalizeToolRequest } from "./tool-protocol.js";

const INTERNAL_PROMPT_FRAGMENTS = [
  "Your last response did not follow the tool protocol closely enough.",
  "You have received a real tool result.",
  "If you need a tool, reply now with only valid tool_request JSON.",
  "or request one more tool with valid tool_request JSON",
];

const MUTATION_REQUEST_PATTERNS = [
  /\bcreate\b/i,
  /\bwrite\b/i,
  /\bupdate\b/i,
  /\bmodify\b/i,
  /\bedit\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bmake\b/i,
  /\bgenerate\b/i,
  /\bsave\b/i,
];

const INSPECTION_ONLY_REPLY_PATTERNS = [
  /^Here are the files and folders in\b/i,
  /^Contents of\b/i,
  /^The active workspace is:\b/i,
  /^Command completed:\b/i,
];

export function buildMessages(state, userInput) {
  return [
    { role: "system", content: state.systemPrompt },
    {
      role: "system",
      content: `${TOOL_CONFIG.toolSpec}\nActive workspace: ${state.cwd}`,
    },
    ...state.history,
    { role: "user", content: userInput },
  ];
}

export function buildToolResultMessage(result) {
  // Model should see a simplified result view
  const payload = result.ok
    ? { ok: true, tool: result.tool, output: result.data }
    : { ok: false, tool: result.tool, error: result.error.message };

  return {
    role: "system",
    content: `Tool result:\n${JSON.stringify(payload, null, 2)}`,
  };
}

export function buildToolRecoveryMessage(reply) {
  return {
    role: "system",
    content:
      "Your last response did not follow the tool protocol closely enough. " +
      "If you need a tool, reply now with only valid tool_request JSON. " +
      "Otherwise answer the user normally in plain text. " +
      `Previous response: ${reply || "(empty response)"}`,
  };
}

export function buildPostToolContinueMessage() {
  return {
    role: "system",
    content:
      "You have received a real tool result. Now either answer the user in plain text, " +
      "or request one more tool with valid tool_request JSON if absolutely necessary.",
  };
}

export function buildTaskContinuationMessage(userInput, lastToolResult) {
  const summary = lastToolResult.ok ? lastToolResult.data : lastToolResult.error.message;
  return {
    role: "system",
    content:
      "The user's request is not complete yet. Do not stop at inspection or analysis if the user asked you to create, update, or delete something. " +
      "Continue from the latest tool result and request the next tool if needed. " +
      `Original user request: ${userInput}\n` +
      `Latest tool result summary: ${typeof summary === "string" ? summary.slice(0, 500) : "N/A"}`,
  };
}

export function responseNeedsRecovery(reply) {
  const trimmed = reply.trim();

  if (!trimmed) {
    return true;
  }

  const parsed = extractJsonObject(trimmed);

  if (!parsed) {
    return false;
  }

  if (normalizeToolRequest(parsed)) {
    return false;
  }

  if (typeof parsed.type === "string" || typeof parsed.tool === "string") {
    return true;
  }

  return false;
}

export function isInternalOrchestrationLeak(reply) {
  const normalized = reply.trim();

  if (!normalized) {
    return false;
  }

  return INTERNAL_PROMPT_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function userRequestLikelyNeedsMutation(userInput) {
  return MUTATION_REQUEST_PATTERNS.some((pattern) => pattern.test(userInput));
}

export function replyLooksLikeInspectionOnly(reply) {
  const normalized = reply.trim();

  if (!normalized) {
    return false;
  }

  return INSPECTION_ONLY_REPLY_PATTERNS.some((pattern) => pattern.test(normalized));
}
