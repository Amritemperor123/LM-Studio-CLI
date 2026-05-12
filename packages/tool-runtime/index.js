import fs from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { RUNTIME_LIMITS, RESULT_TYPES, ERROR_CODES, TOOL_SAFETY_CLASSES } from "../shared/config.js";
import { resolveWorkspacePath } from "../shared/path-utils.js";
import { logger } from "../shared/logger.js";

const execFileAsync = promisify(execFile);

export const TOOL_REGISTRY = {
  pwd: { safety: TOOL_SAFETY_CLASSES.SAFE },
  list_files: { safety: TOOL_SAFETY_CLASSES.SAFE },
  read_file: { safety: TOOL_SAFETY_CLASSES.SAFE },
  write_file: { safety: TOOL_SAFETY_CLASSES.MUTATING },
  append_file: { safety: TOOL_SAFETY_CLASSES.MUTATING },
  move_file: { safety: TOOL_SAFETY_CLASSES.DESTRUCTIVE },
  make_directory: { safety: TOOL_SAFETY_CLASSES.MUTATING },
  delete_file: { safety: TOOL_SAFETY_CLASSES.DESTRUCTIVE },
  search_files: { safety: TOOL_SAFETY_CLASSES.SAFE },
  run_terminal_command: { safety: TOOL_SAFETY_CLASSES.TERMINAL },
  git_status: { safety: TOOL_SAFETY_CLASSES.SAFE },
  git_diff: { safety: TOOL_SAFETY_CLASSES.SAFE },
};

function trimToolOutput(value, maxBytes = RUNTIME_LIMITS.maxCommandOutputBytes) {
  if (typeof value !== "string") {
    return "";
  }

  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }

  return `${value.slice(0, maxBytes)}\n...[output truncated]`;
}

function getShellInvocation(command) {
  if (process.platform === "win32") {
    return {
      file: "powershell",
      args: ["-NoProfile", "-Command", command],
    };
  }

  return {
    file: "sh",
    args: ["-lc", command],
  };
}

async function runGrep(state, query, targetPath) {
  const shell = getShellInvocation(`grep -rIn "${query.replace(/"/g, '\\"')}" "${targetPath}"`);
  try {
    const { stdout, stderr } = await execFileAsync(shell.file, shell.args, {
      cwd: state.cwd,
      timeout: RUNTIME_LIMITS.commandTimeoutMs,
      windowsHide: true,
    });
    return stdout || stderr || "No matches found.";
  } catch (error) {
    if (error.code === 1 && !error.stdout && !error.stderr) {
      return "No matches found.";
    }
    throw error;
  }
}

