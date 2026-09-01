import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CommandDefinition } from "../src/commands.js";
import { loadPlugins, PluginRuntimeManager, type PluginApi } from "../src/plugins.js";
import { createDefaultPolicy } from "../src/permissions.js";
import { createToolManifest } from "../src/tools/protocol.js";
import { ToolRegistry } from "../src/tools/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("plugin loader", () => {
  it("loads plugin manifests and registers plugin tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-plugin-"));
    roots.push(root);
    const pluginDir = join(root, "echo-plugin");
    await mkdir(pluginDir);
    await writeFile(
      join(pluginDir, "corvus.plugin.json"),
      JSON.stringify({ name: "echo-plugin", version: "1.0.0", entry: "index.mjs" }),
    );
    await writeFile(
      join(pluginDir, "index.mjs"),
      [
        "export default function activate(api) {",
        "  api.registerTool({",
        "    name: 'echo_plugin',",
        "    description: 'Echo text from a plugin',",
        "    capability: 'local',",
        "    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },",
        "    execute: async ({ text }) => ({ text })",
        "  });",
        "}",
      ].join("\n"),
    );

    const tools = new ToolRegistry(createDefaultPolicy());
    const loaded = await loadPlugins(root, { tools });

    expect(loaded).toEqual([{ id: "echo-plugin", name: "echo-plugin", version: "1.0.0", runtime: "native", status: "loaded", capabilities: [] }]);
    await expect(tools.execute("echo_plugin", { text: "hello" })).resolves.toEqual({ text: "hello" });
  });

  it("allows plugin APIs to register protocol manifests", async () => {
    const tools = new ToolRegistry(createDefaultPolicy());
    const api: PluginApi = {
      registerTool: (tool) => tools.register(tool),
    };

    api.registerTool(
      createToolManifest({
        name: "manifest_plugin",
        namespace: "plugin",
        version: "1.0.0",
        description: "Echo text from a manifest plugin",
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
        concurrency: { perTool: 1, perRun: 1, global: 1 },
        evidencePolicy: "summary",
        resources: [],
        execute: async ({ text }) => ({ ok: true, output: { text } }),
      }),
    );

    await expect(tools.execute("manifest_plugin", { text: "hello" })).resolves.toEqual({ text: "hello" });
  });

  it("does not register plugin tools when activation fails after registration", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-plugin-"));
    roots.push(root);
    const pluginDir = join(root, "broken-plugin");
    await mkdir(pluginDir);
    await writeFile(
      join(pluginDir, "corvus.plugin.json"),
      JSON.stringify({ name: "broken-plugin", version: "1.0.0", entry: "index.mjs" }),
    );
    await writeFile(
      join(pluginDir, "index.mjs"),
      [
        "export default function activate(api) {",
        "  api.registerTool({",
        "    name: 'broken_tool',",
        "    description: 'Should not be committed',",
        "    capability: 'local',",
        "    parameters: { type: 'object', properties: {}, additionalProperties: false },",
        "    execute: () => ({ ok: true })",
        "  });",
        "  throw new Error('activation failed');",
        "}",
      ].join("\n"),
    );

    const tools = new ToolRegistry(createDefaultPolicy());
    const loaded = await loadPlugins(root, { tools });

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ name: "broken-plugin", status: "failed", error: "activation failed" });
    await expect(tools.execute("broken_tool", {})).rejects.toThrow("Unknown tool: broken_tool");
  });

  it("removes registrations and calls teardown during managed shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-plugin-")); roots.push(root); const pluginDir = join(root, "managed"); await mkdir(pluginDir);
    await writeFile(join(pluginDir, "corvus.plugin.json"), JSON.stringify({ id: "managed", name: "Managed", version: "1.0.0", apiVersion: 1, runtime: { type: "native", entry: "index.mjs" }, capabilities: { required: [], optional: [] } }));
    await writeFile(join(pluginDir, "index.mjs"), "export default api => { api.registerTool({name:'managed_tool',description:'Managed',capability:'local',parameters:{type:'object',properties:{}},execute:()=> 'ok'}); return () => { globalThis.__corvusPluginStopped = true; }; };");
    const registry = new ToolRegistry(createDefaultPolicy()); const manager = new PluginRuntimeManager(root, { tools: registry }); await manager.startAll();
    await expect(registry.execute("managed_tool", {})).resolves.toBe("ok"); await manager.stopAll(); await expect(registry.execute("managed_tool", {})).rejects.toThrow("Unknown tool"); expect((globalThis as any).__corvusPluginStopped).toBe(true); delete (globalThis as any).__corvusPluginStopped;
  });

  it("runs worker plugins out of process with a minimal environment", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-plugin-")); roots.push(root); const dir = join(root, "worker"); await mkdir(dir);
    await writeFile(join(dir, "corvus.plugin.json"), JSON.stringify({ id: "worker", name: "Worker", version: "1.0.0", apiVersion: 1, runtime: { type: "worker", entry: "index.mjs" }, capabilities: { required: [], optional: [] } }));
    await writeFile(join(dir, "index.mjs"), "export default api => api.registerTool({name:'worker_echo',description:'Worker echo',capability:'local',parameters:{type:'object',properties:{text:{type:'string'}}},execute:async({text})=>({text,secretVisible:Boolean(process.env.OPENAI_API_KEY),networkBlocked:await fetch('https://example.com').then(()=>false).catch(()=>true)})});");
    const registry = new ToolRegistry(createDefaultPolicy()); const manager = new PluginRuntimeManager(root, { tools: registry }); const records = await manager.startAll();
    expect(records[0].status).toBe("loaded"); await expect(registry.execute("worker_echo", { text: "hi" })).resolves.toEqual({ text: "hi", secretVisible: false, networkBlocked: true }); await manager.stopAll();
  });

  it("does not register plugin commands when activation fails after registration", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-plugin-"));
    roots.push(root);
    const pluginDir = join(root, "broken-command-plugin");
    await mkdir(pluginDir);
    await writeFile(
      join(pluginDir, "corvus.plugin.json"),
      JSON.stringify({ name: "broken-command-plugin", version: "1.0.0", entry: "index.mjs" }),
    );
    await writeFile(
      join(pluginDir, "index.mjs"),
      [
        "export default function activate(api) {",
        "  api.registerCommand({",
        "    name: 'broken_command',",
        "    summary: 'Should not be committed',",
        "    usage: '/broken_command',",
        "    execute: () => ({ ok: true, message: 'unreachable' })",
        "  });",
        "  throw new Error('command activation failed');",
        "}",
      ].join("\n"),
    );

    const tools = new ToolRegistry(createDefaultPolicy());
    const commands: CommandDefinition[] = [];
    const loaded = await loadPlugins(root, { tools, registerCommand: (command) => commands.push(command) });

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      name: "broken-command-plugin",
      status: "failed",
      error: "command activation failed",
    });
    expect(commands).toEqual([]);
  });
});
