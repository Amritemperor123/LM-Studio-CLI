import { TOOL_CONFIG } from "../shared/config.js";

export function unwrapJsonFence(value) {
  const trimmed = value.trim();

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  return trimmed;
}

export function extractJsonObject(value) {
  const normalized = unwrapJsonFence(value)
    .replace(/<\/?tool_request>/gi, "")
    .replace(/<\/?model_answer>/gi, "")
    .trim();

  // Support for <|tool_call|> tags (common in Qwen/Gemma)
  if (normalized.includes("<|tool_call|>")) {
    try {
      const match = normalized.match(/<\|tool_call\|>(.*?)($|<\|)/s);
      if (match) {
        const content = match[1].trim();
        // If it's call:tool_name{...}
        if (content.startsWith("call:")) {
          const toolPart = content.slice(5);
          const jsonStart = toolPart.indexOf("{");
          if (jsonStart !== -1) {
            const tool = toolPart.slice(0, jsonStart).trim();
            const args = JSON.parse(toolPart.slice(jsonStart));
            return { type: "tool_request", tool, ...args };
          }
          return { type: "tool_request", tool: toolPart };
        }
        // If it's just JSON inside the tag
        return JSON.parse(content);
      }
    } catch {
      // Fall through to standard JSON extraction
    }
  }

  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  try {
    return JSON.parse(normalized.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function normalizeToolRequest(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const normalized = { ...parsed };

  // Handle shorthand {"tool_request": "name", ...args}
  if (typeof normalized.tool_request === "string" && TOOL_CONFIG.supportedTools.has(normalized.tool_request)) {
    normalized.tool = normalized.tool_request;
    normalized.type = "tool_request";
    delete normalized.tool_request;
  }

  if (typeof normalized.tool !== "string" && typeof normalized.type === "string" && TOOL_CONFIG.supportedTools.has(normalized.type)) {
    normalized.tool = normalized.type;
    normalized.type = "tool_request";
  }

  // If we have a valid tool but missing/wrong type, fix it (lenient parsing)
  if (typeof normalized.tool === "string" && TOOL_CONFIG.supportedTools.has(normalized.tool)) {
    normalized.type = "tool_request";
  }

  if (normalized.type !== "tool_request" || typeof normalized.tool !== "string") {
    return null;
  }

  if (!TOOL_CONFIG.supportedTools.has(normalized.tool)) {
    return null;
  }

  return normalized;
}

export function parseToolRequest(value) {
  const parsed = extractJsonObject(value);

  if (!parsed) {
    return null;
  }

  return normalizeToolRequest(parsed);
}

export function describeToolRequest(request) {
  switch (request.tool) {
    case "pwd":
      return "Allow the model to inspect the active workspace path?";
    case "list_files":
      return `Allow the model to list files in ${request.path || "."}?`;
    case "read_file":
      return `Allow the model to read ${request.path}?`;
    case "write_file":
      return `Allow the model to write ${request.path}?`;
    case "make_directory":
      return `Allow the model to create directory ${request.path}?`;
    case "delete_file":
      return `Allow the model to delete ${request.path}?`;
    case "run_terminal_command":
      return `Allow the model to run this terminal command?\n${request.command ?? ""}`;
    default:
      return `Allow the model to run ${request.tool}?`;
  }
}
