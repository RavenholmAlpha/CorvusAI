import { describe, expect, it } from "vitest";
import { ProtocolChatClient } from "../src/provider-client.js";

describe("provider protocol adapters", () => {
  it("normalizes OpenAI Responses output and function calls", async () => {
    const calls: Array<{ url: string; headers: HeadersInit | undefined; body: any }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "resp_1", model: "gpt-5", output_text: "planned", output: [{ type: "function_call", id: "fc_1", call_id: "call_1", name: "read_file", arguments: "{\"path\":\"x\"}" }], usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 } }), { status: 200 });
    };
    const result = await new ProtocolChatClient({ protocol: "openai-responses", endpoint: "https://api.openai.com/v1", apiKey: "key", model: "gpt-5" }, fetchImpl).createChatCompletion({ messages: [{ role: "user", content: "plan" }], tools: [] });
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.body).toMatchObject({ model: "gpt-5", input: [{ role: "user", content: "plan" }] });
    expect(result.choices[0]?.message).toMatchObject({ content: "planned", tool_calls: [{ id: "call_1", function: { name: "read_file" } }] });
    expect(result.usage).toMatchObject({ promptTokens: 12, completionTokens: 4, totalTokens: 16 });
  });

  it("normalizes Anthropic Messages output and tool use", async () => {
    const calls: Array<{ url: string; headers: any; body: any }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "msg_1", model: "claude-test", content: [{ type: "text", text: "reviewed" }, { type: "tool_use", id: "tool_1", name: "grep_search", input: { query: "TODO" } }], usage: { input_tokens: 9, output_tokens: 3 } }), { status: 200 });
    };
    const result = await new ProtocolChatClient({ protocol: "anthropic-messages", endpoint: "https://api.anthropic.com/v1", apiKey: "anthropic-key", model: "claude-test" }, fetchImpl).createChatCompletion({ messages: [{ role: "system", content: "rules" }, { role: "user", content: "review" }], tools: [] });
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]?.headers).toMatchObject({ "x-api-key": "anthropic-key", "anthropic-version": "2023-06-01" });
    expect(calls[0]?.body).toMatchObject({ model: "claude-test", system: "rules", messages: [{ role: "user", content: "review" }] });
    expect(result.choices[0]?.message).toMatchObject({ content: "reviewed", tool_calls: [{ id: "tool_1", function: { name: "grep_search", arguments: "{\"query\":\"TODO\"}" } }] });
    expect(result.usage).toMatchObject({ promptTokens: 9, completionTokens: 3 });
  });

  it("discovers models from OpenAI-compatible endpoint", async () => {
    const fetchImpl: typeof fetch = async (url) => {
      expect(String(url)).toBe("https://api.deepseek.com/v1/models");
      return new Response(
        JSON.stringify({
          data: [
            { id: "deepseek-chat" },
            { id: "deepseek-reasoner" },
          ],
        }),
        { status: 200 },
      );
    };

    const { discoverProviderModels } = await import("../src/provider-client.js");
    const models = await discoverProviderModels({
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "test-key",
      fetchImpl,
    });

    expect(models).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("discovers models from Anthropic /v1/models endpoint", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toBe("https://api.anthropic.com/v1/models");
      expect(init?.headers).toMatchObject({ "x-api-key": "anthropic-key" });
      return new Response(
        JSON.stringify({
          data: [
            { id: "claude-3-7-sonnet-20250219" },
            { id: "claude-3-5-haiku-20241022" },
          ],
        }),
        { status: 200 },
      );
    };

    const { discoverProviderModels } = await import("../src/provider-client.js");
    const models = await discoverProviderModels({
      endpoint: "https://api.anthropic.com/v1",
      apiKey: "anthropic-key",
      protocol: "anthropic-messages",
      fetchImpl,
    });

    expect(models).toEqual(["claude-3-5-haiku-20241022", "claude-3-7-sonnet-20250219"]);
  });
});
