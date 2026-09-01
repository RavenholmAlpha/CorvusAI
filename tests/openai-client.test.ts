import { describe, expect, it } from "vitest";
import { OpenAIChatClient, sanitizeChatMessages } from "../src/openai-client.js";

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

  it("synthesizes missing tool responses when an assistant tool call was interrupted", () => {
    const sanitized = sanitizeChatMessages([
      { role: "user", content: "Run terminal command" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "terminal_read", arguments: "{}" } },
          { id: "call_2", type: "function", function: { name: "terminal_read", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "output 1" },
      // Note: call_2 tool message was missing due to error
      { role: "user", content: "What is the time now?" },
    ]);

    expect(sanitized).toHaveLength(5);
    expect(sanitized[0].role).toBe("user");
    expect(sanitized[1].role).toBe("assistant");
    expect(sanitized[2]).toMatchObject({ role: "tool", tool_call_id: "call_1", content: "output 1" });
    expect(sanitized[3]).toMatchObject({ role: "tool", tool_call_id: "call_2" });
    expect(sanitized[3].content).toContain("interrupted");
    expect(sanitized[4]).toMatchObject({ role: "user", content: "What is the time now?" });
  });
});
