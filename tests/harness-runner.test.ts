import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CorvusAgent } from "../src/agent.js";
import { createDefaultConfig, type CorvusConfig } from "../src/config.js";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { HarnessRunner as ExportedHarnessRunner } from "../src/index.js";
import { HarnessRunner } from "../src/harness/runner.js";
import { RunStore } from "../src/harness/run-store.js";
import { ToolQueue } from "../src/harness/tool-queue.js";
import type { ChatCompletionRequest } from "../src/openai-client.js";
import { ToolRegistry } from "../src/tools/index.js";
import { createToolManifest, type ToolManifest } from "../src/tools/protocol.js";
import type { ChatCompletionResponse } from "../src/types.js";

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
  const root = await mkdtemp(join(tmpdir(), "corvus-runner-"));
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

function echoTool(capability = "local", execute?: ToolManifest["execute"]): ToolManifest {
  return createToolManifest({
    name: "echo",
    namespace: "test",
    version: "1.0.0",
    description: "Echo text",
    capability,
    risk: capability === "local" ? "low" : "high",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    timeoutMs: 1000,
    outputLimitBytes: 1000,
    concurrency: { perTool: 1, perRun: 1, global: 1 },
    evidencePolicy: "summary",
    resources: [],
    execute: execute ?? (({ text }) => ({ ok: true, output: { text }, summary: String(text) })),
  });
}

