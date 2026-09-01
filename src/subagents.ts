import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type SubagentTaskStatus = "running" | "succeeded" | "failed" | "canceled";

export interface SubagentTaskRecord {
  id: string; parentSessionId: string; childSessionId: string; prompt: string; description: string | null; depth: number; status: SubagentTaskStatus; startedAt: string; completedAt: string | null; error: string | null;
}

export interface SubagentTaskResult { task: SubagentTaskRecord; result: string; }
export interface SubagentLimits { maxConcurrent: number; maxDepth: number; }
const DEFAULT_LIMITS: SubagentLimits = { maxConcurrent: 3, maxDepth: 2 };

/** Coordinates task delegation, cancellation, and task identity in async context. */
export class SubagentManager {
  private readonly tasks = new Map<string, SubagentTaskRecord>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly context = new AsyncLocalStorage<{ depth: number; parentSessionId: string; taskId?: string }>();
  constructor(private readonly limits: SubagentLimits = DEFAULT_LIMITS) {}
  list(): SubagentTaskRecord[] { return [...this.tasks.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
  get(taskId: string): SubagentTaskRecord | undefined { return this.tasks.get(taskId); }
  activeCount(): number { return this.list().filter((task) => task.status === "running").length; }
  currentDepth(): number { return this.context.getStore()?.depth ?? 0; }
  currentParentSessionId(): string | undefined { return this.context.getStore()?.parentSessionId; }
  currentTaskId(): string | undefined { return this.context.getStore()?.taskId; }
  bindChildSession(taskId: string, childSessionId: string): void { const task = this.tasks.get(taskId); if (task) this.tasks.set(taskId, { ...task, childSessionId }); }
  cancel(taskId: string): SubagentTaskRecord | undefined {
    const task = this.tasks.get(taskId); if (!task || task.status !== "running") return task;
    this.controllers.get(taskId)?.abort();
    const canceled = { ...task, status: "canceled" as const, completedAt: new Date().toISOString(), error: "Canceled by user" };
    this.tasks.set(taskId, canceled); return canceled;
  }
  async runInChildSession<T>(childSessionId: string, task: () => Promise<T>): Promise<T> {
    const context = this.context.getStore();
    return this.context.run({ depth: this.currentDepth(), parentSessionId: childSessionId, taskId: context?.taskId }, task);
  }
  async run<T extends { childSessionId: string; result: string }>(parentSessionId: string, prompt: string, description: string | undefined, work: (depth: number, taskId: string, signal: AbortSignal) => Promise<T>): Promise<SubagentTaskResult> {
    const depth = this.currentDepth() + 1;
    if (depth > this.limits.maxDepth) throw new Error("Sub-agent nesting limit reached (max depth " + this.limits.maxDepth + ").");
    if (this.activeCount() >= this.limits.maxConcurrent) throw new Error("Sub-agent concurrency limit reached (max " + this.limits.maxConcurrent + ").");
    const id = "task_" + randomUUID().replace(/-/g, "");
    let record: SubagentTaskRecord = { id, parentSessionId, childSessionId: "", prompt, description: description?.trim() || null, depth, status: "running", startedAt: new Date().toISOString(), completedAt: null, error: null };
    const controller = new AbortController(); this.tasks.set(id, record); this.controllers.set(id, controller);
    try {
      const output = await this.context.run({ depth, parentSessionId, taskId: id }, () => work(depth, id, controller.signal));
      const canceled = this.tasks.get(id)?.status === "canceled" || controller.signal.aborted;
      record = { ...record, childSessionId: output.childSessionId, status: canceled ? "canceled" : "succeeded", completedAt: new Date().toISOString(), error: canceled ? "Canceled by user" : null };
      this.tasks.set(id, record); return { task: record, result: output.result };
    } catch (error) {
      const canceled = controller.signal.aborted || this.tasks.get(id)?.status === "canceled";
      record = { ...record, status: canceled ? "canceled" : "failed", completedAt: new Date().toISOString(), error: canceled ? "Canceled by user" : (error as Error).message };
      this.tasks.set(id, record); throw error;
    } finally { this.controllers.delete(id); }
  }
}