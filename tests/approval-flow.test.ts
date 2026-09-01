import { describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config.js";
import { createDefaultPolicy } from "../src/permissions.js";
import { ToolRegistry } from "../src/tools/index.js";
import type { DurableHarnessAdapter } from "../src/commands.js";
import { handleApprovalChoice } from "../src/ui/approval-flow.js";

function makeHarness() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const harness = {
    resolveApproval: (id: string, status: string, scope: string) => {
      calls.push({ method: "resolveApproval", args: [id, status, scope] });
      return { id, status, scope };
    },
    runApproved: async (toolCallId: string, tool: { name: string }) => {
      calls.push({ method: "runApproved", args: [toolCallId, tool.name] });
      return { toolCallId, status: "succeeded" as const };
    },
  } as unknown as DurableHarnessAdapter;
  return { harness, calls };
}

function makeTools(): ToolRegistry {
  const tools = new ToolRegistry(createDefaultPolicy());
  tools.register({
    name: "ask_echo",
    description: "Ask echo",
    capability: "network",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => ({ ok: true, output: {} }),
  });
  return tools;
}

const approval = {
  approvalId: "appr_1",
  toolCallId: "tc_1",
  toolName: "ask_echo",
};

describe("handleApprovalChoice", () => {
  it("allow once approves and executes the tool", async () => {
    const { harness, calls } = makeHarness();
    const config = createDefaultConfig();
    const result = await handleApprovalChoice("allow once", approval, { harness, tools: makeTools(), config });
    expect(result).toEqual({ approved: true, executed: true });
    expect(calls).toContainEqual({ method: "resolveApproval", args: ["appr_1", "approved", "once"] });
    expect(calls).toContainEqual({ method: "runApproved", args: ["tc_1", "ask_echo"] });
  });

  it("deny rejects without executing and without changing rules", async () => {
    const { harness, calls } = makeHarness();
    const config = createDefaultConfig();
    const result = await handleApprovalChoice("deny", approval, { harness, tools: makeTools(), config });
    expect(result).toEqual({ approved: false, executed: false });
    expect(calls).toContainEqual({ method: "resolveApproval", args: ["appr_1", "denied", "once"] });
    expect(calls.some((call) => call.method === "runApproved")).toBe(false);
  });

  it("always persists an allow rule and executes", async () => {
    const { harness, calls } = makeHarness();
    const config = createDefaultConfig();
    let saved = 0;
    const result = await handleApprovalChoice("always", approval, {
      harness,
      tools: makeTools(),
      config,
      saveConfig: async () => {
        saved += 1;
      },
    });
    expect(result).toEqual({ approved: true, executed: true });
    expect(calls).toContainEqual({ method: "resolveApproval", args: ["appr_1", "approved", "always"] });
    expect(config.permissions.rules["tool:ask_echo"]).toBe("allow");
    expect(saved).toBe(1);
  });

  it("never persists a deny rule and skips execution", async () => {
    const { harness, calls } = makeHarness();
    const config = createDefaultConfig();
    const result = await handleApprovalChoice("never", approval, { harness, tools: makeTools(), config });
    expect(result).toEqual({ approved: false, executed: false });
    expect(calls).toContainEqual({ method: "resolveApproval", args: ["appr_1", "denied", "never"] });
    expect(config.permissions.rules["tool:ask_echo"]).toBe("deny");
    expect(calls.some((call) => call.method === "runApproved")).toBe(false);
  });

  it("workspace persists a cwd-scoped allow rule", async () => {
    const { harness } = makeHarness();
    const config = createDefaultConfig();
    const cwd = "D:\\some\\workspace";
    await handleApprovalChoice("workspace", approval, { harness, tools: makeTools(), config, cwd });
    expect(config.permissions.workspaceRules?.[cwd]?.["tool:ask_echo"]).toBe("allow");
  });
});