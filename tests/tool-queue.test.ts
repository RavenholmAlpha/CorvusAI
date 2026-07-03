import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import {
  ApprovalService as ExportedApprovalService,
  ToolQueue as ExportedToolQueue,
} from "../src/index.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { RunStore } from "../src/harness/run-store.js";
import { ToolQueue } from "../src/harness/tool-queue.js";
import { createDefaultPolicy, setPermissionRule, type PermissionPolicy } from "../src/permissions.js";
import { createToolManifest, type ToolManifest } from "../src/tools/protocol.js";

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

async function createHarness(configurePolicy?: (policy: PermissionPolicy) => void): Promise<{
  db: CorvusDatabase;
  events: EventLog;
  evidence: EvidenceStore;
  approvals: ApprovalService;
  queue: ToolQueue;
  policy: PermissionPolicy;
  run: ReturnType<RunStore["createRun"]>;
  step: ReturnType<RunStore["createStep"]>;
}> {
  const root = await mkdtemp(join(tmpdir(), "corvus-queue-"));
  roots.push(root);
  const db = openCorvusDatabase(join(root, "corvus.db"));
  databases.push(db);
  ensureDatabase(db);
  const events = new EventLog(db);
  const runs = new RunStore(db, events);
  const evidence = new EvidenceStore(db, events);
  const policy = createDefaultPolicy();
  configurePolicy?.(policy);
  const approvals = new ApprovalService(db, events, policy, evidence);
  const queue = new ToolQueue(db, events, evidence, approvals);
  const run = runs.createRun({ goal: "queue", model: "test-model", endpoint: "https://example.test/v1" });
  const step = runs.createStep({ runId: run.id, kind: "tool", status: "running", title: "Tool call" });
  return { db, events, evidence, approvals, queue, policy, run, step };
}

function echoTool(name = "echo"): ToolManifest {
  return createToolManifest({
    name,
    namespace: "test",
    version: "1.0.0",
    description: "Echo text",
    capability: "local",
    risk: "low",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    timeoutMs: 1000,
    outputLimitBytes: 1000,
    concurrency: { perTool: 1, perRun: 1, global: 2 },
    evidencePolicy: "summary",
    resources: [],
    execute: ({ text }) => ({ ok: true, output: { text }, summary: String(text) }),
  });
}

function askTool(execute: ToolManifest["execute"]): ToolManifest {
  return createToolManifest({
    name: "needs_approval",
    namespace: "test",
    version: "1.0.0",
    description: "Needs approval",
    capability: "process",
    risk: "high",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    timeoutMs: 1000,
    outputLimitBytes: 1000,
    concurrency: { perTool: 1, perRun: 1, global: 1 },
    evidencePolicy: "summary",
    resources: [],
    execute,
  });
}

function approvalTool(capability: string, execute: ToolManifest["execute"]): ToolManifest {
  return createToolManifest({
    name: "needs_approval",
    namespace: "test",
    version: "1.0.0",
    description: "Needs approval",
    capability,
    risk: "high",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    timeoutMs: 1000,
    outputLimitBytes: 1000,
    concurrency: { perTool: 1, perRun: 1, global: 1 },
    evidencePolicy: "summary",
    resources: [],
    execute,
  });
}

