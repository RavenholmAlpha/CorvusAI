import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { EventLog } from "../src/harness/event-log.js";
import { RunStore } from "../src/harness/run-store.js";

const roots: string[] = [];
const databases: CorvusDatabase[] = [];

afterEach(async () => {
  for (const db of databases) if (db.open) db.close();
  databases.length = 0;
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("project and session persistence", () => {
  it("creates project-scoped sessions and links runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-project-"));
    roots.push(root);
    const db = openCorvusDatabase(join(root, "corvus.db"));
    databases.push(db);
    ensureDatabase(db);
    const events = new EventLog(db);
    const store = new RunStore(db, events);

    const project = store.createProject("Desktop Project", "D:/work/desktop-project");
    const session = store.createSession(project.id, "Architecture");
    const run = store.createRun({
      goal: "Design architecture",
      model: "test-model",
      endpoint: "https://example.test/v1",
      sessionId: session.id,
    });
    store.appendMessage({ runId: run.id, role: "user", content: "Design the system" });
    store.appendMessage({ runId: run.id, role: "assistant", content: "Here is the plan" });

    expect(store.listProjects()).toEqual([expect.objectContaining({ id: project.id, name: "Desktop Project" })]);
    expect(store.listSessions(project.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: session.id, projectId: project.id, messageCount: 2, preview: "Design the system" }),
      expect.objectContaining({ projectId: project.id, kind: "project_main" }),
    ]));
    expect(store.listAgents()).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "master" }), expect.objectContaining({ kind: "project", projectId: project.id })]));
    expect(store.listSessionMessages(session.id).map((m) => m.content)).toEqual(["Design the system", "Here is the plan"]);
    expect(store.getRun(run.id)?.sessionId).toBe(session.id);
  });

  it("persists a parent-child subagent task record", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-subtask-"));
    roots.push(root);
    const db = openCorvusDatabase(join(root, "corvus.db"));
    databases.push(db);
    ensureDatabase(db);
    const store = new RunStore(db, new EventLog(db));
    const project = store.createProject("Project", "D:/work/project");
    const parent = store.createSession(project.id, "Parent");
    const child = store.createSession(project.id, "Child task");
    const parentRun = store.createRun({ goal: "Parent goal", model: "m", endpoint: "e", sessionId: parent.id });

    store.createSubagentTask({
      id: "task_test", parentRunId: parentRun.id, parentSessionId: parent.id,
      childSessionId: child.id, prompt: "Analyze one module", description: "Module analysis", depth: 1,
    });
    const done = store.updateSubagentTask("task_test", "succeeded");

    expect(done).toEqual(expect.objectContaining({ parentRunId: parentRun.id, parentSessionId: parent.id, childSessionId: child.id, status: "succeeded" }));
    expect(store.listSubagentTasks(parent.id)).toEqual([expect.objectContaining({ id: "task_test", description: "Module analysis" })]);
  });

  it("prevents concurrent child tasks from holding the same write scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-lease-"));
    roots.push(root);
    const db = openCorvusDatabase(join(root, "corvus.db"));
    databases.push(db);
    ensureDatabase(db);
    const store = new RunStore(db, new EventLog(db));
    const project = store.createProject("Project", "D:/work/project");
    const parent = store.createSession(project.id, "Parent");
    const childA = store.createSession(project.id, "Child A");
    const childB = store.createSession(project.id, "Child B");
    store.createSubagentTask({ id: "task_a", parentSessionId: parent.id, childSessionId: childA.id, prompt: "A", depth: 1 });
    store.createSubagentTask({ id: "task_b", parentSessionId: parent.id, childSessionId: childB.id, prompt: "B", depth: 1 });
    const lease = store.claimScopeLease("task_a", "file:src/ui/App.tsx");
    expect(lease.status).toBe("active");
    expect(() => store.claimScopeLease("task_b", "file:src/ui/App.tsx")).toThrow("SCOPE_CONFLICT");
    store.releaseScopeLeases("task_a");
    expect(store.claimScopeLease("task_b", "file:src/ui/App.tsx")).toMatchObject({ taskId: "task_b", status: "active", expiresAt: expect.any(String) });
    store.releaseScopeLeases("task_b");
    const parentLease = store.claimScopeLease("task_a", "dir:src/ui", 60);
    const childLease = store.claimScopeLease("task_b", "dir:src/ui/components", 60);
    expect(parentLease.conflictLevel).toBe("none");
    expect(childLease.conflictLevel).toBe("hierarchical");
    store.heartbeatScopeLease(childLease.id, 120);
    expect(store.listScopeLeases("task_b")[0]?.heartbeatAt).toEqual(expect.any(String));
  });

  it("stores reusable project handoff memory", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-memory-"));
    roots.push(root);
    const db = openCorvusDatabase(join(root, "corvus.db"));
    databases.push(db);
    ensureDatabase(db);
    const store = new RunStore(db, new EventLog(db));
    const project = store.createProject("Project", "D:/work/project");
    const memory = store.createProjectMemory({
      projectId: project.id, kind: "pitfall", title: "Ink long output",
      content: "Use line-level viewport for long terminal output.", confidence: 0.95,
    });
    const decision = store.createProjectMemory({ projectId: project.id, kind: "decision", title: "Viewport design", content: "Use line-level viewport.", confidence: 0.9 });
    store.linkProjectMemories(decision.id, memory.id, "supports");
    expect(store.listProjectMemories(project.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: memory.id, kind: "pitfall", confidence: 0.95 }), expect.objectContaining({ id: decision.id, kind: "decision" })]));
    const session=store.createSession(project.id,"Checkpoint");store.bindChannelSession("telegram","chat-1","thread-1",session.id);expect(store.resolveChannelSession("telegram","chat-1","thread-1")?.id).toBe(session.id);const checkpoint=store.createContextCheckpoint(session.id,"Summary of completed work",12);expect(store.latestContextCheckpoint(session.id)).toEqual(checkpoint);
    expect(store.listProjectMemoryLinks(project.id)).toEqual([{ memoryId: decision.id, relatedMemoryId: memory.id, relation: "supports" }]);
    expect(store.searchProjectMemories("terminal output viewport", project.id).map((item) => item.id)).toContain(memory.id);
    expect(memory).toMatchObject({ scope: "project", sourceType: "manual", verified: false, sensitivity: "normal", contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(store.searchProjectMemories("unrelated phrase", project.id)).toEqual([]);
    const secret = store.createProjectMemory({ projectId: project.id, kind: "decision", title: "Secret deployment token", content: "sensitive deployment credential", sensitivity: "sensitive" });
    expect(store.searchProjectMemories("deployment credential", project.id)).toEqual([]);
    expect(store.searchProjectMemories("deployment credential", project.id, 20, { includeSensitive: true })).toEqual([expect.objectContaining({ id: secret.id, sensitivity: "sensitive" })]);
  });
});
