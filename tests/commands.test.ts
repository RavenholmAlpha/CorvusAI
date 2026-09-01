import { describe, expect, it } from "vitest";
import { CommandRegistry, createCoreCommands, parseSlashCommand } from "../src/commands.js";
import { createDefaultConfig } from "../src/config.js";

describe("slash commands", () => {
  it("rejects duplicate commands and disposes registrations safely", async () => {
    const registry = new CommandRegistry(); const command = { name: "temp", summary: "Temp", usage: "/temp", execute: () => ({ ok: true, message: "ok" }) };
    const dispose = registry.register(command); expect(() => registry.register(command)).toThrow("already registered"); expect(dispose()).toBe(true); expect(dispose()).toBe(false);
    const result = await registry.execute("/temp", { config: createDefaultConfig(), write: () => undefined }); expect(result.ok).toBe(false);
  });
  it("parses a slash command with quoted arguments", () => {
    expect(parseSlashCommand('/model "gpt-4.1-mini" --endpoint https://api.example.test/v1')).toEqual({
      name: "model",
      args: ["gpt-4.1-mini", "--endpoint", "https://api.example.test/v1"],
    });
  });

  it("configures the context window and tool rounds through /setting", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());

    await registry.execute("/setting context-window-tokens 2000000", { config, write: () => undefined });
    expect(config.contextWindowTokens).toBe(2_000_000);

    await registry.execute("/setting max-tool-rounds 30", { config, write: () => undefined });
    expect(config.maxToolRounds).toBe(30);
  });

  it("has long-running defaults by default", () => {
    const config = createDefaultConfig();
    expect(config.maxToolRounds).toBe(0);
    expect(config.contextWindowTokens).toBe(1_000_000);
    expect(config.compactionThreshold).toBe(700_000);
  });

  it("updates the active goal through /goal", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());

    const result = await registry.execute("/goal Build a permissioned agent", {
      config,
      write: () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(config.goal).toBe("Build a permissioned agent");
  });

  it("updates model and endpoint through /model", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());

    await registry.execute("/model gpt-4.1-mini --endpoint https://gateway.example/v1", {
      config,
      write: () => undefined,
    });

    expect(config.model).toBe("gpt-4.1-mini");
    expect(config.endpoint).toBe("https://gateway.example/v1");
  });

  it("shows a settings panel through /setting", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());
    let output = "";

    const result = await registry.execute("/setting", {
      config,
      write: (line) => {
        output += line;
      },
    });

    expect(result.ok).toBe(true);
    expect(output).toContain("Corvus Settings");
    expect(output).toContain("model");
    expect(output).toContain("endpoint");
    expect(output).toContain("/setting model");
  });

  it("shows a guided settings wizard through /setting wizard", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());
    let output = "";

    const result = await registry.execute("/setting wizard", {
      config,
      write: (line) => {
        output += line;
      },
    });

    expect(result.ok).toBe(true);
    expect(output).toContain("Corvus Setting Wizard");
    expect(output).toContain("1. Model");
    expect(output).toContain("2. Endpoint");
    expect(output).toContain("API key");
    expect(output).toContain("/setting model");
    expect(output).toContain("/setting endpoint");
    expect(output).toContain("/setting api-key");
  });

  it("updates model endpoint and runtime settings through /setting", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());
    let saves = 0;
    const context = {
      config,
      write: () => undefined,
      saveConfig: async () => {
        saves += 1;
      },
    };

    await registry.execute("/setting model corvus-large", context);
    await registry.execute("/setting endpoint https://gateway.example/openai/v1", context);
    await registry.execute("/setting api-key sk-test-direct-key", context);
    await registry.execute("/setting api-key-env CORVUS_API_KEY", context);
    await registry.execute("/setting temperature 0.6", context);
    await registry.execute("/setting max-tool-rounds 9", context);
    await registry.execute("/setting plugin-dir custom-plugins", context);

    expect(config.model).toBe("corvus-large");
    expect(config.endpoint).toBe("https://gateway.example/openai/v1");
    expect(config.apiKey).toBe("sk-test-direct-key");
    expect(config.apiKeyEnv).toBe("CORVUS_API_KEY");
    expect(config.temperature).toBe(0.6);
    expect(config.maxToolRounds).toBe(9);
    expect(config.pluginDir).toBe("custom-plugins");
    expect(saves).toBe(7);
  });

  it("masks configured API keys in command output", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());
    let output = "";

    const result = await registry.execute("/setting api-key sk-test-secret-value", {
      config,
      write: (line) => {
        output += line;
      },
    });

    expect(result.ok).toBe(true);
    expect(config.apiKey).toBe("sk-test-secret-value");
    expect(output).toContain("apiKey=sk-...alue");
    expect(output).not.toContain("sk-test-secret-value");
  });

  it("rejects invalid settings values", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());

    const temperature = await registry.execute("/setting temperature cold", {
      config,
      write: () => undefined,
    });
    const rounds = await registry.execute("/setting max-tool-rounds 501", {
      config,
      write: () => undefined,
    });
    const endpoint = await registry.execute("/setting endpoint ftp://example.test", {
      config,
      write: () => undefined,
    });

    expect(temperature.ok).toBe(false);
    expect(rounds.ok).toBe(false);
    expect(endpoint.ok).toBe(false);
  });

  it("updates permissions through /permission", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());

    await registry.execute("/permission tool:shell deny", {
      config,
      write: () => undefined,
    });

    expect(config.permissions.rules["tool:shell"]).toBe("deny");
  });

  it("toggles review mode through /review", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());

    await registry.execute("/review on", {
      config,
      write: () => undefined,
    });

    expect(config.review.enabled).toBe(true);
  });

  it("shows menu and status panels", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());
    let output = "";

    await registry.execute("/menu", {
      config,
      write: (line) => {
        output += `${line}\n`;
      },
    });
    await registry.execute("/status", {
      config,
      write: (line) => {
        output += `${line}\n`;
      },
      plugins: [{ name: "echo-plugin", version: "1.0.0", status: "loaded" }],
    });

    expect(output).toContain("Corvus Control Deck");
    expect(output).toContain("/setting");
    expect(output).toContain("Runtime Status");
    expect(output).toContain("Plugins: 1 loaded");
  });

  it("persists only commands that mutate configuration", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());
    let saves = 0;

    await registry.execute("/help", {
      config,
      write: () => undefined,
      saveConfig: async () => {
        saves += 1;
      },
    });

    await registry.execute("/goal Ship Corvus", {
      config,
      write: () => undefined,
      saveConfig: async () => {
        saves += 1;
      },
    });

    expect(saves).toBe(1);
  });

  it("writes unknown command feedback to the command output", async () => {
    const config = createDefaultConfig();
    const registry = new CommandRegistry(createCoreCommands());
    let output = "";

    const result = await registry.execute("/missing", {
      config,
      write: (line) => {
        output += line;
      },
    });

    expect(result.ok).toBe(false);
    expect(output).toContain("Unknown command /missing");
  });
});