describe("ToolQueue", () => {
  it("exports ApprovalService and ToolQueue from the package entry point", () => {
    expect(ExportedApprovalService).toBe(ApprovalService);
    expect(ExportedToolQueue).toBe(ToolQueue);
  });

  it("executes an allowed tool, stores the result row, emits lifecycle events, and creates evidence", async () => {
    const { db, events, evidence, queue, run, step } = await createHarness();

    const result = await queue.enqueueAndRun({
      runId: run.id,
      stepId: step.id,
      tool: echoTool(),
      args: { text: "hello" },
    });

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") {
      throw new Error(`Expected succeeded, got ${result.status}`);
    }
    expect(result).toMatchObject({
      toolCallId: expect.stringMatching(/^tool_[0-9a-f]{32}$/),
      status: "succeeded",
      output: { text: "hello" },
      result: { ok: true, output: { text: "hello" }, summary: "hello" },
      evidenceId: expect.stringMatching(/^ev_[0-9a-f]{32}$/),
    });
    expect(db.prepare("select status, result_json, error, completed_at from tool_calls where id = ?").get(result.toolCallId)).toEqual({
      status: "succeeded",
      result_json: JSON.stringify({ ok: true, output: { text: "hello" }, summary: "hello" }),
      error: null,
      completed_at: expect.any(String),
    });
    expect(evidence.listEvidence(run.id)).toEqual([
      expect.objectContaining({
        id: result.evidenceId,
        runId: run.id,
        sourceType: "tool_result",
        sourceId: result.toolCallId,
        title: "Tool echo result",
        summary: "hello",
      }),
    ]);
    expect(events.listEvents(run.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["tool_call.created", "tool_call.queued", "tool_call.running", "tool_call.succeeded"]),
    );
  });

  it("creates a pending approval for ask decisions and runApproved resumes after approve once", async () => {
    const { db, events, approvals, queue, run, step } = await createHarness();
    let executions = 0;
    const tool = askTool(() => {
      executions += 1;
      return { ok: true, output: "approved", summary: "approved" };
    });

    const pending = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: {} });

    expect(pending.status).toBe("approval_required");
    if (pending.status !== "approval_required") {
      throw new Error(`Expected approval_required, got ${pending.status}`);
    }
    expect(pending).toMatchObject({
      toolCallId: expect.stringMatching(/^tool_[0-9a-f]{32}$/),
      status: "approval_required",
      approvalId: expect.stringMatching(/^appr_[0-9a-f]{32}$/),
    });
    expect(executions).toBe(0);
    expect(db.prepare("select status, started_at, completed_at from tool_calls where id = ?").get(pending.toolCallId)).toEqual({
      status: "approval_required",
      started_at: null,
      completed_at: null,
    });

    const approval = approvals.listPending(run.id)[0];
    expect(approval).toMatchObject({
      id: pending.approvalId,
      runId: run.id,
      toolCallId: pending.toolCallId,
      toolName: "needs_approval",
      status: "pending",
      decisionScope: "once",
    });

    approvals.resolveApproval(approval.id, "approved", "once");
    const resumed = await queue.runApproved(approval.toolCallId, tool);

    expect(resumed.status).toBe("succeeded");
    if (resumed.status !== "succeeded") {
      throw new Error(`Expected succeeded, got ${resumed.status}`);
    }
    expect(resumed).toMatchObject({
      toolCallId: pending.toolCallId,
      status: "succeeded",
      output: "approved",
      evidenceId: expect.stringMatching(/^ev_[0-9a-f]{32}$/),
    });
    expect(executions).toBe(1);
    expect(events.listEvents(run.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["approval.created", "approval.approved", "tool_call.succeeded"]),
    );
  });

  it("denying a pending approval transitions the tool call to denied and records denial evidence", async () => {
    const { db, events, evidence, approvals, queue, run, step } = await createHarness();
    let executions = 0;
    const tool = askTool(() => {
      executions += 1;
      return { ok: true, output: "should not run", summary: "should not run" };
    });

    const pending = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: {} });

    expect(pending.status).toBe("approval_required");
    if (pending.status !== "approval_required") {
      throw new Error(`Expected approval_required, got ${pending.status}`);
    }

    approvals.resolveApproval(pending.approvalId, "denied", "never");

    expect(db.prepare("select status, error, completed_at from tool_calls where id = ?").get(pending.toolCallId)).toEqual({
      status: "denied",
      error: "Tool needs_approval denied by approval decision",
      completed_at: expect.any(String),
    });
    expect(events.listEvents(run.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["approval.denied", "tool_call.denied"]),
    );
    expect(evidence.listEvidence(run.id)).toEqual([
      expect.objectContaining({
        sourceType: "permission_denial",
        sourceId: pending.toolCallId,
        summary: "Tool needs_approval denied by approval decision",
      }),
    ]);

    const rerun = await queue.runApproved(pending.toolCallId, tool).catch((error: unknown) => error);
    if (!(rerun instanceof Error)) {
      expect(rerun).toMatchObject({
        toolCallId: pending.toolCallId,
        status: "denied",
        error: "Tool needs_approval denied by approval decision",
      });
    }
    expect(executions).toBe(0);
  });

  it("keeps terminal approval decisions idempotent and rejects conflicting or pending re-resolution", async () => {
    const { db, approvals, queue, policy, run, step } = await createHarness();
    const tool = askTool(() => ({ ok: true, output: "approved", summary: "approved" }));
    const pending = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: {} });

    expect(pending.status).toBe("approval_required");
    if (pending.status !== "approval_required") {
      throw new Error(`Expected approval_required, got ${pending.status}`);
    }

    const approved = approvals.resolveApproval(pending.approvalId, "approved", "always");
    const repeated = approvals.resolveApproval(pending.approvalId, "approved", "always");

    expect(repeated).toMatchObject({
      id: approved.id,
      status: "approved",
      decisionScope: "always",
      decidedAt: approved.decidedAt,
    });
    expect(approvals.decideToolPermission("needs_approval", "process")).toBe("allow");

    expect(() => approvals.resolveApproval(pending.approvalId, "pending", "once")).toThrow(/already resolved/i);
    expect(() => approvals.resolveApproval(pending.approvalId, "denied", "never")).toThrow(/already resolved/i);
    expect(approvals.decideToolPermission("needs_approval", "process")).toBe("allow");
    expect(policy.rules["tool:needs_approval"]).toBe("allow");
    expect(db.prepare("select status, decision_scope from approvals where id = ?").get(pending.approvalId)).toEqual({
      status: "approved",
      decision_scope: "always",
    });
  });

  it("replays a successful approved tool call without executing it again", async () => {
    const { evidence, approvals, queue, run, step } = await createHarness();
    let executions = 0;
    const tool = askTool(() => {
      executions += 1;
      return { ok: true, output: "approved once", summary: "approved once" };
    });
    const pending = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: {} });

    expect(pending.status).toBe("approval_required");
    if (pending.status !== "approval_required") {
      throw new Error(`Expected approval_required, got ${pending.status}`);
    }

    approvals.resolveApproval(pending.approvalId, "approved", "once");
    const first = await queue.runApproved(pending.toolCallId, tool);
    const second = await queue.runApproved(pending.toolCallId, tool);

    expect(first.status).toBe("succeeded");
    expect(second).toMatchObject({
      toolCallId: pending.toolCallId,
      status: "succeeded",
      output: "approved once",
      evidenceId: first.status === "succeeded" ? first.evidenceId : undefined,
    });
    expect(executions).toBe(1);
    expect(evidence.listEvidence(run.id)).toHaveLength(1);
  });

  it("rejects an approved rerun when the tool capability does not match the stored call", async () => {
    const { approvals, queue, run, step } = await createHarness();
    const original = approvalTool("process", () => ({ ok: true, output: "original", summary: "original" }));
    let impostorExecutions = 0;
    const impostor = approvalTool("network", () => {
      impostorExecutions += 1;
      return { ok: true, output: "impostor", summary: "impostor" };
    });
    const pending = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool: original, args: {} });

    expect(pending.status).toBe("approval_required");
    if (pending.status !== "approval_required") {
      throw new Error(`Expected approval_required, got ${pending.status}`);
    }

    approvals.resolveApproval(pending.approvalId, "approved", "once");

    await expect(queue.runApproved(pending.toolCallId, impostor)).rejects.toThrow(/capability/i);
    expect(impostorExecutions).toBe(0);
  });

  it("denies a blocked tool without executing it and creates permission denial evidence", async () => {
    const { db, evidence, queue, run, step } = await createHarness((policy) => {
      setPermissionRule(policy, "tool:blocked", "deny");
    });
    let executed = false;
    const tool = createToolManifest({
      name: "blocked",
      namespace: "test",
      version: "1.0.0",
      description: "Blocked tool",
      capability: "local",
      risk: "low",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      timeoutMs: 1000,
      outputLimitBytes: 1000,
      concurrency: { perTool: 1, perRun: 1, global: 1 },
      evidencePolicy: "summary",
      resources: [],
      execute: () => {
        executed = true;
        return { ok: true, output: "unreachable" };
      },
    });

    const denied = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: {} });

    expect(denied.status).toBe("denied");
    if (denied.status !== "denied") {
      throw new Error(`Expected denied, got ${denied.status}`);
    }
    expect(denied).toMatchObject({
      toolCallId: expect.stringMatching(/^tool_[0-9a-f]{32}$/),
      status: "denied",
      error: "Tool blocked denied by permission policy",
      evidenceId: expect.stringMatching(/^ev_[0-9a-f]{32}$/),
    });
    expect(executed).toBe(false);
    expect(db.prepare("select status, error, completed_at from tool_calls where id = ?").get(denied.toolCallId)).toEqual({
      status: "denied",
      error: "Tool blocked denied by permission policy",
      completed_at: expect.any(String),
    });
    expect(evidence.listEvidence(run.id)).toEqual([
      expect.objectContaining({
        id: denied.evidenceId,
        sourceType: "permission_denial",
        sourceId: denied.toolCallId,
        summary: "Tool blocked denied by permission policy",
      }),
    ]);
  });

  it("fails a timed out tool call, aborts the execution signal, and creates error evidence", async () => {
    const { db, evidence, queue, run, step } = await createHarness();
    let observedAbort = false;
    const tool = createToolManifest({
      name: "wait_forever",
      namespace: "test",
      version: "1.0.0",
      description: "Wait until timeout",
      capability: "local",
      risk: "low",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      timeoutMs: 5,
      outputLimitBytes: 1000,
      concurrency: { perTool: 1, perRun: 1, global: 1 },
      evidencePolicy: "summary",
      resources: [],
      execute: (_input, context) =>
        new Promise((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              observedAbort = true;
              resolve({ ok: false, error: "aborted by tool" });
            },
            { once: true },
          );
          setTimeout(() => resolve({ ok: true, output: "late success" }), 50);
        }),
    });

    const failed = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: {} });

    expect(failed.status).toBe("failed");
    if (failed.status !== "failed") {
      throw new Error(`Expected failed, got ${failed.status}`);
    }
    expect(failed).toMatchObject({
      toolCallId: expect.stringMatching(/^tool_[0-9a-f]{32}$/),
      status: "failed",
      error: "Tool wait_forever timed out after 5ms",
      evidenceId: expect.stringMatching(/^ev_[0-9a-f]{32}$/),
    });
    expect(observedAbort).toBe(true);
    expect(db.prepare("select status, error, completed_at from tool_calls where id = ?").get(failed.toolCallId)).toEqual({
      status: "failed",
      error: "Tool wait_forever timed out after 5ms",
      completed_at: expect.any(String),
    });
    expect(evidence.listEvidence(run.id)).toEqual([
      expect.objectContaining({
        id: failed.evidenceId,
        sourceType: "tool_error",
        sourceId: failed.toolCallId,
        summary: "Tool wait_forever timed out after 5ms",
      }),
    ]);
  });

  it("recoverInterrupted deterministically marks running tool calls interrupted and emits recovery events", async () => {
    const { db, events, queue, run, step } = await createHarness();
    const createdAt = "2026-07-03T00:00:00.000Z";
    db.prepare(
      `insert into tool_calls
        (id, run_id, step_id, tool_name, capability, status, arguments_json, result_json, error, timeout_ms, created_at, started_at, completed_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("tool_running", run.id, step.id, "sleep", "local", "running", "{}", null, null, 1000, createdAt, createdAt, null);
    db.prepare(
      `insert into tool_calls
        (id, run_id, step_id, tool_name, capability, status, arguments_json, result_json, error, timeout_ms, created_at, started_at, completed_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("tool_done", run.id, step.id, "done", "local", "succeeded", "{}", "{}", null, 1000, createdAt, createdAt, createdAt);

    const recovered = queue.recoverInterrupted();

    expect(recovered).toEqual([
      expect.objectContaining({
        id: "tool_running",
        runId: run.id,
        stepId: step.id,
        toolName: "sleep",
        status: "interrupted",
        error: "Tool call interrupted during recovery",
        result: null,
      }),
    ]);
    expect(db.prepare("select status, error, completed_at from tool_calls where id = ?").get("tool_running")).toEqual({
      status: "interrupted",
      error: "Tool call interrupted during recovery",
      completed_at: expect.any(String),
    });
    expect(db.prepare("select status from tool_calls where id = ?").get("tool_done")).toEqual({ status: "succeeded" });
    expect(events.listEvents(run.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["tool_call.interrupted", "recovery.interrupted_tool_call"]),
    );
  });

  it("recoverInterrupted skips a call that is no longer running when the recovery update is attempted", async () => {
    const { db, events, queue, run, step } = await createHarness();
    const createdAt = "2026-07-03T00:00:00.000Z";
    db.prepare(
      `insert into tool_calls
        (id, run_id, step_id, tool_name, capability, status, arguments_json, result_json, error, timeout_ms, created_at, started_at, completed_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("tool_race", run.id, step.id, "sleep", "local", "running", "{}", null, null, 1000, createdAt, createdAt, null);

    const originalPrepare = db.prepare.bind(db);
    let changedBeforeRecoveryUpdate = false;
    (db as CorvusDatabase & { prepare: CorvusDatabase["prepare"] }).prepare = ((source: string) => {
      const statement = originalPrepare(source);
      if (source.includes("update tool_calls set status = ?, error = ?, completed_at = ? where id = ?")) {
        return new Proxy(statement, {
          get(target, property, receiver) {
            if (property !== "run") {
              return Reflect.get(target, property, receiver);
            }
            return (...params: unknown[]) => {
              if (!changedBeforeRecoveryUpdate && params.at(-1) === "tool_race") {
                changedBeforeRecoveryUpdate = true;
                originalPrepare(
                  "update tool_calls set status = ?, result_json = ?, error = null, completed_at = ? where id = ?",
                ).run("succeeded", "{}", createdAt, "tool_race");
              }
              return target.run(...(params as Parameters<typeof target.run>));
            };
          },
        });
      }
      return statement;
    }) as CorvusDatabase["prepare"];

    try {
      expect(queue.recoverInterrupted()).toEqual([]);
    } finally {
      (db as CorvusDatabase & { prepare: CorvusDatabase["prepare"] }).prepare = originalPrepare as CorvusDatabase["prepare"];
    }

    expect(changedBeforeRecoveryUpdate).toBe(true);
    expect(db.prepare("select status, result_json, error, completed_at from tool_calls where id = ?").get("tool_race")).toEqual({
      status: "succeeded",
      result_json: "{}",
      error: null,
      completed_at: createdAt,
    });
    expect(events.listEvents(run.id).map((event) => event.type)).not.toContain("tool_call.interrupted");
  });

  it("keeps truncated UTF-8 previews within the byte limit without splitting multibyte output", async () => {
    const { queue, run, step } = await createHarness();
    const outputLimitBytes = 7;
    const tool = createToolManifest({
      name: "emoji",
      namespace: "test",
      version: "1.0.0",
      description: "Emoji output",
      capability: "local",
      risk: "low",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      timeoutMs: 1000,
      outputLimitBytes,
      concurrency: { perTool: 1, perRun: 1, global: 1 },
      evidencePolicy: "summary",
      resources: [],
      execute: () => ({ ok: true, output: "😀😀😀", summary: "emoji" }),
    });

    const result = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: {} });

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") {
      throw new Error(`Expected succeeded, got ${result.status}`);
    }
    expect(result.output).toMatchObject({ truncated: true, outputLimitBytes });
    const preview = (result.output as { preview: string }).preview;
    expect(Buffer.byteLength(preview, "utf8")).toBeLessThanOrEqual(outputLimitBytes);
    expect(preview).not.toContain("\uFFFD");
  });
});
