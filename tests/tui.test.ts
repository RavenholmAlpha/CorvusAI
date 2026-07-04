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

  it("runs /setting wizard as an interactive TUI flow", async () => {
    const config = createDefaultConfig();
    let output = "";
    let saves = 0;
    let agentCalls = 0;
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const tui = new CorvusTui({
      config,
      commands: new CommandRegistry(createCoreCommands()),
      agent: {
        send: async () => {
          agentCalls += 1;
          return { role: "assistant", content: "unused" };
        },
      } as never,
      input: Readable.from([
        "/setting wizard\n",
        "corvus-large\n",
        "https://gateway.example/v1\n",
        "CORVUS_API_KEY\n",
        "0.4\n",
        "7\n",
        "custom-plugins\n",
        "off\n",
        "Ship Corvus\n",
        "/exit\n",
      ]),
      output: sink,
      saveConfig: async () => {
        saves += 1;
      },
    });

    await tui.start();

    expect(agentCalls).toBe(0);
    expect(saves).toBe(1);
    expect(config.model).toBe("corvus-large");
    expect(config.endpoint).toBe("https://gateway.example/v1");
    expect(config.apiKeyEnv).toBe("CORVUS_API_KEY");
    expect(config.temperature).toBe(0.4);
    expect(config.maxToolRounds).toBe(7);
    expect(config.pluginDir).toBe("custom-plugins");
    expect(config.review.enabled).toBe(false);
    expect(config.goal).toBe("Ship Corvus");
    expect(output).toContain("Interactive Setting Wizard");
    expect(output).toContain("Model [gpt-4.1-mini]");
    expect(output).toContain("Setting wizard complete.");
  });
});
