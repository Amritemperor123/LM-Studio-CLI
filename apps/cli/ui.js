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

export function printThinking() {
  output.write(`${paint(ANSI.dim, "thinking...")}\r`);
}

export function clearThinking() {
  // Clear the "thinking..." line
  if (output.isTTY) {
    output.clearLine(0);
    output.cursorTo(0);
  }
}

export function printInputTop() {
  const width = output.columns || 80;
  output.write(paint(ANSI.dim, `╭─ User Input ${"─".repeat(width - 15)}╮\n`));
}

export function printInputBottom() {
  const width = output.columns || 80;
  output.write(paint(ANSI.dim, `╰${"─".repeat(width - 2)}╯\n`));
}

export function printUser(message) {
  // We no longer print "you: message" right after input to avoid repetition
  // but keep the function if we need to reprint history later
  // output.write(`${paint(ANSI.green, "you")}: ${message}\n`);
}

export function printAssistantLabel() {
  output.write(`${paint(ANSI.magenta, "assistant")}: `);
}

let isInsideCodeBlock = false;

export function renderMarkdown(text) {
  if (!text) return "";

  let rendered = text;

  // Code blocks (triple backticks)
  rendered = rendered.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `${ANSI.green}${code}${ANSI.reset}`;
  });

  // Inline code (single backticks)
  rendered = rendered.replace(/`([^`]+)`/g, (match, code) => {
    return `${ANSI.yellow}${code}${ANSI.reset}`;
  });

  // Bold (**text**)
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, (match, bold) => {
    return `${ANSI.bold}${bold}${ANSI.reset}`;
  });

  return rendered;
}

export function printToken(token) {
  let outputToken = token;

  // Simple stateful tracking for code blocks during streaming
  if (token.includes("```")) {
    const parts = token.split("```");
    for (let i = 0; i < parts.length - 1; i++) {
      isInsideCodeBlock = !isInsideCodeBlock;
      // We don't want to print the backticks themselves in color if they are toggles
      // but for simplicity, let's just toggle state
    }
  }

  if (isInsideCodeBlock) {
    outputToken = `${ANSI.green}${token}${ANSI.reset}`;
  }

  output.write(outputToken);
}

export function printAssistant(message) {
  if (message) {
    printAssistantLabel();
    output.write(`${renderMarkdown(message)}\n\n`);
  } else {
    output.write("\n\n");
  }
  // Reset code block state after full message
  isInsideCodeBlock = false;
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

  let anyLoaded = false;
  for (const model of models) {
    const isSelected = model.id === selectedModel;
    const isLoaded = model.state === "loaded" || model.status === "loaded";
    if (isLoaded) anyLoaded = true;
    
    let marker = "  ";
    if (isSelected && isLoaded) {
      marker = paint(ANSI.green, "* ");
    } else if (isSelected) {
      marker = paint(ANSI.yellow, "» ");
    } else if (isLoaded) {
      marker = paint(ANSI.cyan, "L ");
    }

    const stateInfo = isLoaded ? paint(ANSI.dim, " (loaded)") : "";
    output.write(`${marker} ${model.id}${stateInfo}\n`);
  }

  output.write(`\n${paint(ANSI.dim, "* = loaded & active   L = loaded   » = active (not loaded)")}\n`);
  if (!anyLoaded) {
    output.write(paint(ANSI.yellow, "Note: No models appear to be loaded in RAM. Use /load <id> to load one.\n"));
  }
  output.write("\n");
}

export async function askPermission(rl, message) {
  const answer = (await rl.question(`${paint(ANSI.yellow, "permission")}: ${message} [y/N] `))
    .trim()
    .toLowerCase();
  return answer === "y" || answer === "yes";
}
