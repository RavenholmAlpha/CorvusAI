import { describe, expect, it } from "vitest";
import { CommandRegistry, createCoreCommands, type CommandContext } from "../src/commands.js";
import { createDefaultConfig } from "../src/config.js";
import type {
  ApprovalRow,
  ApprovalStatus,
  DecisionScope,
  EvidenceRow,
  MessageRow,
  RunRow,
  RunStatus,
  SnapshotRow,
} from "../src/harness/types.js";
import { createToolManifest, type ToolManifest } from "../src/tools/protocol.js";

interface TestHarness {
  listRuns: () => RunRow[];
  getRun: (id: string) => RunRow | undefined;
  listMessages: (runId: string) => MessageRow[];
  latestSnapshot: (runId: string) => SnapshotRow | undefined;
  cancelRun: (id: string) => RunRow | undefined;
  resumeRun?: (id: string) => Promise<RunRow | undefined> | RunRow | undefined;
  listPendingApprovals: (runId?: string) => ApprovalRow[];
  resolveApproval: (id: string, status: ApprovalStatus, scope: DecisionScope) => ApprovalRow;
  runApproved: (
    toolCallId: string,
    tool: ToolManifest,
  ) => Promise<{ toolCallId: string; status: string; evidenceId?: string }>;
  getEvidence: (id: string) => EvidenceRow | undefined;
  listEvidence: (runId: string) => EvidenceRow[];
}

const run: RunRow = {
  id: "run_1",
  status: "waiting_for_approval",
  goal: "Ship durable commands",
  model: "test-model",
  endpoint: "https://example.test/v1",
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:01:00.000Z",
  completedAt: null,
};

const laterRun: RunRow = {
  ...run,
  id: "run_2",
  goal: "Collect evidence",
  createdAt: "2026-07-03T00:02:00.000Z",
  updatedAt: "2026-07-03T00:03:00.000Z",
};

const approval: ApprovalRow = {
  id: "appr_1",
  runId: run.id,
  toolCallId: "tool_1",
  toolName: "echo",
  status: "pending",
  decisionScope: "once",
  createdAt: "2026-07-03T00:01:00.000Z",
  decidedAt: null,
};

const evidence: EvidenceRow = {
  id: "ev_1",
  runId: run.id,
  sourceType: "system",
  sourceId: "setup",
  title: "Setup note",
  summary: "Prepared harness",
  content: "Full setup details",
  createdAt: "2026-07-03T00:01:00.000Z",
};

const laterEvidence: EvidenceRow = {
  ...evidence,
  id: "ev_2",
  runId: laterRun.id,
  title: "Latest note",
  summary: "Most recent evidence",
  content: "Latest evidence details",
  createdAt: "2026-07-03T00:04:00.000Z",
};

function createHarness(overrides: Partial<TestHarness> = {}): TestHarness {
  return {
    listRuns: () => [],
    getRun: () => undefined,
    listMessages: () => [],
    latestSnapshot: () => undefined,
    cancelRun: () => undefined,
    listPendingApprovals: () => [],
    resolveApproval: (id, status, scope) => ({
      ...approval,
      id,
      status,
      decisionScope: scope,
      decidedAt: "2026-07-03T00:05:00.000Z",
    }),
    runApproved: async (toolCallId) => ({ toolCallId, status: "succeeded", evidenceId: "ev_executed" }),
    getEvidence: () => undefined,
    listEvidence: () => [],
    ...overrides,
  };
}

function echoTool(): ToolManifest {
  return createToolManifest({
    name: "echo",
    namespace: "test",
    version: "1.0.0",
    description: "Echo",
    capability: "local",
    risk: "low",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    timeoutMs: 1000,
    outputLimitBytes: 1000,
    concurrency: { perTool: 1, perRun: 1, global: 1 },
    evidencePolicy: "summary",
    resources: [],
    execute: () => ({ ok: true, output: "echo" }),
  });
}

async function execute(
  input: string,
  options: {
    harness?: TestHarness;
    tools?: ToolManifest[];
  } = {},
): Promise<{ output: string; ok: boolean }> {
  const registry = new CommandRegistry(createCoreCommands());
  let output = "";
  const context = {
    config: createDefaultConfig(),
    harness: options.harness,
    tools: options.tools ? ({ list: () => options.tools } as never) : undefined,
    write: (line: string) => {
      output += `${line}\n`;
    },
  } as CommandContext & { harness?: TestHarness };

  const result = await registry.execute(input, context);
  return { output, ok: result.ok };
}

