import { afterEach, describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config.js";
import { createConfigBackedChatModel } from "../src/runtime.js";

describe("config backed chat model", () => {
  afterEach(() => {
    delete process.env.CORVUS_TEST_API_KEY;
  });

  it("uses the latest model and endpoint from config for each request", async () => {
    process.env.CORVUS_TEST_API_KEY = "test-key";
    const config = createDefaultConfig();
    config.apiKeyEnv = "CORVUS_TEST_API_KEY";
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
});
