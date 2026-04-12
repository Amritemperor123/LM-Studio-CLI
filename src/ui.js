import { stdout as output } from "node:process";

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

export function paint(color, value) {
  return `${color}${value}${ANSI.reset}`;
}

export function header(value) {
  return `${ANSI.bold}${ANSI.cyan}${value}${ANSI.reset}`;
}

export function printInfo(message) {
  output.write(`${paint(ANSI.cyan, "info")}: ${message}\n`);
}

export function printError(message) {
  output.write(`${paint(ANSI.red, "error")}: ${message}\n`);
}

export function printUser(message) {
  output.write(`${paint(ANSI.green, "you")}: ${message}\n`);
}

export function printAssistant(message) {
  output.write(`${paint(ANSI.magenta, "assistant")}: ${message}\n\n`);
}

export function printBanner(state) {
  output.write(`\n${header("LM Studio Agent CLI")}\n`);
  output.write(`${paint(ANSI.dim, "Workspace")} ${state.cwd}\n`);
  output.write(`${paint(ANSI.dim, "Endpoint")}  ${state.baseUrl}\n`);
  output.write(`${paint(ANSI.dim, "Model")}     ${state.model || "(auto-select on first prompt)"}\n`);
  output.write(`${paint(ANSI.dim, "Commands")}  /help /models /model <id> /system <prompt> /pwd /clear /exit\n\n`);
}

export function printHelp() {
  output.write(`${header("Commands")}\n`);
  output.write(`${paint(ANSI.yellow, "/help")}           Show help\n`);
  output.write(`${paint(ANSI.yellow, "/models")}         List available LM Studio models\n`);
  output.write(`${paint(ANSI.yellow, "/model <id>")}     Set the active model\n`);
  output.write(`${paint(ANSI.yellow, "/system <text>")}  Replace the system prompt\n`);
  output.write(`${paint(ANSI.yellow, "/pwd")}            Show the active workspace\n`);
  output.write(`${paint(ANSI.yellow, "/clear")}          Clear chat history\n`);
  output.write(`${paint(ANSI.yellow, "/exit")}           Quit the CLI\n\n`);
}

export function printModels(models, selectedModel) {
  output.write(`\n${header("Available Models")}\n`);

  if (models.length === 0) {
    output.write(`${paint(ANSI.dim, "No models returned by LM Studio.")}\n\n`);
    return;
  }

  for (const model of models) {
    const marker = model.id === selectedModel ? paint(ANSI.green, "*") : " ";
    output.write(`${marker} ${model.id}\n`);
  }

  output.write("\n");
}

export async function askPermission(rl, message) {
  const answer = (await rl.question(`${paint(ANSI.yellow, "permission")}: ${message} [y/N] `))
    .trim()
    .toLowerCase();
  return answer === "y" || answer === "yes";
}
