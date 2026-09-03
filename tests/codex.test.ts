import { describe, expect, it } from "vitest";
import { detectCodexCli } from "../src/codex/detector.js";
import { createBuiltInTools, ToolRegistry } from "../src/tools/index.js";
import { createDefaultPolicy } from "../src/permissions.js";

describe("Codex CLI Integration", () => {
  it("detects Codex CLI installation or returns informative error without throwing", async () => {
    const result = await detectCodexCli();
    expect(result).toBeDefined();
    expect(typeof result.installed).toBe("boolean");
    if (result.installed) {
      expect(result.path).toBeDefined();
      expect(result.version).toContain("codex");
    } else {
      expect(result.error).toBeDefined();
    }
  });

  it("handles non-existent configured path gracefully", async () => {
    const fakePath = "D:/path/that/does/not/exist/codex-bin.exe";
    const result = await detectCodexCli(fakePath, true);
    expect(result.installed).toBe(false);
  });

  it("registers dispatch_codex_task in tool registry with valid parameters", () => {
    const registry = new ToolRegistry(createDefaultPolicy());
    registry.registerMany(createBuiltInTools());

    const tools = registry.toOpenAITools();
    const codexTool = tools.find((t) => t.function.name === "dispatch_codex_task");
    expect(codexTool).toBeDefined();
    expect(codexTool?.function.description).toContain("Codex");
    const params = codexTool?.function.parameters as any;
    expect(params.properties.projectId).toBeDefined();
    expect(params.properties.prompt).toBeDefined();
    expect(params.properties.model).toBeDefined();
    expect(params.properties.sandbox).toBeDefined();
  });
});
