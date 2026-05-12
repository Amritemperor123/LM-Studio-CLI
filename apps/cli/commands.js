import { EXIT_COMMANDS } from "../../packages/shared/config.js";
import { printError, printHelp, printInfo, printModels, ANSI, paint } from "./ui.js";
import { logger } from "../../packages/shared/logger.js";

export async function ensureSelectedModel(state, client) {
  if (state.model) {
    return;
  }

  try {
    const models = await client.listModels();

    if (models.length === 0) {
      throw new Error("LM Studio returned no models. Load a model in LM Studio first.");
    }

    state.model = models[0].id;
    printInfo(`Selected model ${paint(ANSI.bold, state.model)}.`);
    logger.info(`Auto-selected model: ${state.model}`);
  } catch (error) {
    logger.error("Failed to list or select model", error);
    throw error;
  }
}

export async function handleCommand(line, state, client) {
  const [command, ...rest] = line.trim().split(" ");
  const argument = rest.join(" ").trim();

  logger.debug(`Handling command: ${command} ${argument}`);

  switch (command) {
    case "/help":
      printHelp();
      return true;
    case "/models": {
      try {
        const models = await client.listModels();
        printModels(models, state.model);
      } catch (error) {
        printError(`Failed to list models: ${error.message}`);
        logger.error("Failed to list models", error);
      }
      return true;
    }
    case "/model":
      if (!argument) {
        printError("Provide a model id. Example: /model qwen2.5-coder-7b-instruct");
        return true;
      }
      state.model = argument;
      printInfo(`Active model set to ${paint(ANSI.bold, state.model)}.`);
      logger.info(`Model changed to: ${state.model}`);
      return true;
    case "/load":
      if (!argument) {
        printError("Provide a model id to load. Example: /load qwen2.5-coder-7b-instruct");
        return true;
      }
      try {
        printInfo(`Loading model ${paint(ANSI.bold, argument)}...`);
        const result = await client.loadModel(argument);
        if (result.ok) {
          state.model = argument;
          printInfo(`Successfully loaded and selected ${paint(ANSI.bold, state.model)}.`);
        } else {
          printError(`Failed to load model "${argument}". Ensure it is downloaded in LM Studio.`);
        }
      } catch (error) {
        printError(`Error loading model: ${error.message}`);
      }
      return true;
    case "/unload":
      try {
        printInfo("Unloading all models...");
        const result = await client.unloadModel();
        if (result.ok) {
          state.model = "";
          printInfo("All models unloaded successfully.");
        } else {
          printError(`Failed to unload models: ${result.error.message}`);
        }
      } catch (error) {
        printError(`Error unloading models: ${error.message}`);
      }
      return true;
    case "/system":
      if (!argument) {
        printError("Provide a system prompt after /system.");
        return true;
      }
      state.systemPrompt = argument;
      printInfo("System prompt updated.");
      logger.info("System prompt updated.");
      return true;
    case "/pwd":
      printInfo(state.cwd);
      return true;
    case "/stop":
      if (state.currentRun) {
        state.currentRun.cancelled = true;
        if (state.currentRun.activeProcess) {
          state.currentRun.activeProcess.kill();
          logger.info(`Killed process ${state.currentRun.activeProcess.pid} via /stop`);
        }
        printInfo("Execution stop requested.");
      } else {
        printInfo("No active execution to stop.");
      }
      return true;
    case "/clear":
      state.history = [];
      printInfo("Chat history cleared.");
      logger.info("Chat history cleared.");
      return true;
    default:
      if (EXIT_COMMANDS.has(command)) {
        logger.info("Exit command received.");
        return false;
      }
      printError(`Unknown command: ${command}`);
      return true;
  }
}
