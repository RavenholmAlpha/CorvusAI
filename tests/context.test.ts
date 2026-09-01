import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CorvusAgent } from "../src/agent.js";
import { createDefaultConfig, type CorvusConfig } from "../src/config.js";
import {
  isSummaryMessage,
  trimMessagesToBudget,
  type TrimResult,
} from "../src/context.js";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { HarnessRunner } from "../src/harness/runner.js";
import { RunStore } from "../src/harness/run-store.js";
import { ToolQueue } from "../src/harness/tool-queue.js";
import type { ChatCompletionRequest } from "../src/openai-client.js";
import { createDefaultPolicy } from "../src/permissions.js";
import { ToolRegistry } from "../src/tools/index.js";
import { createToolManifest, type ToolManifest } from "../src/tools/protocol.js";
import type { ChatCompletionResponse, ChatMessage } from "../src/types.js";
import { CommandRegistry, createCoreCommands, type DurableHarnessAdapter } from "../src/commands.js";

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

async function createHarness(configureConfig?: (config: CorvusConfig) => void): Promise<{
  db: CorvusDatabase;
  config: CorvusConfig;
  events: EventLog;
  runs: RunStore;
  evidence: EvidenceStore;
  approvals: ApprovalService;
  queue: ToolQueue;
  tools: ToolRegistry;
}> {
  const root = await mkdtemp(join(tmpdir(), "corvus-context-"));
  roots.push(root);
  const db = openCorvusDatabase(join(root, "corvus.db"));
  databases.push(db);
  ensureDatabase(db);

  const config = createDefaultConfig();
  config.model = "test-model";
  config.endpoint = "https://example.test/v1";
  configureConfig?.(config);

  const events = new EventLog(db);
  const runs = new RunStore(db, events);
  const evidence = new EvidenceStore(db, events);
  const approvals = new ApprovalService(db, events, config.permissions, evidence);
  const queue = new ToolQueue(db, events, evidence, approvals);
  const tools = new ToolRegistry(config.permissions);
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
      if (!run) {
        return undefined;
      }
      if (["succeeded", "failed", "canceled", "interrupted"].includes(run.status)) {
        return run;
      }
      return runs.updateRunStatus(id, "canceled");
    },
    resumeRun: async (id) => {
      const result = await runner.resumeRun(id);
      return runs.getRun(result.runId);
    },
    listPendingApprovals: (runId) => approvals.listPending(runId),
    resolveApproval: (id, status, scope) => approvals.resolveApproval(id, status, scope),
    runApproved: (toolCallId, tool) => queue.runApproved(toolCallId, tool),
    getEvidence: (id) => evidence.getEvidence(id),
    listEvidence: (runId) => evidence.listEvidence(runId),
  };
}

function toolManifest(name: string, capability: string, execute: ToolManifest["execute"]): ToolManifest {
  return createToolManifest({
    name,
    namespace: "test",
    version: "1.0.0",
    description: name,
    capability,
    risk: capability === "local" ? "low" : "high",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    timeoutMs: 1000,
    outputLimitBytes: 10000,
    concurrency: { perTool: 1, perRun: 1, global: 1 },
    evidencePolicy: "summary",
    resources: [],
    execute,
  });
}

function toolCall(id: string, name: string, text: string): ChatCompletionResponse {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: { name, arguments: JSON.stringify({ text }) },
            },
          ],
        },
      },
    ],
  };
}

describe("context utilities", () => {
  it("keeps system, summary, and the most recent messages when trimming", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "system", content: "[SEG:SUMMARY|turns:1-2|ARCHIVAL]\nold summary\n[SEG:SUMMARY|END]" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ];
    const result = trimMessagesToBudget(messages, 10, 2);
    expect(result.trimmedCount).toBeGreaterThan(0);
    expect(result.messages[0]).toEqual(messages[0]);
    expect(result.messages.some(isSummaryMessage)).toBe(true);
    const nonSummary = result.messages.filter((message) => !isSummaryMessage(message));
    expect(nonSummary.map((message) => message.content)).toEqual(["sys", "u2", "a2"]);
  });

  it("returns messages untouched when they fit the budget", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "u1" },
    ];
    const result: TrimResult = trimMessagesToBudget(messages, 10000);
    expect(result.trimmedCount).toBe(0);
    expect(result.messages).toBe(messages);
  });
});