describe("durable harness slash commands", () => {
  it("shows empty durable state without a harness or stored rows", async () => {
    expect((await execute("/runs")).output).toContain("No durable runs available.");
    expect((await execute("/runs", { harness: createHarness() })).output).toContain("No durable runs available.");
    expect((await execute("/approvals", { harness: createHarness() })).output).toContain("No pending approvals.");
    expect((await execute("/evidence last", { harness: createHarness() })).output).toContain("No evidence available.");
  });

  it("lists durable runs and shows a selected run with messages and latest snapshot", async () => {
    const harness = createHarness({
      listRuns: () => [run],
      getRun: (id) => (id === run.id ? run : undefined),
      listMessages: () => [
        {
          id: "msg_1",
          runId: run.id,
          role: "user",
          content: "Build it",
          toolCallId: null,
          metadata: null,
          createdAt: "2026-07-03T00:00:01.000Z",
        },
        {
          id: "msg_2",
          runId: run.id,
          role: "assistant",
          content: "Need approval",
          toolCallId: null,
          metadata: null,
          createdAt: "2026-07-03T00:00:02.000Z",
        },
      ],
      latestSnapshot: () => ({
        id: "snap_1",
        runId: run.id,
        snapshot: { phase: "waiting_for_approval", round: 1 },
        createdAt: "2026-07-03T00:00:03.000Z",
      }),
    });

    const list = await execute("/runs", { harness });
    const details = await execute(`/run ${run.id}`, { harness });
    const missing = await execute("/run missing", { harness });

    expect(list.output).toContain("run_1");
    expect(list.output).toContain("waiting_for_approval");
    expect(list.output).toContain("Ship durable commands");
    expect(details.output).toContain("Run run_1");
    expect(details.output).toContain("Status: waiting_for_approval");
    expect(details.output).toContain("user: Build it");
    expect(details.output).toContain("assistant: Need approval");
    expect(details.output).toContain("waiting_for_approval");
    expect(missing.output).toContain("Run not found: missing");
  });

  it("cancels runs through the harness adapter and reports resume as unavailable when not implemented", async () => {
    const canceled: Array<{ id: string; status: RunStatus }> = [];
    const harness = createHarness({
      getRun: (id) => (id === run.id ? run : undefined),
      cancelRun: (id) => {
        if (id !== run.id) {
          return undefined;
        }
        const canceledRun = { ...run, status: "canceled" as const };
        canceled.push({ id, status: canceledRun.status });
        return canceledRun;
      },
    });

    expect((await execute("/cancel")).output).toContain("Usage: /cancel <id>");
    expect((await execute("/cancel run_1")).output).toContain("Durable harness unavailable.");
    expect((await execute("/cancel missing", { harness })).output).toContain("Run not found: missing");
    expect((await execute("/cancel run_1", { harness })).output).toContain("Run run_1 canceled.");
    expect(canceled).toEqual([{ id: "run_1", status: "canceled" }]);
    expect((await execute("/resume run_1", { harness })).output).toMatch(/resume .*not implemented/i);
  });

  it("does not cancel terminal durable runs", async () => {
    const canceled: string[] = [];
    const succeeded = { ...run, status: "succeeded" as const, completedAt: "2026-07-03T00:02:00.000Z" };
    const harness = createHarness({
      getRun: (id) => (id === succeeded.id ? succeeded : undefined),
      cancelRun: (id) => {
        canceled.push(id);
        return { ...succeeded, status: "canceled" as const };
      },
    });

    const result = await execute("/cancel run_1", { harness });

    expect(result.ok).toBe(false);
    expect(result.output).toContain("already terminal with status succeeded");
    expect(canceled).toEqual([]);
  });

  it("lists, approves, executes, and denies pending approvals", async () => {
    const approved: Array<{ id: string; status: ApprovalStatus; scope: DecisionScope }> = [];
    const denied: Array<{ id: string; status: ApprovalStatus; scope: DecisionScope }> = [];
    const executed: string[] = [];
    const harness = createHarness({
      listPendingApprovals: () => [
        approval,
        { ...approval, id: "appr_2", toolCallId: "tool_2", toolName: "missing_tool" },
      ],
      resolveApproval: (id, status, scope) => {
        if (status === "approved") {
          approved.push({ id, status, scope });
        } else if (status === "denied") {
          denied.push({ id, status, scope });
        }
        return {
          ...approval,
          id,
          toolCallId: id === "appr_2" ? "tool_2" : "tool_1",
          toolName: id === "appr_2" ? "missing_tool" : "echo",
          status,
          decisionScope: scope,
          decidedAt: "2026-07-03T00:05:00.000Z",
        };
      },
      runApproved: async (toolCallId) => {
        executed.push(toolCallId);
        return { toolCallId, status: "succeeded", evidenceId: "ev_executed" };
      },
    });

    const list = await execute("/approvals", { harness });
    const approve = await execute("/approve appr_1", { harness, tools: [echoTool()] });
    const deny = await execute("/deny all", { harness });

    expect(list.output).toContain("appr_1");
    expect(list.output).toContain("echo");
    expect(approve.output).toContain("Approval appr_1 approved.");
    expect(approve.output).toContain("Tool call tool_1 executed: succeeded");
    expect(executed).toEqual(["tool_1"]);
    expect(approved).toEqual([{ id: "appr_1", status: "approved", scope: "once" }]);
    expect(deny.output).toContain("Approval appr_1 denied.");
    expect(deny.output).toContain("Approval appr_2 denied.");
    expect(denied).toEqual([
      { id: "appr_1", status: "denied", scope: "once" },
      { id: "appr_2", status: "denied", scope: "once" },
    ]);
  });

  it("keeps an approval pending when approving requires a missing tool manifest", async () => {
    const resolved: string[] = [];
    const harness = createHarness({
      listPendingApprovals: () => [{ ...approval, toolName: "missing_tool" }],
      resolveApproval: (id, status, scope) => {
        resolved.push(id);
        return { ...approval, id, toolName: "missing_tool", status, decisionScope: scope };
      },
    });

    const result = await execute("/approve appr_1", { harness, tools: [echoTool()] });

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Approval appr_1 remains pending");
    expect(result.output).toContain("missing_tool");
    expect(resolved).toEqual([]);
  });

  it("can retry approved tool execution by approval id after runApproved throws", async () => {
    const approved: Array<{ id: string; status: ApprovalStatus; scope: DecisionScope }> = [];
    const executed: string[] = [];
    let attempts = 0;
    let alreadyApproved = false;
    const harness = createHarness({
      listPendingApprovals: () => (alreadyApproved ? [] : [approval]),
      resolveApproval: (id, status, scope) => {
        approved.push({ id, status, scope });
        alreadyApproved = status === "approved";
        return {
          ...approval,
          id,
          status,
          decisionScope: scope,
          decidedAt: "2026-07-03T00:05:00.000Z",
        };
      },
      runApproved: async (toolCallId) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary execution failure");
        }
        executed.push(toolCallId);
        return { toolCallId, status: "succeeded", evidenceId: "ev_executed" };
      },
    });

    const first = await execute("/approve appr_1", { harness, tools: [echoTool()] });
    const second = await execute("/approve appr_1", { harness, tools: [echoTool()] });

    expect(first.ok).toBe(false);
    expect(first.output).toContain("Approval appr_1 approved, but tool call tool_1 execution failed");
    expect(second.ok).toBe(true);
    expect(second.output).toContain("Tool call tool_1 executed: succeeded");
    expect(approved).toEqual([
      { id: "appr_1", status: "approved", scope: "once" },
      { id: "appr_1", status: "approved", scope: "once" },
    ]);
    expect(executed).toEqual(["tool_1"]);
  });

  it("shows evidence by id or the latest evidence from the most recent run", async () => {
    const harness = createHarness({
      listRuns: () => [run, laterRun],
      getEvidence: (id) => (id === evidence.id ? evidence : undefined),
      listEvidence: (runId) => (runId === laterRun.id ? [laterEvidence] : []),
    });

    const byId = await execute("/evidence ev_1", { harness });
    const last = await execute("/evidence last", { harness });
    const missing = await execute("/evidence missing", { harness });

    expect(byId.output).toContain("Evidence ev_1");
    expect(byId.output).toContain("Prepared harness");
    expect(last.output).toContain("Evidence ev_2");
    expect(last.output).toContain("Most recent evidence");
    expect(missing.output).toContain("Evidence not found: missing");
  });

  it("surfaces durable command entry points in help, menu, and status", async () => {
    const help = await execute("/help");
    const menu = await execute("/menu", { harness: createHarness({ listRuns: () => [run] }) });
    const status = await execute("/status", { harness: createHarness({ listRuns: () => [run] }) });

    expect(help.output).toContain("/runs");
    expect(help.output).toContain("/approvals");
    expect(menu.output).toContain("/runs");
    expect(menu.output).toContain("/approvals");
    expect(status.output).toContain("Durable harness: available");
    expect(status.output).toContain("Durable runs: 1");
  });
});
