import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))); roots.length = 0; });

describe("provider configuration migration", () => {
  it("preserves the legacy main API key when a provider has an empty key", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-provider-"));
    roots.push(root);
    const path = join(root, "config.json");
    await writeFile(path, JSON.stringify({ endpoint: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "legacy-secret", mainProviderId: "deepseek", providers: { deepseek: { id: "deepseek", protocol: "openai-chat", endpoint: "https://api.deepseek.com/v1", apiKey: "", models: ["deepseek-chat"], defaultModel: "deepseek-chat" } } }));
    const config = await loadConfig(path);
    expect(config.providers?.deepseek?.apiKey).toBe("legacy-secret");
    expect(config.mainProviderId).toBe("deepseek");
  });
});
