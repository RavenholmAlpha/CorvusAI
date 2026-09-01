import { relative, resolve } from "node:path";

export interface SandboxConfig {
  workspaceRoot?: string;
  allowedShellCommands?: string[];
}

export function checkPathAllowed(
  path: string,
  workspaceRoot: string | undefined,
): string | undefined {
  if (!workspaceRoot) return undefined;
  const root = resolve(workspaceRoot);
  const target = resolve(path);
  const rel = relative(root, target);
  if (rel === "" || (!rel.startsWith("..") && !target.startsWith(".."))) {
    return undefined;
  }
  return 'Path "' + path + '" is outside the allowed workspace "' + root + '"';
}

export function checkShellCommandAllowed(
  command: string,
  config: SandboxConfig,
): string | undefined {
  const allowlist = config.allowedShellCommands;
  if (!allowlist || allowlist.length === 0) return undefined;
  const executable = command.trim().split(/\s+/)[0] ?? "";
  const allowed = allowlist.some((entry) => executable === entry || executable.startsWith(entry + " "));
  if (allowed) return undefined;
  return "Shell command \"" + executable + "\" is not in the allowed list";
}