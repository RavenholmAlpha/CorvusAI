import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { CommandRegistry, createCoreCommands } from "../src/commands.js";
import { createDefaultConfig } from "../src/config.js";
import { createDefaultPolicy } from "../src/permissions.js";
import { createBuiltInTools, ToolRegistry } from "../src/tools/index.js";
import { CorvusTui } from "../src/tui.js";

describe("CorvusTui", () => {
  it("processes piped slash commands and exits cleanly", async () => {
    let output = "";
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const tui = new CorvusTui({
      config: createDefaultConfig(),
      commands: new CommandRegistry(createCoreCommands()),
      agent: {
        send: async () => ({ role: "assistant", content: "unused" }),
      } as never,
      input: Readable.from(["/help\n", "/exit\n"]),
      output: sink,
    });

    await expect(tui.start()).resolves.toBeUndefined();
    expect(output).toContain("CORVUS");
    expect(output).toContain("Corvus commands:");
    expect(output).toContain("Stopping Corvus.");
  });

  it("passes registered tools to slash commands", async () => {
    let output = "";
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const tools = new ToolRegistry(createDefaultPolicy());
    tools.registerMany(createBuiltInTools());
    const tui = new CorvusTui({
      config: createDefaultConfig(),
      commands: new CommandRegistry(createCoreCommands()),
      tools,
      agent: {
        send: async () => ({ role: "assistant", content: "unused" }),
      } as never,
      input: Readable.from(["/tools\n", "/exit\n"]),
      output: sink,
    });

    await tui.start();

    expect(output).toContain("read_file");
    expect(output).toContain("shell");
  });
});
