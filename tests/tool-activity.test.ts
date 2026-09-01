import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { CommandRegistry, createCoreCommands } from "../src/commands.js";
import { createDefaultConfig } from "../src/config.js";
import { createDefaultPolicy } from "../src/permissions.js";
import { RuntimeStateManager } from "../src/runtime-state.js";
import { ToolRegistry } from "../src/tools/index.js";
import { CorvusTui } from "../src/tui.js";

function makeSink(): { sink: Writable; getOutput: () => string } {
  let output = "";
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output += String(chunk);
      callback();
    },
  });
  return { sink, getOutput: () => output };
}

function makeTools(): ToolRegistry {
  const tools = new ToolRegistry(createDefaultPolicy());
  tools.register({
    name: "probe",
    description: "Probe tool",
    capability: "local",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => ({ ok: true, output: { fine: true } }),
  });
  return tools;
}

describe("tool activity routing", () => {
  it("writes tool progress to stdout in line mode", async () => {
    const { sink, getOutput } = makeSink();
    const tools = makeTools();
    const tui = new CorvusTui({
      config: createDefaultConfig(),
      commands: new CommandRegistry(createCoreCommands()),
      tools,
      agent: { send: async () => ({ role: "assistant", content: "unused" }) } as never,
      output: sink,
      initialMode: "line",
    });
    await tools.execute("probe", {});
    expect(getOutput()).toContain("正在调用工具: probe");
    expect(getOutput()).toContain("执行完毕");
  });

  it("keeps stdout clean in Ink mode", async () => {
    const { sink, getOutput } = makeSink();
    const tools = makeTools();
    const tui = new CorvusTui({
      config: createDefaultConfig(),
      commands: new CommandRegistry(createCoreCommands()),
      tools,
      agent: { send: async () => ({ role: "assistant", content: "unused" }) } as never,
      output: sink,
      initialMode: "stream",
    });
    await tools.execute("probe", {});
    expect(getOutput()).not.toContain("正在调用工具");
    expect(getOutput()).not.toContain("执行完毕");
  });
});

describe("RuntimeStateManager tool activity", () => {
  it("appends activity and caps the list at 20", () => {
    const manager = new RuntimeStateManager();
    for (let i = 0; i < 25; i += 1) {
      manager.addToolActivity({ id: `t${i}`, toolName: "probe", status: "running", startedAt: i });
    }
    expect(manager.get().toolActivity).toHaveLength(20);
    expect(manager.get().toolActivity[0]?.id).toBe("t5");
  });

  it("updates activity by id without touching others", () => {
    const manager = new RuntimeStateManager();
    manager.addToolActivity({ id: "a1", toolName: "x", status: "running", startedAt: 1 });
    manager.addToolActivity({ id: "a2", toolName: "y", status: "running", startedAt: 2 });
    manager.updateToolActivity("a1", { status: "succeeded", elapsedMs: 10 });
    expect(manager.get().toolActivity.find((a) => a.id === "a1")).toMatchObject({
      status: "succeeded",
      elapsedMs: 10,
    });
    expect(manager.get().toolActivity.find((a) => a.id === "a2")).toMatchObject({ status: "running" });
  });

  it("requestExit flags the app for termination", () => {
    const manager = new RuntimeStateManager();
    expect(manager.get().exitRequested).toBe(false);
    manager.requestExit();
    expect(manager.get().exitRequested).toBe(true);
  });
});