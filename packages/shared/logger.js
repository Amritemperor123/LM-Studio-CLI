import { LOG_LEVELS, CURRENT_LOG_LEVEL } from "./config.js";

function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

export const logger = {
  debug(message) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      console.debug(formatMessage("DEBUG", message));
    }
  },
  info(message) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
      console.info(formatMessage("INFO", message));
    }
  },
  warn(message) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(formatMessage("WARN", message));
    }
  },
  error(message, error) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      const errorMessage = error ? `${message}: ${error.message}` : message;
      console.error(formatMessage("ERROR", errorMessage));
      if (error?.stack && CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
        console.debug(error.stack);
      }
    }
  },
};
