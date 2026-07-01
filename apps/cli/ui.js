import { stdout as output } from "node:process";
import { basename } from "node:path";
import stripAnsi from "strip-ansi";
import stringWidth from "string-width";

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  inverse: "\x1b[7m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
};

const UI = {
  border: "\x1b[38;5;240m",
  muted: "\x1b[38;5;245m",
  text: "\x1b[38;5;252m",
  title: "\x1b[38;5;159m",
  accent: "\x1b[38;5;147m",
  active: "\x1b[38;5;121m",
  warning: "\x1b[38;5;222m",
  error: "\x1b[38;5;203m",
  panel: "\x1b[48;5;236m",
};

const GLYPHS = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
};

const FALLBACK_GLYPHS = {
  topLeft: "+",
  topRight: "+",
  bottomLeft: "+",
  bottomRight: "+",
  horizontal: "-",
  vertical: "|",
};

function glyphs() {
  return output.hasColors?.() === false ? FALLBACK_GLYPHS : GLYPHS;
}

function terminalWidth(max = 100) {
  return Math.max(40, Math.min(output.columns || 80, max));
}

function visibleWidth(value) {
  return stringWidth(stripAnsi(String(value)));
}

function repeat(value, count) {
  return value.repeat(Math.max(0, count));
}

function padVisible(value, width) {
  const padding = Math.max(0, width - visibleWidth(value));
  return `${value}${" ".repeat(padding)}`;
}

function truncateVisible(value, width) {
  const text = String(value);
  if (visibleWidth(text) <= width) return text;

  let result = "";
  for (const char of stripAnsi(text)) {
    if (visibleWidth(`${result}${char}…`) > width) break;
    result += char;
  }
  return `${result}…`;
}

function wrapPlainText(value, width) {
  if (/\x1b\[/.test(String(value))) {
    return String(value)
      .split("\n")
      .map((line) => truncateVisible(line, width));
  }

  const lines = [];
  for (const rawLine of String(value).split("\n")) {
    const words = rawLine.split(/(\s+)/).filter(Boolean);
    let line = "";

    for (const word of words) {
      if (visibleWidth(`${line}${word}`) <= width) {
        line += word;
        continue;
      }

      if (line.trim()) {
        lines.push(line.trimEnd());
        line = "";
      }

      if (visibleWidth(word) <= width) {
        line = word.trimStart();
        continue;
      }

      let chunk = "";
      for (const char of word) {
        if (visibleWidth(`${chunk}${char}`) > width) {
          lines.push(chunk);
          chunk = "";
        }
        chunk += char;
      }
      line = chunk;
    }

    lines.push(line.trimEnd());
  }

  return lines.length ? lines : [""];
}

function writeLine(value = "") {
  output.write(`${value}\n`);
}

function borderLine(width, side = "top", color = UI.border) {
  const g = glyphs();
  const left = side === "top" ? g.topLeft : g.bottomLeft;
  const right = side === "top" ? g.topRight : g.bottomRight;
  return `${color}${left}${repeat(g.horizontal, width - 2)}${right}${ANSI.reset}`;
}

function boxedLines(lines, { width = terminalWidth(), color = UI.border, padding = 1 } = {}) {
  const g = glyphs();
  const innerWidth = width - 2 - padding * 2;
  const pad = " ".repeat(padding);
  const rendered = [borderLine(width, "top", color)];

  for (const line of lines) {
    const wrapped = wrapPlainText(line, innerWidth);
    for (const wrappedLine of wrapped) {
      rendered.push(
        `${color}${g.vertical}${ANSI.reset}${pad}${padVisible(wrappedLine, innerWidth)}${pad}${color}${g.vertical}${ANSI.reset}`,
      );
    }
  }

  rendered.push(borderLine(width, "bottom", color));
  return rendered;
}

export function paint(color, value) {
  return `${color}${value}${ANSI.reset}`;
}

export function header(value) {
  return `${ANSI.bold}${UI.title}${value}${ANSI.reset}`;
}

function label(kind, color) {
  return `${ANSI.bold}${color}${kind}${ANSI.reset}`;
}

export function printInfo(message) {
  writeLine(`${label("info", UI.active)} ${paint(UI.muted, "›")} ${message}`);
}

export function printError(message) {
  writeLine(`${label("error", UI.error)} ${paint(UI.muted, "›")} ${message}`);
}

export function printThinking() {
  output.write(`${paint(UI.muted, "✦ Thinking...")}\r`);
}

export function clearThinking() {
  if (output.isTTY) {
    output.clearLine(0);
    output.cursorTo(0);
  }
}

export function printInputTop() {
  const width = terminalWidth();
  writeLine(borderLine(width, "top", UI.border));
}

export function printInputBottom() {
  const width = terminalWidth();
  output.write(ANSI.reset);
  writeLine(borderLine(width, "bottom", UI.border));
  writeLine();
}

export function printUser() {
  // Readline already echoes the composed prompt. Keeping this no-op preserves the
  // public UI contract for agent-core without duplicating user messages.
}

export function printAssistantLabel() {
  output.write(`${label("assistant", UI.accent)} ${paint(UI.muted, "›")} `);
}

let isInsideCodeBlock = false;

function renderInlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, (_match, code) => paint(ANSI.yellow, code))
    .replace(/\*\*([^*]+)\*\*/g, (_match, bold) => `${ANSI.bold}${bold}${ANSI.reset}`)
    .replace(/\*([^*\n]+)\*/g, (_match, italic) => `${ANSI.italic}${italic}${ANSI.reset}`);
}

