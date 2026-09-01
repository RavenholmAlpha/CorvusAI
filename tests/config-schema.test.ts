import { describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config.js";
import { migrateConfig, validateConfig } from "../src/config-schema.js";
import { createConfigBackedChatModel } from "../src/runtime.js";

describe("Agent OS configuration", () => {
  it("migrates legacy config and validates provider/role references", () => {
    const migrated = migrateConfig({ model: "legacy" });
    expect(migrated.schemaVersion).toBe(2);
    const config = createDefaultConfig();
    config.providers = { p: { id: "p", protocol: "openai-chat", endpoint: "https://provider.test/v1", apiKey: "key", models: ["m"], defaultModel: "m" } };
    config.agentRoles = { reviewer: { id: "reviewer", providerId: "missing" } };
    expect(validateConfig(config)).toEqual(expect.arrayContaining([expect.objectContaining({ path: "agentRoles.reviewer.providerId", level: "error" })]));
  });

  it("validates the persisted WebUI locale", () => { const config=createDefaultConfig(); config.webLocale="zh-CN"; expect(validateConfig(config).filter(item=>item.path==="webLocale")).toEqual([]); (config as any).webLocale="fr"; expect(validateConfig(config)).toEqual(expect.arrayContaining([expect.objectContaining({path:"webLocale",level:"error"})])); });

  it("falls back to a secondary provider after a primary provider error", async () => {
    const config = createDefaultConfig();
    config.mainProviderId = "primary";
    config.providers = {
      primary: { id: "primary", protocol: "openai-chat", endpoint: "https://primary.test/v1", apiKey: "p", models: ["primary-model"], defaultModel: "primary-model", fallbackProviderIds: ["fallback"], maxRetries: 0 },
      fallback: { id: "fallback", protocol: "openai-chat", endpoint: "https://fallback.test/v1", apiKey: "f", models: ["fallback-model"], defaultModel: "fallback-model" },
    };
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes("primary")) return new Response("failure", { status: 500 });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "fallback ok" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const result = await createConfigBackedChatModel(config, fetchImpl).createChatCompletion({ messages: [{ role: "user", content: "hello" }] });
    expect(result.choices[0]?.message.content).toBe("fallback ok");
    expect(urls.some((url) => url.includes("primary.test"))).toBe(true);
    expect(urls.some((url) => url.includes("fallback.test"))).toBe(true);
  });
});
