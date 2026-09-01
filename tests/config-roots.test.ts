import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultConfig, getConfigRoot, getGlobalPluginsRoot, getGlobalSkillsRoot, getProjectConfigPath, loadLayeredConfig, migrateLegacyConfigRoot, saveConfig } from "../src/config.js";

describe("configuration roots", () => {
  const previous = process.env.CORVUS_HOME;
  afterEach(() => { if (previous === undefined) delete process.env.CORVUS_HOME; else process.env.CORVUS_HOME = previous; });
  it("uses the user-level CORVUS_HOME and standard tiers", () => {
    process.env.CORVUS_HOME = join("x:", "users", "tester", ".corvus");
    expect(getConfigRoot()).toBe(process.env.CORVUS_HOME);
    expect(getGlobalSkillsRoot()).toBe(join(process.env.CORVUS_HOME, "skills"));
    expect(getGlobalPluginsRoot()).toBe(join(process.env.CORVUS_HOME, "plugins"));
    expect(getProjectConfigPath(join("x:", "work"))).toBe(join("x:", "work", ".corvus", "config.json"));
  });

  it("migrates legacy data non-destructively and merges workspace maps", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-config-")); const legacy = join(root, "legacy"); const home = join(root, "home"); const workspace = join(root, "workspace");
    try {
      await mkdir(legacy, { recursive: true }); await writeFile(join(legacy, "corvus.db"), "db");
      expect(await migrateLegacyConfigRoot(legacy, home)).toBe(true); expect(await readFile(join(home, "corvus.db"), "utf8")).toBe("db"); expect(await migrateLegacyConfigRoot(legacy, home)).toBe(false);
      process.env.CORVUS_HOME = home; const global = createDefaultConfig(); global.mcpServers = { global: { command: "global" } }; await saveConfig(global);
      await mkdir(join(workspace, ".corvus"), { recursive: true }); await writeFile(getProjectConfigPath(workspace), JSON.stringify({ mcpServers: { local: { command: "local" } }, sandbox: { workspaceRoot: workspace } }));
      const layered = await loadLayeredConfig(workspace); expect(Object.keys(layered.mcpServers ?? {}).sort()).toEqual(["global", "local"]); expect(layered.sandbox?.workspaceRoot).toBe(workspace);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