describe("context healing after command-path approvals", () => {
  it("feeds the model tool results instead of a dangling tool_calls assistant message", async () => {
    const { config, events, runs, evidence, approvals, queue, tools } = await createHarness();
    tools.register(
      toolManifest("ask_echo", "network", ({ text }) => ({
        ok: true,
        output: { text: `RESULT:${text}` },
        summary: `RESULT:${text}`,
      })),
    );

    const requests: ChatCompletionRequest[] = [];
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        requests.push(request);
        if (requests.length === 1) {
          return toolCall("call_1", "ask_echo", "hi");
        }
        return { choices: [{ message: { role: "assistant", content: "final answer" } }] };
      },
    };

    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });
    const harness = createHarnessAdapter(runs, evidence, approvals, queue, runner);
    const agent = new CorvusAgent({ config, tools, model, runner, harness });

    // First send pauses the run waiting for approval.
    const first = await agent.send("do something");
    expect(first.pendingApprovals).toHaveLength(1);
    expect(first.runId).toBeDefined();
    const approval = first.pendingApprovals![0];

    // Command path: approve + execute the tool, but never resume the run.
    const tool = tools.list().find((candidate) => candidate.name === "ask_echo")!;
    harness.resolveApproval(approval.approvalId, "approved", "once");
    await harness.runApproved(approval.toolCallId, tool);

    // A second send must heal the dangling tail before calling the model.
    const second = await agent.send("continue");
    expect(second.pendingApprovals).toBeUndefined();
    expect(requests).toHaveLength(2);

    const request2 = requests[1];
    const toolMessages = request2.messages.filter((message) => message.role === "tool");
    expect(toolMessages.length).toBeGreaterThan(0);
    expect(String(toolMessages[0].content)).toContain("RESULT:hi");

    // The request is well-formed: every assistant tool_calls is followed by a tool message.
    const assistantIndex = request2.messages.findIndex(
      (message) => message.role === "assistant" && (message.tool_calls?.length ?? 0) > 0,
    );
    expect(assistantIndex).toBeGreaterThanOrEqual(0);
    expect(request2.messages[assistantIndex + 1]?.role).toBe("tool");
  });

  it("never emits a dangling tool_calls after an approval was approved but never executed", async () => {
    const { config, events, runs, evidence, approvals, queue, tools } = await createHarness();
    tools.register(
      toolManifest("ask_echo", "network", ({ text }) => ({ ok: true, output: { text }, summary: text })),
    );

    const requests: ChatCompletionRequest[] = [];
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        requests.push(request);
        if (requests.length === 1) {
          return toolCall("call_1", "ask_echo", "hi");
        }
        return { choices: [{ message: { role: "assistant", content: "final answer" } }] };
      },
    };

    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events, approvals });
    const harness = createHarnessAdapter(runs, evidence, approvals, queue, runner);
    const agent = new CorvusAgent({ config, tools, model, runner, harness });

    const first = await agent.send("do it");
    expect(first.pendingApprovals).toHaveLength(1);
    const approval = first.pendingApprovals![0];

    // Approve WITHOUT executing (simulates a missing tool manifest).
    harness.resolveApproval(approval.approvalId, "approved", "once");

    // The next send must heal the dangling tail with a terminal tool result.
    await agent.send("continue");
    expect(requests).toHaveLength(2);

    const request2 = requests[1];
    const assistantIndex = request2.messages.findIndex(
      (message) => message.role === "assistant" && (message.tool_calls?.length ?? 0) > 0,
    );
    expect(assistantIndex).toBeGreaterThanOrEqual(0);
    expect(request2.messages[assistantIndex + 1]?.role).toBe("tool");
    expect(String(request2.messages[assistantIndex + 1]?.content)).toContain("never executed");
  });
});

describe("resume context protection", () => {
  it("trims an oversized resumed context before sending it to the model", async () => {
    const { config, events, runs, evidence, approvals, queue, tools } = await createHarness((current) => {
      current.compactionThreshold = 300;
    });
    tools.register(
      toolManifest("big_echo", "local", ({ text }) => ({
        ok: true,
        output: { text: `${text}-${"X".repeat(600)}` },
        summary: "big",
      })),
    );
    tools.register(
      toolManifest("ask_echo", "network", ({ text }) => ({
        ok: true,
        output: { text: `RESULT:${text}` },
        summary: `RESULT:${text}`,
      })),
    );

    const requests: ChatCompletionRequest[] = [];
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        requests.push(request);
        if (requests.length <= 3) {
          return toolCall(`call_${requests.length}`, "big_echo", `x${requests.length}`);
        }
        if (requests.length === 4) {
          return toolCall("call_ask", "ask_echo", "pause");
        }
        return { choices: [{ message: { role: "assistant", content: "done" } }] };
      },
    };

    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });
    const harness = createHarnessAdapter(runs, evidence, approvals, queue, runner);
    const agent = new CorvusAgent({ config, tools, model, runner, harness });

    // Accumulate several rounds of large tool results, then pause on an ask.
    const first = await agent.send("go");
    expect(first.pendingApprovals).toHaveLength(1);
    const approval = first.pendingApprovals![0];
    const tool = tools.list().find((candidate) => candidate.name === "ask_echo")!;
    harness.resolveApproval(approval.approvalId, "approved", "once");
    await harness.runApproved(approval.toolCallId, tool);

    await agent.resume(first.runId!);

    // The resumed run sent a trimmed context to the model.
    const resumedRequest = requests.at(-1)!;
    const trimmedHint = resumedRequest.messages.find(
      (message) => message.role === "system" && typeof message.content === "string" && message.content.includes("Context trimmed"),
    );
    expect(trimmedHint).toBeDefined();
    // Trimmed to system + hint + a small recent window.
    expect(resumedRequest.messages.length).toBeLessThanOrEqual(6);
  });
});

