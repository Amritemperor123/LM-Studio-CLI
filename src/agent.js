import { MAX_TOOL_RECOVERY_NUDGES, MAX_TOOL_ROUNDS } from "./config.js";
import { ensureSelectedModel } from "./commands.js";
import {
  buildMessages,
  buildPostToolContinueMessage,
  buildTaskContinuationMessage,
  buildToolRecoveryMessage,
  buildToolResultMessage,
  isInternalOrchestrationLeak,
  replyLooksLikeInspectionOnly,
  responseNeedsRecovery,
  userRequestLikelyNeedsMutation,
} from "./prompting.js";
import { askPermission, printAssistant, printInfo, printUser } from "./ui.js";
import { describeToolRequest, parseToolRequest } from "./tool-protocol.js";
import { formatToolFallback, runToolRequest } from "./tools.js";

export async function runAgentTurn(line, state, client, rl) {
  await ensureSelectedModel(state, client);
  printUser(line);

  const messages = buildMessages(state, line);
  const requiresMutation = userRequestLikelyNeedsMutation(line);
  let finalReply = "";
  let lastToolResult = null;
  let executedTools = 0;
  let recoveryNudges = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const reply = await client.chat({
      model: state.model,
      messages,
      temperature: state.temperature,
    });

    const toolRequest = parseToolRequest(reply);

    if (!toolRequest) {
      const incompleteMutationReply =
        requiresMutation &&
        executedTools > 0 &&
        lastToolResult &&
        ["pwd", "list_files", "read_file", "run_terminal_command"].includes(lastToolResult.tool) &&
        replyLooksLikeInspectionOnly(reply);

      if (
        executedTools > 0 &&
        recoveryNudges < MAX_TOOL_RECOVERY_NUDGES &&
        (isInternalOrchestrationLeak(reply) || (!reply.trim() && lastToolResult) || incompleteMutationReply)
      ) {
        messages.push({ role: "assistant", content: reply });
        messages.push(buildTaskContinuationMessage(line, lastToolResult));
        recoveryNudges += 1;
        continue;
      }

      if (executedTools > 0 && (isInternalOrchestrationLeak(reply) || (!reply.trim() && lastToolResult))) {
        finalReply = formatToolFallback(lastToolResult);
        break;
      }

      if (executedTools > 0 && recoveryNudges < MAX_TOOL_RECOVERY_NUDGES && responseNeedsRecovery(reply)) {
        messages.push({ role: "assistant", content: reply });
        messages.push(buildToolRecoveryMessage(reply));
        recoveryNudges += 1;
        continue;
      }

      finalReply = reply || "(Empty response)";
      break;
    }

    messages.push({ role: "assistant", content: reply });

    const approved = await askPermission(rl, describeToolRequest(toolRequest));

    if (!approved) {
      lastToolResult = {
        ok: false,
        tool: toolRequest.tool,
        path: toolRequest.path ?? ".",
        error: "Permission denied by user.",
      };
      messages.push(buildToolResultMessage(lastToolResult));
      messages.push({
        role: "system",
        content: "The user denied that tool request. Continue without it if possible.",
      });
      continue;
    }

    try {
      lastToolResult = await runToolRequest(state, toolRequest);
      executedTools += 1;
      printInfo(`${toolRequest.tool} completed${toolRequest.path ? ` for ${toolRequest.path}` : ""}.`);
      messages.push(buildToolResultMessage(lastToolResult));
      messages.push(buildPostToolContinueMessage());
    } catch (error) {
      lastToolResult = {
        ok: false,
        tool: toolRequest.tool,
        path: toolRequest.path ?? ".",
        error: error.message,
      };
      messages.push(buildToolResultMessage(lastToolResult));
      messages.push({
        role: "system",
        content: "That tool request failed. You may recover with another tool request or answer from available context.",
      });
    }
  }

  if (!finalReply) {
    finalReply = lastToolResult ? formatToolFallback(lastToolResult) : "I could not complete the agent workflow.";
  }

  printAssistant(finalReply);
  state.history.push({ role: "user", content: line });
  state.history.push({ role: "assistant", content: finalReply });
}
