import { RUNTIME_LIMITS, ERROR_CODES, APPROVAL_POLICY, TOOL_SAFETY_CLASSES } from "../shared/config.js";
import { ensureSelectedModel } from "../../apps/cli/commands.js";
import {
  buildMessages,
  buildTaskContinuationMessage,
  buildToolRecoveryMessage,
  buildToolResultMessage,
  isInternalOrchestrationLeak,
  replyLooksLikeInspectionOnly,
  responseNeedsRecovery,
  userRequestLikelyNeedsMutation,
} from "./prompting.js";
import { askPermission, printAssistant, printAssistantLabel, printInfo, printToken, printUser } from "../../apps/cli/ui.js";
import { parseToolRequest } from "../tool-runtime/protocol.js";
import { formatToolFallback, runToolRequest, TOOL_REGISTRY } from "../tool-runtime/index.js";
import { logger } from "../shared/logger.js";
import { telemetry } from "../shared/telemetry.js";
import { randomUUID } from "node:crypto";

export async function runAgentTurn(line, state, client, rl) {
  await ensureSelectedModel(state, client);
  printUser(line);

  state.currentRun = {
    id: randomUUID?.() ?? Math.random().toString(36).slice(2),
    userRequest: line,
    phase: "thinking",
    plan: null,
    activeTool: null,
    activeProcess: null,
    cancelled: false,
    startedAt: new Date(),
  };

  logger.debug(`Starting agent turn (Run ID: ${state.currentRun.id})`);
  telemetry.emit("RUN_START", {
    id: state.currentRun.id,
    userRequest: line,
    model: state.model,
    cwd: state.cwd,
    temperature: state.temperature,
  });

  const messages = buildMessages(state, line);
  const requiresMutation = userRequestLikelyNeedsMutation(line);
  let finalReply = "";
  let lastToolResult = null;
  let executedTools = 0;
  let recoveryNudges = 0;
  let hasStreamedInTurn = false;

  try {
    for (let round = 0; round < RUNTIME_LIMITS.maxToolRounds; round += 1) {
      if (state.currentRun.cancelled) {
        logger.debug("Run cancelled by user.");
        break;
      }

      state.currentRun.phase = "thinking";
      telemetry.emit("PHASE_CHANGE", {
        runId: state.currentRun.id,
        phase: "thinking",
        round: round + 1,
      });
      
      let reply = "";
      let hasStreamedInRound = false;

      try {
        let streamingBuffer = "";
        let isPotentialToolRequest = false;
        let hasDecisionBeenMade = false;

        for await (const token of client.chatStream({
          model: state.model,
          messages,
          temperature: state.temperature,
          onUsage: (usage) => telemetry.emit("USAGE_UPDATE", {
            runId: state.currentRun?.id,
            model: state.model,
            usage,
          }),
        })) {
          if (state.currentRun.cancelled) break;
          
          reply += token;

          if (!hasDecisionBeenMade) {
            streamingBuffer += token;
            const trimmedBuffer = streamingBuffer.trim();
            if (trimmedBuffer.length > 0) {
              if (trimmedBuffer.startsWith("{") || trimmedBuffer.startsWith("```")) {
                isPotentialToolRequest = true;
                // Keep buffering
              } else {
                // Not a tool request starting immediately, flush buffer
                printAssistantLabel();
                printToken(streamingBuffer);
                hasDecisionBeenMade = true;
                hasStreamedInRound = true;
                hasStreamedInTurn = true;
              }
            }
          } else {
            printToken(token);
          }
        }
        
        if (isPotentialToolRequest && !hasDecisionBeenMade) {
          const toolRequest = parseToolRequest(reply);
          if (!toolRequest) {
            printAssistantLabel();
            printToken(streamingBuffer);
            hasStreamedInRound = true;
            hasStreamedInTurn = true;
          }
        }

        if (hasStreamedInRound) {
          process.stdout.write("\n");
        }
      } catch (error) {
        logger.error("Streaming failed, falling back to non-streaming chat", error);
        const result = await client.chat({
          model: state.model,
          messages,
          temperature: state.temperature,
        });
        if (!result.ok) throw new Error(result.error.message);
        reply = result.data;
        telemetry.emit("USAGE_UPDATE", {
          runId: state.currentRun.id,
          model: state.model,
          usage: result.meta?.usage,
        });

        if (!parseToolRequest(reply)) {
          printAssistant(reply);
          hasStreamedInRound = true;
          hasStreamedInTurn = true;
        }
      }

      if (state.currentRun.cancelled) break;

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
          if (reply.trim()) {
            messages.push({ role: "assistant", content: reply });
          }
          messages.push(buildTaskContinuationMessage(line, lastToolResult));
          recoveryNudges += 1;
          logger.debug("Attempting task continuation recovery");
          continue;
        }

        if (executedTools > 0 && (isInternalOrchestrationLeak(reply) || (!reply.trim() && lastToolResult))) {
          finalReply = formatToolFallback(lastToolResult);
          break;
        }

        if (recoveryNudges < RUNTIME_LIMITS.maxToolRecoveryNudges && responseNeedsRecovery(reply)) {
          if (reply.trim()) {
            messages.push({ role: "assistant", content: reply });
          }
          messages.push(buildToolRecoveryMessage(reply));
          recoveryNudges += 1;
          logger.debug("Attempting tool recovery nudging");
          continue;
        }

        finalReply = reply || (lastToolResult ? formatToolFallback(lastToolResult) : "(Empty response)");
        telemetry.emit("MODEL_REPLY", {
          runId: state.currentRun.id,
          reply: finalReply,
          round: round + 1,
        });
        break;
      }

      messages.push({ role: "assistant", content: reply });

      state.currentRun.phase = "waiting_for_approval";
      state.currentRun.activeTool = toolRequest.tool;
      telemetry.emit("TOOL_CALL", {
        runId: state.currentRun.id,
        round: round + 1,
        request: toolRequest,
        tool: toolRequest.tool,
        path: toolRequest.path,
        command: toolRequest.command,
      });
      telemetry.emit("PHASE_CHANGE", {
        runId: state.currentRun.id,
        phase: "waiting_for_approval",
        round: round + 1,
      });
      
      const toolMeta = TOOL_REGISTRY[toolRequest.tool];
      let needsApproval = true;

      if (toolMeta) {
        if (toolMeta.safety === TOOL_SAFETY_CLASSES.SAFE) {
          needsApproval = false;
        }
        if (toolMeta.safety === TOOL_SAFETY_CLASSES.TERMINAL && APPROVAL_POLICY.alwaysConfirmTerminal) {
          needsApproval = true;
        }
        if (toolMeta.safety === TOOL_SAFETY_CLASSES.DESTRUCTIVE && APPROVAL_POLICY.confirmDestructive) {
          needsApproval = true;
        }
      }

      // We need describeToolRequest which is in tool-runtime/protocol.js
      const { describeToolRequest } = await import("../tool-runtime/protocol.js");
      const approved = needsApproval ? await askPermission(rl, describeToolRequest(toolRequest)) : true;
      telemetry.emit("TOOL_APPROVAL", {
        runId: state.currentRun.id,
        tool: toolRequest.tool,
        approved,
        automatic: !needsApproval,
      });

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
        telemetry.emit("TOOL_RESULT", {
          runId: state.currentRun.id,
          ...lastToolResult,
        });
        messages.push(buildToolResultMessage(lastToolResult));
        continue;
      }

      state.currentRun.phase = "running_tool";
      telemetry.emit("PHASE_CHANGE", {
        runId: state.currentRun.id,
        phase: "running_tool",
        round: round + 1,
      });
      lastToolResult = await runToolRequest(state, toolRequest);
      executedTools += 1;
      telemetry.emit("TOOL_RESULT", {
        runId: state.currentRun.id,
        ...lastToolResult,
      });
      
      if (lastToolResult.ok) {
        logger.debug(`${toolRequest.tool} succeeded`);
        messages.push(buildToolResultMessage(lastToolResult));
      } else {
        logger.warn(`${toolRequest.tool} failed: ${lastToolResult.error.message}`);
        messages.push(buildToolResultMessage(lastToolResult));
      }
    }
  } catch (error) {
    logger.error("Error in agent loop", error);
    telemetry.emit("MODEL_ERROR", {
      runId: state.currentRun?.id,
      message: error.message,
    });
    finalReply = `I encountered an error: ${error.message}`;
    if (!finalReply.startsWith("assistant:")) {
        printAssistant(finalReply);
    }
  } finally {
    state.currentRun.phase = "generating_final_response";
    telemetry.emit("PHASE_CHANGE", {
      runId: state.currentRun.id,
      phase: "generating_final_response",
    });
    
    if (state.currentRun.cancelled) {
      finalReply = "(Cancelled)";
      printAssistant(finalReply);
    } else if (!finalReply) {
      finalReply = lastToolResult ? formatToolFallback(lastToolResult) : "I could not complete the agent workflow.";
      printAssistant(finalReply);
    } else if (!hasStreamedInTurn && !state.currentRun.cancelled) {
      // If nothing was streamed in the entire turn but we have a finalReply (e.g. from fallback), print it
      printAssistant(finalReply);
    }

    state.history.push({ role: "user", content: line });
    state.history.push({ role: "assistant", content: finalReply });
    telemetry.emit("RUN_END", {
      runId: state.currentRun.id,
      cancelled: state.currentRun.cancelled,
      reply: finalReply,
      executedTools,
      durationMs: Date.now() - state.currentRun.startedAt.getTime(),
    });
    state.currentRun = null;
    logger.debug("Agent turn completed.");
  }
}
