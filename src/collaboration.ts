import { resolve, relative } from "node:path";
import type { RunStore } from "./harness/run-store.js";

function matches(pattern: string, scope: string): boolean {
  const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp("^" + escaped + "$").test(scope);
}

/** Collaboration write gate adapted from Vault scope leases. */
export class ScopeLeaseCoordinator {
  private readonly allowedScopes = new Map<string, string[]>();
  constructor(private readonly runs: RunStore, private readonly taskId: () => string | undefined, private readonly workspaceRoot: (taskId: string) => string) {}
  setTaskPolicy(taskId: string, allowedScopes?: string[]): void { if (allowedScopes?.length) this.allowedScopes.set(taskId, allowedScopes); }
  claimPath(path: string): void {
    const taskId = this.taskId(); if (!taskId) return;
    const root = resolve(this.workspaceRoot(taskId)); const absolute = resolve(path); const rel = relative(root, absolute).replace(/\\/g, "/");
    const scope = "file:" + (rel && !rel.startsWith("..") ? rel : absolute.replace(/\\/g, "/"));
    const policy = this.allowedScopes.get(taskId);
    if (policy && !policy.some((pattern) => matches(pattern, scope))) throw new Error("SCOPE_DENIED: " + scope + " is outside role allowedScopes");
    this.runs.claimScopeLease(taskId, scope);
  }
  releaseTask(taskId: string): void { this.allowedScopes.delete(taskId); this.runs.releaseScopeLeases(taskId); }
}