describe("HarnessRunner", () => {
  it("exports HarnessRunner from the package entry point", () => {
    expect(ExportedHarnessRunner).toBe(HarnessRunner);
  });

  it("persists model tool calls, durable tool results, evidence, events, snapshots, and the final assistant message", async () => {
    const { db, config, events, runs, evidence, queue, tools } = await createHarness((current) => {
      current.goal = "configured durable goal";
      current.review.enabled = true;
    });
    tools.register(echoTool());
    const requests: ChatCompletionRequest[] = [];
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        requests.push(request);
        if (requests.length === 1) {
          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: { name: "echo", arguments: JSON.stringify({ text: "hi" }) },
                    },
                  ],
                },
              },
            ],
          };
        }
        return { choices: [{ message: { role: "assistant", content: "done" } }] };
      },
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });

    const result = await runner.runTurn("say hi");

    expect(result.message).toMatchObject({ role: "assistant", content: "done" });
    expect(runs.getRun(result.runId)).toMatchObject({
      status: "succeeded",
      goal: "configured durable goal",
      model: "test-model",
      endpoint: "https://example.test/v1",
      completedAt: expect.any(String),
    });
    expect(runs.listMessages(result.runId).map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(runs.listMessages(result.runId)[1]).toMatchObject({
      role: "assistant",
      metadata: {
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "echo", arguments: JSON.stringify({ text: "hi" }) },
          },
        ],
      },
    });
    expect(runs.listMessages(result.runId)[2]).toMatchObject({
      role: "tool",
      toolCallId: "call_1",
      metadata: {
        name: "echo",
        tool_call_id: "call_1",
      },
      content: expect.stringContaining("hi"),
    });
    expect(
      db.prepare("select status from steps where run_id = ? order by \"index\"").all(result.runId),
    ).toEqual([{ status: "succeeded" }, { status: "succeeded" }, { status: "succeeded" }]);
    expect(db.prepare("select tool_name, status, result_json, error from tool_calls").all()).toEqual([
      {
        tool_name: "echo",
        status: "succeeded",
        result_json: JSON.stringify({ ok: true, output: { text: "hi" }, summary: "hi" }),
        error: null,
      },
    ]);
    expect(evidence.listEvidence(result.runId)).toEqual([
      expect.objectContaining({
        sourceType: "tool_result",
        title: "Tool echo result",
        summary: "hi",
      }),
    ]);
    expect(events.listEvents(result.runId).map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "run.created",
        "run.status_changed",
        "tool_call.created",
        "tool_call.succeeded",
        "evidence.created",
        "snapshot.created",
      ]),
    );
    const snapshotCount = db
      .prepare("select count(*) as count from state_snapshots where run_id = ?")
      .get(result.runId) as { count: number };
    expect(snapshotCount.count).toBeGreaterThan(0);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      tools: tools.toOpenAITools(),
      tool_choice: "auto",
    });
    expect(requests[0]?.messages[0]?.content).toContain("configured durable goal");
    expect(requests[0]?.messages[0]?.content).toContain("Review mode instruction");
    expect(requests[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", tool_call_id: "call_1", name: "echo" }),
      ]),
    );
  });

  it("pauses the run when a tool call requires approval without continuing the model loop", async () => {
    const { db, config, events, runs, evidence, approvals, queue, tools } = await createHarness();
    let executions = 0;
    tools.register(
      echoTool("process", () => {
        executions += 1;
        return { ok: true, output: "should not run before approval", summary: "should not run before approval" };
      }),
    );
    const requests: ChatCompletionRequest[] = [];
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        requests.push(request);
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_needs_approval",
                    type: "function",
                    function: { name: "echo", arguments: JSON.stringify({ text: "approval" }) },
                  },
                ],
              },
            },
          ],
        };
      },
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });

    const result = await runner.runTurn("needs approval");

    expect(result.message.tool_calls?.[0]?.id).toBe("call_needs_approval");
    expect(runs.getRun(result.runId)?.status).toBe("waiting_for_approval");
    expect(requests).toHaveLength(1);
    expect(executions).toBe(0);
    expect(approvals.listPending(result.runId)).toEqual([
      expect.objectContaining({
        runId: result.runId,
        toolName: "echo",
        status: "pending",
      }),
    ]);
    expect(runs.listMessages(result.runId).map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(runs.listMessages(result.runId)[2]).toMatchObject({
      role: "tool",
      toolCallId: "call_needs_approval",
      content: expect.stringContaining("approval_required"),
    });
    expect(
      db.prepare("select kind, status from steps where run_id = ? order by \"index\"").all(result.runId),
    ).toEqual([
      { kind: "model", status: "succeeded" },
      { kind: "tool", status: "interrupted" },
    ]);
    expect(db.prepare("select tool_name, status, started_at, completed_at from tool_calls").all()).toEqual([
      {
        tool_name: "echo",
        status: "approval_required",
        started_at: null,
        completed_at: null,
      },
    ]);
    expect(evidence.listEvidence(result.runId)).toEqual([]);
    expect(events.listEvents(result.runId).map((event) => event.type)).toEqual(
      expect.arrayContaining(["approval.created", "tool_call.approval_required", "run.status_changed"]),
    );
  });

  it("resumes a waiting run after approval by continuing with the approved tool result", async () => {
    const { config, events, runs, evidence, approvals, queue, tools } = await createHarness();
    tools.register(echoTool("process"));
    const requests: ChatCompletionRequest[] = [];
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        requests.push(request);
        if (requests.length === 1) {
          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_needs_approval",
                      type: "function",
                      function: { name: "echo", arguments: JSON.stringify({ text: "approved" }) },
                    },
                  ],
                },
              },
            ],
          };
        }

        const resumedToolMessage = request.messages.find(
          (message) => message.role === "tool" && message.tool_call_id === "call_needs_approval",
        );
        expect(resumedToolMessage?.content).toContain("succeeded");
        expect(resumedToolMessage?.content).toContain("approved");
        expect(resumedToolMessage?.content).not.toContain("approval_required");
        return { choices: [{ message: { role: "assistant", content: "resumed done" } }] };
      },
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });

    const paused = await runner.runTurn("needs approval");
    const [approval] = approvals.listPending(paused.runId);
    approvals.resolveApproval(approval.id, "approved", "once");
    const tool = tools.list().find((candidate) => candidate.name === "echo");
    if (!tool) {
      throw new Error("echo tool missing");
    }
    await queue.runApproved(approval.toolCallId, tool);

    const resumed = await runner.resumeRun(paused.runId);

    expect(resumed.message).toMatchObject({ role: "assistant", content: "resumed done" });
    expect(runs.getRun(paused.runId)?.status).toBe("succeeded");
    expect(requests).toHaveLength(2);
    expect(runs.listMessages(paused.runId).map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "tool",
      "assistant",
    ]);
    expect(runs.listMessages(paused.runId)[3]).toMatchObject({
      role: "tool",
      toolCallId: "call_needs_approval",
      content: expect.stringContaining("succeeded"),
    });
    expect(runs.listMessages(paused.runId)[3]?.content).toContain("evidenceId");
    expect(
      runs
        .listMessages(paused.runId)
        .filter((message) => message.toolCallId === "call_needs_approval" && message.content?.includes("succeeded")),
    ).toHaveLength(1);
    expect(
      events
        .listEvents(paused.runId)
        .filter((event) => event.type === "step.status_changed" && event.payload.status === "succeeded"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({ previousStatus: "interrupted", status: "succeeded" }),
        }),
      ]),
    );
  });

  it("keeps maxToolRounds accounting across resume", async () => {
    const { config, events, runs, evidence, approvals, queue, tools } = await createHarness((current) => {
      current.maxToolRounds = 1;
    });
    let extraToolExecutions = 0;
    tools.register(echoTool("process"));
    tools.register(
      createToolManifest({
        name: "extra",
        namespace: "test",
        version: "1.0.0",
        description: "Extra tool",
        capability: "local",
        risk: "low",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        timeoutMs: 1000,
        outputLimitBytes: 1000,
        concurrency: { perTool: 1, perRun: 1, global: 1 },
        evidencePolicy: "summary",
        resources: [],
        execute: () => {
          extraToolExecutions += 1;
          return { ok: true, output: "should not execute" };
        },
      }),
    );
    let calls = 0;
    const model = {
      createChatCompletion: async (): Promise<ChatCompletionResponse> => {
        calls += 1;
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls:
                  calls === 1
                    ? [
                        {
                          id: "call_needs_approval",
                          type: "function",
                          function: { name: "echo", arguments: JSON.stringify({ text: "approved" }) },
                        },
                      ]
                    : [
                        {
                          id: "call_extra",
                          type: "function",
                          function: { name: "extra", arguments: "{}" },
                        },
                      ],
              },
            },
          ],
        };
      },
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });

    const paused = await runner.runTurn("needs approval");
    const [approval] = approvals.listPending(paused.runId);
    approvals.resolveApproval(approval.id, "approved", "once");
    const tool = tools.list().find((candidate) => candidate.name === "echo");
    if (!tool) {
      throw new Error("echo tool missing");
    }
    await queue.runApproved(approval.toolCallId, tool);

    await expect(runner.resumeRun(paused.runId)).rejects.toThrow("Tool loop exceeded maxToolRounds=1");

    expect(extraToolExecutions).toBe(0);
    expect(runs.getRun(paused.runId)?.status).toBe("failed");
  });

  it("fails before executing tool calls when the next tool round would exceed maxToolRounds", async () => {
    const { config, events, runs, evidence, queue, tools } = await createHarness((current) => {
      current.maxToolRounds = 0;
    });
    let executions = 0;
    tools.register(
      echoTool("local", () => {
        executions += 1;
        return { ok: true, output: "should not execute" };
      }),
    );
    const model = {
      createChatCompletion: async (): Promise<ChatCompletionResponse> => ({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_over_limit",
                  type: "function",
                  function: { name: "echo", arguments: JSON.stringify({ text: "too far" }) },
                },
              ],
            },
          },
        ],
      }),
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });

    await expect(runner.runTurn("round limit")).rejects.toThrow("Tool loop exceeded maxToolRounds=0");

    const run = runs.listRuns()[0];
    expect(run).toMatchObject({ status: "failed" });
    expect(executions).toBe(0);
    expect(evidence.listEvidence(run.id)).toEqual([
      expect.objectContaining({
        sourceType: "model_error",
        summary: "Tool loop exceeded maxToolRounds=0",
      }),
    ]);
    expect(events.listEvents(run.id).map((event) => event.type)).toContain("model.error");
    expect(events.listEvents(run.id).map((event) => event.type)).not.toContain("model_error");
    expect(events.listEvents(run.id).filter((event) => event.type === "tool_call.created")).toEqual([]);
  });

  it("returns unknown tool and malformed argument failures as durable tool messages so the model can self-correct", async () => {
    const { db, config, events, runs, evidence, queue, tools } = await createHarness();
    tools.register(echoTool());
    const requests: ChatCompletionRequest[] = [];
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        requests.push(request);
        if (requests.length === 1) {
          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_unknown",
                      type: "function",
                      function: { name: "missing_tool", arguments: "{}" },
                    },
                    {
                      id: "call_bad_json",
                      type: "function",
                      function: { name: "echo", arguments: "{not json" },
                    },
                  ],
                },
              },
            ],
          };
        }
        expect(request.messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: "tool",
              tool_call_id: "call_unknown",
              name: "missing_tool",
              content: expect.stringContaining("Unknown tool: missing_tool"),
            }),
            expect.objectContaining({
              role: "tool",
              tool_call_id: "call_bad_json",
              name: "echo",
              content: expect.stringContaining("Expected property name"),
            }),
          ]),
        );
        return { choices: [{ message: { role: "assistant", content: "corrected" } }] };
      },
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });

    const result = await runner.runTurn("recover from tool errors");

    expect(result.message.content).toBe("corrected");
    expect(runs.getRun(result.runId)?.status).toBe("succeeded");
    expect(runs.listMessages(result.runId).map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "tool",
      "assistant",
    ]);
    expect(runs.listMessages(result.runId)[2]).toMatchObject({
      role: "tool",
      toolCallId: "call_unknown",
      metadata: { name: "missing_tool", tool_call_id: "call_unknown" },
      content: expect.stringContaining("Unknown tool: missing_tool"),
    });
    expect(runs.listMessages(result.runId)[3]).toMatchObject({
      role: "tool",
      toolCallId: "call_bad_json",
      metadata: { name: "echo", tool_call_id: "call_bad_json" },
      content: expect.stringContaining("Expected property name"),
    });
    expect(db.prepare("select tool_name, status from tool_calls").all()).toEqual([]);
    expect(
      db.prepare("select kind, status from steps where run_id = ? order by \"index\"").all(result.runId),
    ).toEqual([
      { kind: "model", status: "succeeded" },
      { kind: "tool", status: "failed" },
      { kind: "tool", status: "failed" },
      { kind: "model", status: "succeeded" },
    ]);
    expect(evidence.listEvidence(result.runId)).toEqual([]);
  });

  it("includes prior durable agent turns in later model requests", async () => {
    const { config, events, runs, evidence, queue, tools } = await createHarness();
    const requests: ChatCompletionRequest[] = [];
    const model = {
      createChatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
        requests.push(request);
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: requests.length === 1 ? "first durable reply" : "second durable reply",
              },
            },
          ],
        };
      },
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });
    const agent = new CorvusAgent({ config, tools, model, runner });

    await agent.send("first durable question");
    await agent.send("second durable question");

    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "first durable question" },
      { role: "assistant", content: "first durable reply" },
      { role: "user", content: "second durable question" },
    ]);
    expect(agent.history()).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "first durable question" },
      { role: "assistant", content: "first durable reply" },
      { role: "user", content: "second durable question" },
      { role: "assistant", content: "second durable reply" },
    ]);
  });

  it("records model failures with a dotted model.error event and no running model step", async () => {
    const { db, config, events, runs, evidence, queue, tools } = await createHarness();
    const model = {
      createChatCompletion: async (): Promise<ChatCompletionResponse> => {
        throw new Error("model unavailable");
      },
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });

    await expect(runner.runTurn("fail model")).rejects.toThrow("model unavailable");

    const run = runs.listRuns()[0];
    expect(run).toMatchObject({ status: "failed" });
    expect(events.listEvents(run.id).map((event) => event.type)).toContain("model.error");
    expect(events.listEvents(run.id).map((event) => event.type)).not.toContain("model_error");
    expect(evidence.listEvidence(run.id)).toEqual([
      expect.objectContaining({ sourceType: "model_error", summary: "model unavailable" }),
    ]);
    expect(db.prepare("select status from steps where run_id = ?").all(run.id)).toEqual([{ status: "failed" }]);
  });

  it("lets CorvusAgent delegate send through a durable runner while maintaining agent history", async () => {
    const { config, events, runs, evidence, queue, tools } = await createHarness();
    const model = {
      createChatCompletion: async (): Promise<ChatCompletionResponse> => ({
        choices: [{ message: { role: "assistant", content: "durable reply" } }],
      }),
    };
    const runner = new HarnessRunner({ config, model, tools, runs, queue, evidence, events });
    const agent = new CorvusAgent({ config, tools, model, runner });

    const reply = await agent.send("hello durable agent");

    expect(reply).toMatchObject({ role: "assistant", content: "durable reply" });
    expect(agent.history()).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "hello durable agent" },
      { role: "assistant", content: "durable reply" },
    ]);
    expect(runs.listRuns()).toEqual([
      expect.objectContaining({
        goal: "hello durable agent",
        status: "succeeded",
      }),
    ]);
  });
});