export function renderMarkdown(text) {
  if (!text) return "";

  const parts = String(text).split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const code = part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
        const width = terminalWidth();
        return boxedLines(code.split("\n"), {
          width,
          color: ANSI.green,
          padding: 1,
        }).join("\n");
      }
      return renderInlineMarkdown(part);
    })
    .join("");
}

export function printToken(token) {
  let outputToken = token;

  if (token.includes("```")) {
    const parts = token.split("```");
    for (let i = 0; i < parts.length - 1; i += 1) {
      isInsideCodeBlock = !isInsideCodeBlock;
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
    writeLine();
  }
  isInsideCodeBlock = false;
}

function bannerLogo() {
  return [
    "  _      __  __   ____  _             _ _        ",
    " | |    |  \\/  | / ___|| |_ _   _  __| (_) ___   ",
    " | |    | |\\/| | \\___ \\| __| | | |/ _` | |/ _ \\  ",
    " | |___ | |  | |  ___) | |_| |_| | (_| | | (_) | ",
    " |_____||_|  |_| |____/ \\__|\\__,_|\\__,_|_|\\___/  ",
  ];
}

export function printBanner(state) {
  const width = terminalWidth();
  const workspace = basename(state.cwd || process.cwd()) || state.cwd;
  const model = state.model || "No model selected";
  const endpoint = state.baseUrl || "No endpoint configured";

  writeLine();
  for (const line of bannerLogo()) {
    writeLine(`${UI.title}${line}${ANSI.reset}`);
  }

  writeLine();
  writeLine(`${paint(UI.muted, "LM Studio CLI")} ${paint(UI.muted, "•")} ${paint(UI.text, workspace)}`);
  writeLine();

  const summary = [
    `${paint(UI.muted, "Workspace")} ${paint(UI.text, state.cwd)}`,
    `${paint(UI.muted, "Endpoint ")} ${paint(UI.text, endpoint)}`,
    `${paint(UI.muted, "Model    ")} ${paint(model ? UI.text : UI.warning, model)}`,
  ];

  for (const line of boxedLines(summary, { width, color: UI.border })) {
    writeLine(line);
  }

  writeLine();
  writeLine(header("Tips for getting started:"));
  writeLine(`${paint(UI.muted, "1.")} Ask a coding question or request a file change.`);
  writeLine(`${paint(UI.muted, "2.")} Use ${paint(ANSI.yellow, "/models")} to inspect LM Studio models.`);
  writeLine(`${paint(UI.muted, "3.")} Use ${paint(ANSI.yellow, "/help")} for commands.`);
  writeLine(`${paint(UI.muted, "4.")} End a line with ${paint(ANSI.yellow, "\\")} to continue a multi-line prompt.`);
  writeLine();
}

export function printHelp() {
  const commands = [
    { cmd: "/help", desc: "Show available commands" },
    { cmd: "/models", desc: "List available LM Studio models" },
    { cmd: "/load <id>", desc: "Load a model into memory and select it" },
    { cmd: "/unload", desc: "Unload all loaded models" },
    { cmd: "/model <id>", desc: "Set the active model for chat" },
    { cmd: "/system <text>", desc: "Replace the system prompt" },
    { cmd: "/pwd", desc: "Show the active workspace path" },
    { cmd: "/stop", desc: "Cancel current generation or tool execution" },
    { cmd: "/clear", desc: "Clear chat history" },
    { cmd: "/exit", desc: "Quit the CLI" },
    { cmd: "Ctrl+C", desc: "Quit the CLI" },
  ];

  const width = terminalWidth();
  const maxCmdLen = Math.max(...commands.map((command) => visibleWidth(command.cmd)));
  const lines = commands.map(({ cmd, desc }) => {
    const commandText = paint(ANSI.yellow, padVisible(cmd, maxCmdLen));
    return `${commandText} ${paint(UI.muted, "│")} ${desc}`;
  });

  writeLine();
  writeLine(header("Available Commands"));
  for (const line of boxedLines(lines, { width, color: UI.border })) {
    writeLine(line);
  }
  writeLine();
}

export function printModels(models, selectedModel) {
  const width = terminalWidth();
  writeLine();
  writeLine(header("Available Models"));

  if (models.length === 0) {
    for (const line of boxedLines([paint(UI.muted, "No models returned by LM Studio.")], { width, color: UI.border })) {
      writeLine(line);
    }
    writeLine();
    return;
  }

  let anyLoaded = false;
  const lines = models.map((model) => {
    const isSelected = model.id === selectedModel;
    const isLoaded = model.state === "loaded" || model.status === "loaded";
    if (isLoaded) anyLoaded = true;

    const marker = isSelected && isLoaded ? "●" : isSelected ? "◐" : isLoaded ? "◆" : " ";
    const markerColor = isSelected && isLoaded ? UI.active : isSelected ? UI.warning : isLoaded ? ANSI.cyan : UI.muted;
    const stateInfo = isLoaded ? paint(UI.muted, " loaded") : paint(UI.muted, " available");
    return `${paint(markerColor, marker)} ${paint(UI.text, truncateVisible(model.id, width - 18))}${stateInfo}`;
  });

  for (const line of boxedLines(lines, { width, color: UI.border })) {
    writeLine(line);
  }

  writeLine(`${paint(UI.muted, "● loaded and active   ◆ loaded   ◐ active, not loaded")}`);
  if (!anyLoaded) {
    writeLine(paint(UI.warning, "No models appear to be loaded in RAM. Use /load <id> to load one."));
  }
  writeLine();
}

export async function askPermission(rl, message) {
  const width = terminalWidth();
  writeLine();
  for (const line of boxedLines([
    paint(UI.warning, "Action Required"),
    "",
    message,
    "",
    `${paint(UI.active, "y")} allow once    ${paint(UI.error, "n")} deny`,
  ], { width, color: UI.warning })) {
    writeLine(line);
  }

  const answer = (await rl.question(`${label("permission", UI.warning)} ${paint(UI.muted, "›")} Proceed? [y/N] `))
    .trim()
    .toLowerCase();
  return answer === "y" || answer === "yes";
}
