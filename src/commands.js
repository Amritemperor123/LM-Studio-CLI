import { EXIT_COMMANDS } from "./config.js";
import { printError, printHelp, printInfo, printModels, ANSI, paint } from "./ui.js";
import { logger } from "./logger.js";

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
