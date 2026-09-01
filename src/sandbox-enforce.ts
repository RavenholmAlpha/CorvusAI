import type { CorvusConfig } from "./config.js";
import { checkPathAllowed, checkShellCommandAllowed } from "./sandbox.js";

let activeSandbox: CorvusConfig["sandbox"];

export function setSandboxConfig(sandbox: CorvusConfig["sandbox"]): void {
  activeSandbox = sandbox;
}

export function enforcePathSandbox(path: string): string | undefined {
  return checkPathAllowed(path, activeSandbox?.workspaceRoot);
}

export function enforceShellSandbox(command: string): string | undefined {
  return checkShellCommandAllowed(command, {
    workspaceRoot: activeSandbox?.workspaceRoot,
    allowedShellCommands: activeSandbox?.allowedShellCommands,
  });
}