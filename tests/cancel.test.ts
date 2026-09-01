import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CorvusAgent } from "../src/agent.js";
import { createDefaultConfig } from "../src/config.js";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { HarnessRunner } from "../src/harness/runner.js";
import { RunStore } from "../src/harness/run-store.js";
import { ToolQueue } from "../src/harness/tool-queue.js";
import type { ChatCompletionRequest } from "../src/openai-client.js";
import type { DurableHarnessAdapter } from "../src/commands.js";

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

async function createHarness() {
  const root = await mkdtemp(join(tmpdir(), "corvus-cancel-"));
  roots.push(root);
  const db = openCorvusDatabase(join(root, "corvus.db"));
  databases.push(db);
  ensureDatabase(db);

  const config = createDefaultConfig();
  config.model = "test-model";
  config.endpoint = "https://example.test/v1";
  const events = new EventLog(db);
  const runs = new RunStore(db, events);
  const evidence = new EvidenceStore(db, events);
  const approvals = new ApprovalService(db, events, config.permissions, evidence);
  const queue = new ToolQueue(db, events, evidence, approvals);
  const tools = new (await import("../src/tools/index.js")).ToolRegistry(config.permissions);
  return { db, config, events, runs, evidence, approvals, queue, tools };
}

function createHarnessAdapter(
  runs: RunStore,
  evidence: EvidenceStore,
  approvals: ApprovalService,
  queue: ToolQueue,
  runner: HarnessRunner,
): DurableHarnessAdapter {
  return {
    listRuns: () => runs.listRuns(),
    getRun: (id) => runs.getRun(id),
    listMessages: (runId) => runs.listMessages(runId),
    latestSnapshot: (runId) => runs.latestSnapshot(runId),
    cancelRun: (id) => {
      const run = runs.getRun(id);
      return run ? runs.updateRunStatus(id, "canceled") : undefined;
    },
    resumeRun: async (id) => runs.getRun(id),
    listPendingApprovals: (runId) => approvals.listPending(runId),
    resolveApproval: (id, status, scope) => approvals.resolveApproval(id, status, scope),
    runApproved: (toolCallId, tool) => queue.runApproved(toolCallId, tool),
    getEvidence: (id) => evidence.getEvidence(id),
    listEvidence: (runId) => evidence.listEvidence(runId),
  };
}

describe("generation cancellation", () => {
  it("aborting the signal rejects the send and marks the run interrupted", async () => {
    const { config, events, runs, evidence, approvals, queue, tools } = await createHarness();
    let modelStarted: (() => void) | undefined;
    let started = false;
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest) => {
        started = true;
        modelStarted?.();
        await new Promise((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        });
        return { choices: [{ message: { role: "assistant", content: "done" } }] };
      },
    };

    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });
    const harness = createHarnessAdapter(runs, evidence, approvals, queue, runner);
    const agent = new CorvusAgent({ config, tools, model, runner, harness });

    const controller = new AbortController();
    const pending = agent.send("hello", { signal: controller.signal });
    // Wait until the model call is in flight, then cancel.
    await new Promise<void>((resolve) => {
      modelStarted = resolve;
      if (started) resolve();
    });
    controller.abort();

    await expect(pending).rejects.toThrow();
    const runsAfter = harness.listRuns();
    expect(runsAfter).toHaveLength(1);
    expect(runsAfter[0]?.status).toBe("interrupted");
  });
});