import { RUNTIME_LIMITS, ERROR_CODES } from "./config.js";
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
import { logger } from "./logger.js";
import { crypto } from "node:crypto";

export async function runAgentTurn(line, state, client, rl) {
  await ensureSelectedModel(state, client);
  printUser(line);

  state.currentRun = {
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    userRequest: line,
    phase: "thinking",
    plan: null,
    activeTool: null,
    activeProcess: null,
    cancelled: false,
    startedAt: new Date(),
  };

  logger.info(`Starting agent turn (Run ID: ${state.currentRun.id})`);

  const messages = buildMessages(state, line);
  const requiresMutation = userRequestLikelyNeedsMutation(line);
  let finalReply = "";
  let lastToolResult = null;
  let executedTools = 0;
  let recoveryNudges = 0;

  try {
    for (let round = 0; round < RUNTIME_LIMITS.maxToolRounds; round += 1) {
      if (state.currentRun.cancelled) {
        logger.info("Run cancelled by user.");
        break;
      }

      state.currentRun.phase = "thinking";
      const result = await client.chat({
        model: state.model,
        messages,
        temperature: state.temperature,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      const reply = result.data;
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
          recoveryNudges < RUNTIME_LIMITS.maxToolRecoveryNudges &&
          (isInternalOrchestrationLeak(reply) || (!reply.trim() && lastToolResult) || incompleteMutationReply)
        ) {
          messages.push({ role: "assistant", content: reply });
          messages.push(buildTaskContinuationMessage(line, lastToolResult));
          recoveryNudges += 1;
          logger.debug("Attempting task continuation recovery");
          continue;
        }

        if (executedTools > 0 && (isInternalOrchestrationLeak(reply) || (!reply.trim() && lastToolResult))) {
          finalReply = formatToolFallback(lastToolResult);
          break;
        }

        if (executedTools > 0 && recoveryNudges < RUNTIME_LIMITS.maxToolRecoveryNudges && responseNeedsRecovery(reply)) {
          messages.push({ role: "assistant", content: reply });
          messages.push(buildToolRecoveryMessage(reply));
          recoveryNudges += 1;
          logger.debug("Attempting tool recovery nudging");
          continue;
        }

        finalReply = reply || "(Empty response)";
        break;
      }

      messages.push({ role: "assistant", content: reply });

      state.currentRun.phase = "waiting_for_approval";
      state.currentRun.activeTool = toolRequest.tool;
      const approved = await askPermission(rl, describeToolRequest(toolRequest));

      if (!approved) {
        logger.info(`Tool request denied: ${toolRequest.tool}`);
        lastToolResult = {
          ok: false,
          tool: toolRequest.tool,
          path: toolRequest.path ?? ".",
          error: {
            code: ERROR_CODES.PERMISSION_DENIED,
            message: "Permission denied by user.",
          },
        };
        messages.push(buildToolResultMessage(lastToolResult));
        messages.push({
          role: "system",
          content: "The user denied that tool request. Continue without it if possible.",
        });
        continue;
      }

      state.currentRun.phase = "running_tool";
      lastToolResult = await runToolRequest(state, toolRequest);
      executedTools += 1;
      
      if (lastToolResult.ok) {
        printInfo(`${toolRequest.tool} completed${toolRequest.path ? ` for ${toolRequest.path}` : ""}.`);
        logger.debug(`${toolRequest.tool} succeeded`);
        messages.push(buildToolResultMessage(lastToolResult));
        messages.push(buildPostToolContinueMessage());
      } else {
        logger.warn(`${toolRequest.tool} failed: ${lastToolResult.error.message}`);
        messages.push(buildToolResultMessage(lastToolResult));
        messages.push({
          role: "system",
          content: `That tool request failed (${lastToolResult.error.code}). You may recover with another tool request or answer from available context.`,
        });
      }
    }
  } catch (error) {
    logger.error("Error in agent loop", error);
    finalReply = `I encountered an error: ${error.message}`;
  } finally {
    state.currentRun.phase = "generating_final_response";
    if (!finalReply) {
      finalReply = lastToolResult ? formatToolFallback(lastToolResult) : "I could not complete the agent workflow.";
    }

    printAssistant(finalReply);
    state.history.push({ role: "user", content: line });
    state.history.push({ role: "assistant", content: finalReply });
    state.currentRun = null;
    logger.info("Agent turn completed.");
  }
}
