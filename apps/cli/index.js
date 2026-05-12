#!/usr/bin/env node

import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runAgentTurn } from "../../packages/agent-core/index.js";
import { getClient } from "../../packages/llm-client/index.js";
import { handleCommand } from "./commands.js";
import { MODEL_CONFIG } from "../../packages/shared/config.js";
import { resolveLaunchDirectory } from "../../packages/shared/path-utils.js";
import { paint, ANSI, printBanner, printError, printInfo } from "./ui.js";
import { logger } from "../../packages/shared/logger.js";
import { telemetry } from "../../packages/shared/telemetry.js";

async function main() {
  try {
    const launchDirectory = resolveLaunchDirectory(process.argv[2]);
    process.chdir(launchDirectory);
  } catch (error) {
    printError(`Could not open workspace: ${error.message}`);
    process.exit(1);
  }

  const state = {
    baseUrl: MODEL_CONFIG.baseUrl,
    cwd: process.cwd(),
    model: MODEL_CONFIG.defaultModel,
    systemPrompt: MODEL_CONFIG.defaultSystemPrompt,
    temperature: Number.isFinite(MODEL_CONFIG.defaultTemperature) ? MODEL_CONFIG.defaultTemperature : 0.2,
    history: [],
    mode: "fast", // Default mode for Stage 0
    currentRun: null,
    workspaceMemoryRef: null,
  };

  telemetry.emit("SESSION_INIT", {
    model: state.model,
    cwd: state.cwd,
    baseUrl: state.baseUrl,
  });

  const client = getClient(state.baseUrl);
  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });

  process.on("SIGINT", () => {
    output.write("\n");
    rl.close();
    process.exit(0);
  });

  printBanner(state);
  logger.debug("Session started.");

  while (true) {
    let line;

    try {
      line = (await rl.question(paint(ANSI.bold, "> "))).trim();
    } catch (error) {
      if (error.message === "readline was closed") {
        break;
      }
      throw error;
    }

    if (!line) {
      continue;
    }

    if (line.startsWith("/")) {
      try {
        const shouldContinue = await handleCommand(line, state, client);
        if (!shouldContinue) {
          break;
        }
      } catch (error) {
        printError(error.message);
      }
      continue;
    }

    try {
      await runAgentTurn(line, state, client, rl);
    } catch (error) {
      output.write("\n");
      printError(error.message);
      printInfo("If LM Studio uses another endpoint, set LM_STUDIO_BASE_URL before starting the CLI.");
      logger.error("Error during agent turn", error);
    }
  }

  rl.close();
  output.write(`${paint(ANSI.dim, "Session closed.")}\n`);
  logger.debug("Session ended.");
}

main().catch((error) => {
  printError(error.message);
  process.exit(1);
});
