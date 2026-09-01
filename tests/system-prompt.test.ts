import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config.js";
import { buildSystemPrompt } from "../src/system-prompt.js";

describe("buildSystemPrompt", () => {
  it("includes the base persona with tool, output, and safety guidance", () => {
    const prompt = buildSystemPrompt(createDefaultConfig());
    expect(prompt).toContain("You are Corvus");
    expect(prompt).toContain("## Tools");
    expect(prompt).toContain("## Output style");
    expect(prompt).toContain("## Safety");
    expect(prompt).toContain("same language as the user");
    expect(prompt).toContain("Never fabricate");
  });

  it("appends the active goal and review instructions when enabled", () => {
    const config = createDefaultConfig();
    config.goal = "Build a dashboard";
    config.review.enabled = true;
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("Active goal: Build a dashboard");
    expect(prompt).toContain("Review mode instruction");
  });


  it("advertises configured roles and exact delegation syntax", () => {
    const config = createDefaultConfig();
    config.providers = { shared: { id: "shared", protocol: "openai-chat", endpoint: "https://example.com/v1", apiKey: "key", models: ["model"] } };
    config.agentRoles = { reviewer: { id: "reviewer", label: "审查员", providerId: "shared", systemPrompt: "Review changes for correctness and security." } };
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("reviewer (审查员)");
    expect(prompt).toContain("role: <id>");
    expect(prompt).toContain("manage_role");
    expect(prompt).toContain("Review changes for correctness and security");
  });

  it("loads workspace rules from .corvusrules", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-prompt-"));
    const rulePath = join(root, ".corvusrules");
    await rm(rulePath, { force: true });
    await import("node:fs/promises").then((fs) => fs.writeFile(rulePath, "Always use tabs\n", "utf8"));
    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      const prompt = buildSystemPrompt(createDefaultConfig());
      expect(prompt).toContain("Local Guidelines (.corvusrules)");
      expect(prompt).toContain("Always use tabs");
    } finally {
      process.chdir(previousCwd);
      await rm(root, { recursive: true, force: true });
    }
  });
});
