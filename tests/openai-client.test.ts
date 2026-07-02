import { describe, expect, it } from "vitest";
import { OpenAIChatClient } from "../src/openai-client.js";

describe("OpenAI chat completions client", () => {
  it("posts OpenAI-compatible chat completion payloads to a custom endpoint", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = new OpenAIChatClient({
      endpoint: "https://gateway.example/openai/v1",
      apiKey: "test-key",
      model: "corvus-test-model",
      fetch: fetchImpl,
    });

    const response = await client.createChatCompletion({
      messages: [{ role: "user", content: "ping" }],
      tools: [],
    });

    expect(response.choices[0]?.message.content).toBe("ok");
    expect(calls[0]?.url).toBe("https://gateway.example/openai/v1/chat/completions");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({ authorization: "Bearer test-key" });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      model: "corvus-test-model",
      messages: [{ role: "user", content: "ping" }],
      tools: [],
    });
  });
});