export async function runToolRequest(state, request) {
  const relativePath = typeof request.path === "string" ? request.path : ".";
  const targetPath = request.tool === "pwd" ? state.cwd : resolveWorkspacePath(state.cwd, relativePath);

  logger.debug(`Executing tool: ${request.tool} on ${relativePath}`);

  try {
    switch (request.tool) {
      case "pwd":
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "pwd",
          data: state.cwd,
        };
      case "list_files": {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        const lines = entries
          .map((entry) => {
            const entryPath = path.relative(state.cwd, path.join(targetPath, entry.name)) || entry.name;
            return `${entry.isDirectory() ? "[dir]" : "[file]"} ${entryPath}`;
          })
          .sort((left, right) => left.localeCompare(right));

        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "list_files",
          path: relativePath,
          data: lines.length > 0 ? lines.join("\n") : "(empty directory)",
        };
      }
      case "read_file": {
        const stats = await fs.stat(targetPath);
        if (!stats.isFile()) throw new Error("Target is not a file.");

        const content = await fs.readFile(targetPath, "utf8");
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "read_file",
          path: relativePath,
          data: content.slice(0, RUNTIME_LIMITS.maxReadBytes),
        };
      }
      case "write_file": {
        if (typeof request.content !== "string") throw new Error("write_file requires content.");
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, request.content, "utf8");
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "write_file",
          path: relativePath,
          data: `Wrote ${request.content.length} characters.`,
        };
      }
      case "append_file": {
        if (typeof request.content !== "string") throw new Error("append_file requires content.");
        await fs.appendFile(targetPath, request.content, "utf8");
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "append_file",
          path: relativePath,
          data: `Appended ${request.content.length} characters.`,
        };
      }
      case "move_file": {
        const fromPath = targetPath;
        const toPath = resolveWorkspacePath(state.cwd, request.to);
        if (!request.overwrite) {
          try {
            await fs.access(toPath);
            throw new Error(`Target path ${request.to} already exists. Set overwrite: true to proceed.`);
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
        }
        await fs.mkdir(path.dirname(toPath), { recursive: true });
        await fs.rename(fromPath, toPath);
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "move_file",
          data: `Moved ${relativePath} to ${request.to}.`,
        };
      }
      case "make_directory":
        await fs.mkdir(targetPath, { recursive: true });
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "make_directory",
          path: relativePath,
          data: "Directory created.",
        };
      case "delete_file": {
        const stats = await fs.stat(targetPath);
        if (!stats.isFile()) throw new Error("delete_file only supports files.");
        await fs.unlink(targetPath);
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "delete_file",
          path: relativePath,
          data: "File deleted.",
        };
      }
      case "search_files": {
        if (typeof request.query !== "string") throw new Error("search_files requires query.");
        const output = await runGrep(state, request.query, targetPath);
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "search_files",
          data: trimToolOutput(output),
        };
      }
      case "git_status": {
        const shell = getShellInvocation("git status --short");
        const { stdout } = await execFileAsync(shell.file, shell.args, { cwd: state.cwd });
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "git_status",
          data: stdout || "No changes (clean working tree).",
        };
      }
      case "git_diff": {
        const shell = getShellInvocation(`git diff ${relativePath !== "." ? `"${relativePath}"` : ""}`);
        const { stdout } = await execFileAsync(shell.file, shell.args, { cwd: state.cwd });
        return {
          ok: true,
          type: RESULT_TYPES.TOOL,
          tool: "git_diff",
          data: stdout || "No differences.",
        };
      }
      case "run_terminal_command": {
        if (typeof request.command !== "string" || !request.command.trim()) {
          throw new Error("run_terminal_command requires a non-empty command string.");
        }

        const shell = getShellInvocation(request.command);
        
        return new Promise((resolve) => {
          let stdout = "";
          let stderr = "";
          let killed = false;

          const child = spawn(shell.file, shell.args, {
            cwd: state.cwd,
            windowsHide: true,
          });

          if (state.currentRun) {
            state.currentRun.activeProcess = child;
          }

          const timeout = setTimeout(() => {
            killed = true;
            child.kill();
            logger.warn(`Terminal command timed out after ${RUNTIME_LIMITS.commandTimeoutMs}ms`);
          }, RUNTIME_LIMITS.commandTimeoutMs);

          child.stdout.on("data", (data) => {
            stdout += data.toString();
          });

          child.stderr.on("data", (data) => {
            stderr += data.toString();
          });

          child.on("close", (code) => {
            clearTimeout(timeout);
            if (state.currentRun && state.currentRun.activeProcess === child) {
              state.currentRun.activeProcess = null;
            }

            const wasCancelled = state.currentRun?.cancelled || killed;

            if (wasCancelled) {
              resolve({
                ok: false,
                type: RESULT_TYPES.TOOL,
                tool: "run_terminal_command",
                command: request.command,
                error: {
                  code: wasCancelled && !killed ? ERROR_CODES.CANCELLATION : ERROR_CODES.TIMEOUT,
                  message: `Command ${wasCancelled && !killed ? "cancelled" : "timed out"}.\n\nSTDOUT:\n${trimToolOutput(stdout)}\n\nSTDERR:\n${trimToolOutput(stderr)}`,
                },
              });
            } else {
              resolve({
                ok: code === 0,
                type: RESULT_TYPES.TOOL,
                tool: "run_terminal_command",
                command: request.command,
                data: [
                  `Exit code: ${code}`,
                  stdout ? `STDOUT:\n${trimToolOutput(stdout)}` : "",
                  stderr ? `STDERR:\n${trimToolOutput(stderr)}` : "",
                ]
                  .filter(Boolean)
                  .join("\n\n"),
                ...(code !== 0 ? {
                  error: {
                    code: ERROR_CODES.TOOL_EXECUTION_ERROR,
                    message: `Command failed with exit code ${code}.\n\nSTDOUT:\n${trimToolOutput(stdout)}\n\nSTDERR:\n${trimToolOutput(stderr)}`
                  }
                } : {})
              });
            }
          });

          child.on("error", (error) => {
            clearTimeout(timeout);
            if (state.currentRun && state.currentRun.activeProcess === child) {
              state.currentRun.activeProcess = null;
            }
            resolve({
              ok: false,
              type: RESULT_TYPES.TOOL,
              tool: "run_terminal_command",
              command: request.command,
              error: {
                code: ERROR_CODES.TOOL_EXECUTION_ERROR,
                message: error.message,
              },
            });
          });
        });
      }
      default:
        return {
          ok: false,
          type: RESULT_TYPES.TOOL,
          tool: request.tool,
          error: {
            code: ERROR_CODES.TOOL_VALIDATION_ERROR,
            message: `Unsupported tool: ${request.tool}`,
          },
        };
    }
  } catch (error) {
    logger.error(`Tool execution failed: ${request.tool}`, error);
    return {
      ok: false,
      type: RESULT_TYPES.TOOL,
      tool: request.tool,
      path: relativePath,
      error: {
        code: ERROR_CODES.TOOL_EXECUTION_ERROR,
        message: error.message,
      },
    };
  }
}

export function formatToolFallback(result) {
  if (!result || !result.ok) {
    return result?.error?.message ? `Tool failed: ${result.error.message}` : "The requested tool did not complete successfully.";
  }

  switch (result.tool) {
    case "pwd":
      return `The active workspace is:\n${result.data}`;
    case "list_files":
      return `Here are the files and folders in ${result.path || "."}:\n${result.data}`;
    case "read_file":
      return `Contents of ${result.path}:\n${result.data}`;
    case "write_file":
      return `Created or updated ${result.path}.`;
    case "append_file":
      return `Appended to ${result.path}.`;
    case "move_file":
      return result.data;
    case "make_directory":
      return `Created directory ${result.path}.`;
    case "delete_file":
      return `Deleted ${result.path}.`;
    case "search_files":
      return `Search results:\n${result.data}`;
    case "git_status":
      return `Git Status:\n${result.data}`;
    case "git_diff":
      return `Git Diff:\n${result.data}`;
    case "run_terminal_command":
      return result.ok
        ? `Command completed:\n${result.data}`
        : `Command failed:\n${result.error.message}`;
    default:
      return typeof result.data === "string" ? result.data : "The tool completed successfully.";
  }
}
