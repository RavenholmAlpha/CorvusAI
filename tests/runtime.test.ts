import { describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config.js";
import { createConfigBackedChatModel, resolveMainModel, resolveModelSettings } from "../src/runtime.js";

describe("config backed chat model", () => {

  it("uses the latest model and endpoint from config for each request", async () => {
    const config = createDefaultConfig();
    config.apiKey = "test-key";
    config.model = "model-a";
    config.endpoint = "https://one.example/v1";
    const calls: Array<{ url: string; body: { model: string } }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      calls.push({
        url: String(url),
        body: { model: body.model },
      });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const model = createConfigBackedChatModel(config, fetchImpl);
    await model.createChatCompletion({ messages: [], tools: [] });

    config.model = "model-b";
    config.endpoint = "https://two.example/openai/v1";
    await model.createChatCompletion({ messages: [], tools: [] });

    expect(calls).toEqual([
      { url: "https://one.example/v1/chat/completions", body: { model: "model-a" } },
      { url: "https://two.example/openai/v1/chat/completions", body: { model: "model-b" } },
    ]);
  });

  it("uses the plaintext API key from the config", async () => {
    const config = createDefaultConfig();
    config.apiKey = "stored-key";
    const calls: Array<{ authorization?: string }> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      calls.push({ authorization: headers.authorization });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const model = createConfigBackedChatModel(config, fetchImpl);
    await model.createChatCompletion({ messages: [], tools: [] });

    expect(calls[0]?.authorization).toBe("Bearer stored-key");
  });

  it("builds an isolated chat client from a specialist model profile", async () => {
    const { createProfileBackedChatModel } = await import("../src/runtime.js");
    const calls: Array<{ url: string; body: { model: string } }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      calls.push({ url: String(url), body });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const profile = { id: "gemini-frontend", endpoint: "https://gemini.example/v1", model: "gemini-pro", apiKey: "profile-key", temperature: 0.4 };
    await createProfileBackedChatModel(profile, fetchImpl).createChatCompletion({ messages: [], tools: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://gemini.example/v1/chat/completions");
    expect(calls[0]?.body).toMatchObject({ model: "gemini-pro", temperature: 0.4 });
  });


  it("uses the selected provider registry entry for the main agent", async () => {
    const config = createDefaultConfig();
    config.endpoint = "https://legacy.example/v1";
    config.model = "legacy-model";
    config.apiKey = "legacy-key";
    config.mainProviderId = "deepseek";
    config.providers = {
      deepseek: { id: "deepseek", protocol: "openai-chat", endpoint: "https://api.deepseek.com/v1", apiKey: "deepseek-key", models: ["deepseek-chat"], defaultModel: "deepseek-chat", temperature: 0.6 },
    };
    const calls: Array<{ url: string; body: Record<string, unknown>; authorization?: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = init?.headers as Record<string, string>;
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), authorization: headers.authorization });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await createConfigBackedChatModel(config, fetchImpl).createChatCompletion({ messages: [], tools: [] });
    expect(calls[0]).toMatchObject({ url: "https://api.deepseek.com/v1/chat/completions", authorization: "Bearer deepseek-key", body: { model: "deepseek-chat", temperature: 0.6 } });
  });


  it("allows multiple agent roles to share one provider", () => {
    const config = createDefaultConfig();
    config.providers = { gemini: { id: "gemini", protocol: "openai-chat", endpoint: "https://gemini.example/v1", apiKey: "key", models: ["gemini-pro"], defaultModel: "gemini-pro" } };
    config.agentRoles = {
      "ui-designer": { id: "ui-designer", providerId: "gemini", model: "gemini-pro", systemPrompt: "Design UI" },
      "ui-reviewer": { id: "ui-reviewer", providerId: "gemini", model: "gemini-pro", systemPrompt: "Review UI" },
    };
    expect(config.agentRoles["ui-designer"]?.providerId).toBe(config.agentRoles["ui-reviewer"]?.providerId);
  });

  it("resolves per-model context, output, and temperature with fallbacks", () => {
    const config = createDefaultConfig();
    const provider = { id: "p", protocol: "openai-chat" as const, endpoint: "https://p.test/v1", apiKey: "key", models: ["large", "small"], defaultModel: "small", temperature: 0.6, modelSettings: { small: { contextWindowTokens: 8192, maxOutputTokens: 512, temperature: 0.1 } } };
    config.providers = { p: provider };
    config.mainProviderId = "p";
    expect(resolveModelSettings(config, provider, "small")).toEqual({ contextWindowTokens: 8192, maxOutputTokens: 512, temperature: 0.1 });
    expect(resolveModelSettings(config, provider, "large")).toEqual({ contextWindowTokens: config.contextWindowTokens, maxOutputTokens: undefined, temperature: 0.6 });
    expect(resolveMainModel(config)).toMatchObject({ model: "small", settings: { contextWindowTokens: 8192 } });
  });

  it("sends selected model temperature and output limit", async () => {
    const config = createDefaultConfig();
    config.providers = { p: { id: "p", protocol: "openai-chat", endpoint: "https://p.test/v1", apiKey: "key", models: ["small"], defaultModel: "small", modelSettings: { small: { contextWindowTokens: 8192, maxOutputTokens: 333, temperature: 0.15 } } } };
    config.mainProviderId = "p";
    let body: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }); };
    await createConfigBackedChatModel(config, fetchImpl).createChatCompletion({ messages: [] });
    expect(body).toMatchObject({ model: "small", temperature: 0.15, max_tokens: 333 });
  });

  it("compacts with the previous model before switching to a smaller context", async () => {
    const config = createDefaultConfig();
    config.contextOverflowMode = "compact-with-previous-model";
    config.providers = {
      old: { id: "old", protocol: "openai-chat", endpoint: "https://old.test/v1", apiKey: "old-key", models: ["old-model"], defaultModel: "old-model", modelSettings: { "old-model": { contextWindowTokens: 100000 } } },
      next: { id: "next", protocol: "openai-chat", endpoint: "https://next.test/v1", apiKey: "next-key", models: ["next-model"], defaultModel: "next-model", modelSettings: { "next-model": { contextWindowTokens: 1200, maxOutputTokens: 100 } } },
    };
    config.mainProviderId = "old";
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl: typeof fetch = async (url, init) => { const body = JSON.parse(String(init?.body)); calls.push({ url: String(url), body }); const content = body.model === "old-model" && calls.length > 1 ? "old history summary" : "ok"; return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), { status: 200 }); };
    const model = createConfigBackedChatModel(config, fetchImpl);
    await model.createChatCompletion({ messages: [{ role: "user", content: "first" }] });
    config.mainProviderId = "next";
    const messages = Array.from({ length: 12 }, (_, index) => ({ role: "user" as const, content: String(index) + " ".repeat(500) }));
    await model.createChatCompletion({ messages });
    expect(calls.map((call) => call.body.model)).toEqual(["old-model", "old-model", "next-model"]);
    expect(JSON.stringify(calls[2]?.body.messages)).toContain("old history summary");
  });

  it("falls back to a sliding window when the previous model cannot compact", async () => {
    const config = createDefaultConfig();
    config.contextOverflowMode = "compact-with-previous-model";
    config.providers = {
      old: { id: "old", protocol: "openai-chat", endpoint: "https://old.test/v1", apiKey: "key", models: ["old"], defaultModel: "old" },
      next: { id: "next", protocol: "openai-chat", endpoint: "https://next.test/v1", apiKey: "key", models: ["next"], defaultModel: "next", modelSettings: { next: { contextWindowTokens: 1200, maxOutputTokens: 100 } } },
    };
    config.mainProviderId = "old";
    const calls: any[] = [];
    const fetchImpl: typeof fetch = async (url, init) => { const body = JSON.parse(String(init?.body)); calls.push({ url: String(url), body }); if (body.model === "old" && calls.length > 1) return new Response("offline", { status: 503 }); return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }); };
    const model = createConfigBackedChatModel(config, fetchImpl);
    await model.createChatCompletion({ messages: [{ role: "user", content: "first" }] });
    config.mainProviderId = "next";
    await model.createChatCompletion({ messages: Array.from({ length: 12 }, (_, index) => ({ role: "user" as const, content: String(index) + " ".repeat(500) })) });
    expect(calls.at(-1).body.model).toBe("next");
    expect(calls.at(-1).body.messages.length).toBeLessThan(12);
  });

  it("uses a sliding window on switch when configured", async () => {
    const config = createDefaultConfig();
    config.contextOverflowMode = "sliding-window";
    config.providers = {
      old: { id: "old", protocol: "openai-chat", endpoint: "https://old.test/v1", apiKey: "key", models: ["old"], defaultModel: "old" },
      next: { id: "next", protocol: "openai-chat", endpoint: "https://next.test/v1", apiKey: "key", models: ["next"], defaultModel: "next", modelSettings: { next: { contextWindowTokens: 1200, maxOutputTokens: 100 } } },
    };
    config.mainProviderId = "old";
    const calls: any[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => { calls.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }); };
    const model = createConfigBackedChatModel(config, fetchImpl);
    await model.createChatCompletion({ messages: [{ role: "user", content: "first" }] });
    config.mainProviderId = "next";
    await model.createChatCompletion({ messages: Array.from({ length: 12 }, (_, index) => ({ role: "user" as const, content: String(index) + " ".repeat(500) })) });
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.length).toBeLessThan(12);
  });

});
