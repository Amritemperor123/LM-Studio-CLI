import path from "node:path";

export function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function resolveLaunchDirectory(argument) {
  return argument ? path.resolve(argument) : process.cwd();
}

export function isPathInsideRoot(rootDirectory, targetPath) {
  const relativePath = path.relative(rootDirectory, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function resolveWorkspacePath(rootDirectory, relativePath = ".") {
  const candidatePath = path.resolve(rootDirectory, relativePath);

  if (!isPathInsideRoot(rootDirectory, candidatePath)) {
    throw new Error("Path is outside the active workspace.");
  }

  return candidatePath;
}
