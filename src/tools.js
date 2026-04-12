import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { COMMAND_TIMEOUT_MS, MAX_COMMAND_OUTPUT_BYTES, MAX_READ_BYTES } from "./config.js";
import { resolveWorkspacePath } from "./path-utils.js";

const execFileAsync = promisify(execFile);

function trimToolOutput(value, maxBytes = MAX_COMMAND_OUTPUT_BYTES) {
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

export async function runToolRequest(state, request) {
  const relativePath = typeof request.path === "string" ? request.path : ".";
  const targetPath = request.tool === "pwd" ? state.cwd : resolveWorkspacePath(state.cwd, relativePath);

  switch (request.tool) {
    case "pwd":
      return {
        ok: true,
        tool: "pwd",
        output: state.cwd,
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
        tool: "list_files",
        path: relativePath,
        output: lines.length > 0 ? lines.join("\n") : "(empty directory)",
      };
    }
    case "read_file": {
      const stats = await fs.stat(targetPath);

      if (!stats.isFile()) {
        throw new Error("Target is not a file.");
      }

      const content = await fs.readFile(targetPath, "utf8");
      return {
        ok: true,
        tool: "read_file",
        path: relativePath,
        output: content.slice(0, MAX_READ_BYTES),
      };
    }
    case "write_file": {
      if (typeof request.content !== "string") {
        throw new Error("write_file requires string content.");
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, request.content, "utf8");
      return {
        ok: true,
        tool: "write_file",
        path: relativePath,
        output: `Wrote ${request.content.length} characters.`,
      };
    }
    case "make_directory":
      await fs.mkdir(targetPath, { recursive: true });
      return {
        ok: true,
        tool: "make_directory",
        path: relativePath,
        output: "Directory created.",
      };
    case "delete_file": {
      const stats = await fs.stat(targetPath);

      if (!stats.isFile()) {
        throw new Error("delete_file only supports files.");
      }

      await fs.unlink(targetPath);
      return {
        ok: true,
        tool: "delete_file",
        path: relativePath,
        output: "File deleted.",
      };
    }
    case "run_terminal_command": {
      if (typeof request.command !== "string" || !request.command.trim()) {
        throw new Error("run_terminal_command requires a non-empty command string.");
      }

      const shell = getShellInvocation(request.command);

      try {
        const { stdout, stderr } = await execFileAsync(shell.file, shell.args, {
          cwd: state.cwd,
          timeout: COMMAND_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: MAX_COMMAND_OUTPUT_BYTES * 4,
        });

        return {
          ok: true,
          tool: "run_terminal_command",
          command: request.command,
          output: [
            `Exit code: 0`,
            stdout ? `STDOUT:\n${trimToolOutput(stdout)}` : "",
            stderr ? `STDERR:\n${trimToolOutput(stderr)}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        };
      } catch (error) {
        const stdout = typeof error.stdout === "string" ? trimToolOutput(error.stdout) : "";
        const stderr = typeof error.stderr === "string" ? trimToolOutput(error.stderr) : "";
        const exitCode = error.code ?? "unknown";

        return {
          ok: false,
          tool: "run_terminal_command",
          command: request.command,
          error: [
            `Exit code: ${exitCode}`,
            stdout ? `STDOUT:\n${stdout}` : "",
            stderr ? `STDERR:\n${stderr}` : "",
            error.message ? `Error: ${error.message}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        };
      }
    }
    default:
      throw new Error(`Unsupported tool: ${request.tool}`);
  }
}

export function formatToolFallback(result) {
  if (!result || !result.ok) {
    return result?.error ? `Tool failed: ${result.error}` : "The requested tool did not complete successfully.";
  }

  switch (result.tool) {
    case "pwd":
      return `The active workspace is:\n${result.output}`;
    case "list_files":
      return `Here are the files and folders in ${result.path || "."}:\n${result.output}`;
    case "read_file":
      return `Contents of ${result.path}:\n${result.output}`;
    case "write_file":
      return `Created or updated ${result.path}.`;
    case "make_directory":
      return `Created directory ${result.path}.`;
    case "delete_file":
      return `Deleted ${result.path}.`;
    case "run_terminal_command":
      return result.ok
        ? `Command completed:\n${result.output}`
        : `Command failed:\n${result.error}`;
    default:
      return typeof result.output === "string" ? result.output : "The tool completed successfully.";
  }
}