describe("compaction summary lifecycle", () => {
  it("keeps exactly one summary and preserves it across repeated compactions", async () => {
    const config = createDefaultConfig();
    config.compactionThreshold = 60;
    let normalCalls = 0;
    let summaryCalls = 0;

    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        const isSummaryCall =
          request.messages[0]?.role === "system" &&
          typeof request.messages[0]?.content === "string" &&
          request.messages[0].content.includes("compaction engine");
        if (isSummaryCall) {
          summaryCalls += 1;
          return { choices: [{ message: { role: "assistant", content: `SUMMARY_${summaryCalls}` } }] };
        }
        normalCalls += 1;
        return { choices: [{ message: { role: "assistant", content: `reply_${normalCalls}` } }] };
      },
    };

    const agent = new CorvusAgent({
      config,
      tools: new ToolRegistry(createDefaultPolicy()),
      model,
    });

    for (let i = 0; i < 6; i += 1) {
      await agent.send(`message ${i}`);
    }
    // Flush microtasks so any trailing background summary lands.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const history = agent.history();
    const summaries = history.filter(isSummaryMessage);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.content).toContain("SUMMARY");
    expect(summaryCalls).toBeGreaterThan(0);
    // The summary sits directly after the system prompt.
    expect(isSummaryMessage(history[1])).toBe(true);
  });

  it("drops a stale summary when the context is cleared mid-compaction", async () => {
    const config = createDefaultConfig();
    config.compactionThreshold = 25;
    let summaryCalls = 0;
    let resolveSummary: (() => void) | undefined;

    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        const isSummaryCall =
          request.messages[0]?.role === "system" &&
          typeof request.messages[0]?.content === "string" &&
          request.messages[0].content.includes("compaction engine");
        if (isSummaryCall) {
          summaryCalls += 1;
          await new Promise<void>((resolve) => {
            resolveSummary = resolve;
          });
          return { choices: [{ message: { role: "assistant", content: `SUMMARY_${summaryCalls}` } }] };
        }
        return { choices: [{ message: { role: "assistant", content: "ok" } }] };
      },
    };

    const agent = new CorvusAgent({
      config,
      tools: new ToolRegistry(createDefaultPolicy()),
      model,
    });

    // Three sends produce more than 5 in-memory messages, triggering compaction.
    await agent.send("a");
    await agent.send("b");
    await agent.send("c");
    // A summary request is now in flight (paused on resolveSummary).
    expect(summaryCalls).toBe(1);
    expect(resolveSummary).toBeDefined();

    agent.clearContext();
    expect(agent.history()).toHaveLength(1);

    resolveSummary?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The stale summary must not be spliced back after /clear.
    expect(agent.history()).toHaveLength(1);
  });
});

describe("/clear and /compact commands", () => {
  it("clear drops the in-memory history and compact reports nothing to do on a small context", async () => {
    const config = createDefaultConfig();
    const model = {
      createChatCompletion: async (): Promise<ChatCompletionResponse> => ({
        choices: [{ message: { role: "assistant", content: "ok" } }],
      }),
    };
    const agent = new CorvusAgent({
      config,
      tools: new ToolRegistry(createDefaultPolicy()),
      model,
    });
    await agent.send("hello");

    const registry = new CommandRegistry(createCoreCommands());
    const context = { config, agent, write: () => undefined };

    const cleared = await registry.execute("/clear", context);
    expect(cleared.ok).toBe(true);
    expect(agent.history()).toHaveLength(1);

    const compacted = await registry.execute("/compact", context);
    expect(compacted.ok).toBe(true);
    expect(compacted.message).toContain("Nothing to compact");
  });
});
