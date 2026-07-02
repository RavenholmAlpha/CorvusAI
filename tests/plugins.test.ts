import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlugins } from "../src/plugins.js";
import { createDefaultPolicy } from "../src/permissions.js";
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

    expect(loaded).toEqual([{ name: "echo-plugin", version: "1.0.0", status: "loaded" }]);
    await expect(tools.execute("echo_plugin", { text: "hello" })).resolves.toEqual({ text: "hello" });
  });
});
