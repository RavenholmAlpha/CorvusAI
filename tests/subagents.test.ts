import { describe, expect, it } from "vitest";
import { SubagentManager } from "../src/subagents.js";

describe("SubagentManager", () => {
  it("records a completed child task with its dedicated child session", async () => {
    const manager = new SubagentManager({ maxConcurrent: 2, maxDepth: 2 });
    const result = await manager.run("parent-session", "inspect module", "inspection", async (depth, taskId) => ({
      childSessionId: "child-" + taskId,
      result: "done depth=" + depth,
    }));
    expect(result.result).toBe("done depth=1");
    expect(result.task.status).toBe("succeeded");
    expect(result.task.childSessionId).toMatch(/^child-task_/);
    expect(manager.list()).toEqual([expect.objectContaining({ parentSessionId: "parent-session", status: "succeeded" })]);
  });

  it("rejects recursive delegation beyond its depth limit", async () => {
    const manager = new SubagentManager({ maxConcurrent: 2, maxDepth: 1 });
    await expect(manager.run("root", "parent", undefined, async () => {
      return manager.run("root", "child", undefined, async () => ({ childSessionId: "child", result: "nope" }));
    })).rejects.toThrow("nesting limit");
  });

  it("cancels a running task and aborts its signal", async () => {
    const manager = new SubagentManager({ maxConcurrent: 1, maxDepth: 2 });
    let taskId = "";
    const running = manager.run("root", "long task", undefined, async (_depth, id, signal) => {
      taskId = id;
      await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      return { childSessionId: "never", result: "never" };
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(manager.cancel(taskId)).toEqual(expect.objectContaining({ status: "canceled" }));
    await expect(running).rejects.toThrow("aborted");
    expect(manager.get(taskId)).toEqual(expect.objectContaining({ status: "canceled", error: "Canceled by user" }));
  });

  it("rejects work above its concurrent task limit", async () => {
    const manager = new SubagentManager({ maxConcurrent: 1, maxDepth: 2 });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    const first = manager.run("root", "one", undefined, async () => {
      await blocker;
      return { childSessionId: "one", result: "one" };
    });
    await expect(manager.run("root", "two", undefined, async () => ({ childSessionId: "two", result: "two" }))).rejects.toThrow("concurrency limit");
    release();
    await first;
  });
});
