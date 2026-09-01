import { describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config.js";
import { createConfigBackedChatModel } from "../src/runtime.js";

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

});
