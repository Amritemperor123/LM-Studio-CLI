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

export function printAssistantLabel() {
  output.write(`${paint(ANSI.magenta, "assistant")}: `);
}

export function printToken(token) {
  output.write(token);
}

export function printAssistant(message) {
  // If message is provided, print label + message + newline
  // If not, it assumes tokens were already printed
  if (message) {
    printAssistantLabel();
    output.write(`${message}\n\n`);
  } else {
    output.write("\n\n");
  }
}

export function printBanner(state) {
  const width = output.columns || 80;
  const innerWidth = width - 4; // Padding and borders

  const lines = [
    { label: "Workspace", value: state.cwd },
    { label: "Endpoint", value: state.baseUrl },
    { label: "Info", value: "/models to check availavble models" },
    { label: "More Info", value: "/load <model> to load a model" },
    { label: "A Little More Info", value: "/unload to eject all models" },
  ];

  const top = paint(ANSI.dim, `╭${"─".repeat(width - 2)}╮`);
  const bottom = paint(ANSI.dim, `╰${"─".repeat(width - 2)}╯`);
  const side = paint(ANSI.dim, "│");

  output.write(`\n${header(" LM Studio Agent CLI ")}\n`);
  output.write(`${top}\n`);

  for (const { label, value } of lines) {
    const labelStr = paint(ANSI.dim, label.padEnd(25));
    const content = `${labelStr} ${value}`;
    
    // Simple truncation if text is too long for the terminal
    const visibleContent = content.length > innerWidth 
      ? content.slice(0, innerWidth - 3) + "..."
      : content.padEnd(innerWidth);

    output.write(`${side}  ${visibleContent}  ${side}\n`);
  }

  output.write(`${bottom}\n\n`);
}

export function printHelp() {
  const commands = [
    { cmd: "/help", desc: "Are you really that stupid?" },
    { cmd: "/models", desc: "List available LM Studio models" },
    { cmd: "/load <id>", desc: "Explicitly load a model into memory" },
    { cmd: "/unload", desc: "Eject all loaded models from memory" },
    { cmd: "/model <id>", desc: "Set the active model for chat" },
    { cmd: "/system <text>", desc: "Replace the system prompt" },
    { cmd: "/pwd", desc: "Show the active workspace path" },
    { cmd: "/stop", desc: "Cancel current generation or tool execution" },
    { cmd: "/clear", desc: "Clear chat history" },
    { cmd: "/exit", desc: "Quit the CLI" },
    { cmd: "Ctrl+C", desc: "Bad way to quit the CLI" },
  ];

  output.write(`\n${header("Available Commands")}\n`);
  
  // Find the longest command to calculate padding
  const maxCmdLen = Math.max(...commands.map(c => c.cmd.length));
  
  for (const { cmd, desc } of commands) {
    const paddedCmd = cmd.padEnd(maxCmdLen + 2, " ");
    output.write(`${paint(ANSI.yellow, paddedCmd)} ${paint(ANSI.dim, "│")} ${desc}\n`);
  }
  
  output.write("\n");
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
