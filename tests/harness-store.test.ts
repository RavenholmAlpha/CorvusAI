import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import {
  EventLog as ExportedEventLog,
  EvidenceStore as ExportedEvidenceStore,
  RunStore as ExportedRunStore,
} from "../src/index.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { RunStore } from "../src/harness/run-store.js";
import { newId, nowIso } from "../src/harness/types.js";

const roots: string[] = [];
const databases: CorvusDatabase[] = [];

afterEach(async () => {
  for (const db of databases) {
    if (db.open) {
      db.close();
    }
  }
  databases.length = 0;
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function createStores(): Promise<{
  db: CorvusDatabase;
  events: EventLog;
  runs: RunStore;
  evidence: EvidenceStore;
}> {
  const root = await mkdtemp(join(tmpdir(), "corvus-store-"));
  roots.push(root);
  const db = openCorvusDatabase(join(root, "corvus.db"));
  databases.push(db);
  ensureDatabase(db);
  const events = new EventLog(db);
  const runs = new RunStore(db, events);
  const evidence = new EvidenceStore(db, events);
  return { db, events, runs, evidence };
}

describe("durable harness stores", () => {
  it("exports store classes from the package entry point", () => {
    expect(ExportedEventLog).toBe(EventLog);
    expect(ExportedRunStore).toBe(RunStore);
    expect(ExportedEvidenceStore).toBe(EvidenceStore);
  });

  it("generates prefixed ids and ISO timestamps", () => {
    const first = newId("run");
    const second = newId("run");
    const timestamp = nowIso();

    expect(first).toMatch(/^run_[0-9a-f]{32}$/);
    expect(second).toMatch(/^run_[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it("round-trips JSON event payloads for a run in creation order", async () => {
    const { events, runs } = await createStores();
    const run = runs.createRun({ goal: "event goal", model: "test-model", endpoint: "https://example.test/v1" });

    const first = events.append("custom.first", { nested: { value: 1 }, items: ["a", "b"] }, run.id);
    const second = events.append("custom.second", { ok: true }, run.id);
    events.append("custom.global", { ignored: true });

    expect(events.listEvents(run.id).map((event) => event.id)).toEqual([
      expect.any(String),
      first.id,
      second.id,
    ]);
    expect(events.listEvents(run.id)).toEqual([
      expect.objectContaining({
        type: "run.created",
        payload: { runId: run.id, goal: "event goal", model: "test-model", endpoint: "https://example.test/v1" },
      }),
      expect.objectContaining({ id: first.id, payload: { nested: { value: 1 }, items: ["a", "b"] } }),
      expect.objectContaining({ id: second.id, payload: { ok: true } }),
    ]);
  });

  it("creates, lists, and updates runs with camelCase row fields and lifecycle events", async () => {
    const { events, runs } = await createStores();

    const first = runs.createRun({ goal: "first goal", model: "model-a", endpoint: "https://example.test/a" });
    const second = runs.createRun({ goal: "second goal", model: "model-b", endpoint: "https://example.test/b" });
    const updated = runs.updateRunStatus(first.id, "succeeded");

    expect(first).toMatchObject({
      id: expect.stringMatching(/^run_[0-9a-f]{32}$/),
      status: "created",
      goal: "first goal",
      model: "model-a",
      endpoint: "https://example.test/a",
      completedAt: null,
    });
    expect(first.createdAt).toEqual(expect.any(String));
    expect(first.updatedAt).toEqual(expect.any(String));
    expect(updated).toMatchObject({ id: first.id, status: "succeeded", completedAt: expect.any(String) });
    expect(runs.getRun(first.id)).toEqual(updated);
    expect(runs.listRuns().map((run) => run.id)).toEqual([first.id, second.id]);
    expect(events.listEvents(first.id).map((event) => event.type)).toEqual(["run.created", "run.status_changed"]);
    expect(events.listEvents(first.id)[1]?.payload).toMatchObject({
      runId: first.id,
      status: "succeeded",
      previousStatus: "created",
    });
  });

  it("creates ordered steps, messages, and snapshots for a run", async () => {
    const { events, runs } = await createStores();
    const run = runs.createRun({ goal: "state goal", model: "test-model", endpoint: "https://example.test/v1" });

    const firstStep = runs.createStep({ runId: run.id, kind: "model", status: "running", title: "Model turn" });
    const secondStep = runs.createStep({ runId: run.id, kind: "tool", status: "created", title: "Tool call" });
    const userMessage = runs.appendMessage({ runId: run.id, role: "user", content: "hello" });
    const toolMessage = runs.appendMessage({
      runId: run.id,
      role: "tool",
      content: "tool output",
      toolCallId: "call_123",
    });
    const firstSnapshot = runs.writeSnapshot(run.id, { mode: "first", stepId: firstStep.id });
    const latestSnapshot = runs.writeSnapshot(run.id, { mode: "latest", stepId: secondStep.id });

    expect(firstStep).toMatchObject({
      id: expect.stringMatching(/^step_[0-9a-f]{32}$/),
      runId: run.id,
      index: 0,
      kind: "model",
      status: "running",
      title: "Model turn",
      createdAt: expect.any(String),
      startedAt: expect.any(String),
      completedAt: null,
    });
    expect(secondStep).toMatchObject({ runId: run.id, index: 1, startedAt: null });
    expect(userMessage).toMatchObject({
      id: expect.stringMatching(/^msg_[0-9a-f]{32}$/),
      runId: run.id,
      role: "user",
      content: "hello",
      toolCallId: null,
      createdAt: expect.any(String),
    });
    expect(toolMessage).toMatchObject({ role: "tool", toolCallId: "call_123" });
    expect(runs.listMessages(run.id)).toEqual([userMessage, toolMessage]);
    expect(firstSnapshot).toMatchObject({
      id: expect.stringMatching(/^snap_[0-9a-f]{32}$/),
      runId: run.id,
      snapshot: { mode: "first", stepId: firstStep.id },
      createdAt: expect.any(String),
    });
    expect(runs.latestSnapshot(run.id)).toEqual(latestSnapshot);
    expect(events.listEvents(run.id).map((event) => event.type)).toEqual([
      "run.created",
      "step.created",
      "step.created",
      "message.created",
      "message.created",
      "snapshot.created",
      "snapshot.created",
    ]);
  });

  it("creates, gets, and lists evidence with creation events", async () => {
    const { events, evidence, runs } = await createStores();
    const run = runs.createRun({ goal: "evidence goal", model: "test-model", endpoint: "https://example.test/v1" });

    const first = evidence.createEvidence({
      runId: run.id,
      sourceType: "system",
      sourceId: "setup",
      title: "Setup note",
      summary: "Prepared",
      content: "Full setup details",
    });
    const second = evidence.createEvidence({
      runId: run.id,
      sourceType: "tool_result",
      sourceId: "call_1",
      title: "Tool result",
      summary: "Tool completed",
      content: JSON.stringify({ ok: true }),
    });

    expect(first).toMatchObject({
      id: expect.stringMatching(/^ev_[0-9a-f]{32}$/),
      runId: run.id,
      sourceType: "system",
      sourceId: "setup",
      title: "Setup note",
      summary: "Prepared",
      content: "Full setup details",
      createdAt: expect.any(String),
    });
    expect(evidence.getEvidence(first.id)).toEqual(first);
    expect(evidence.listEvidence(run.id)).toEqual([first, second]);
    expect(events.listEvents(run.id).map((event) => event.type)).toEqual([
      "run.created",
      "evidence.created",
      "evidence.created",
    ]);
  });
});
