import type { ChatCompletionRequest } from "./openai-client.js";
import type { ChatCompletionResponse, ChatMessage, OpenAIToolSchema, ToolCall } from "./types.js";

export type ProviderProtocol = "openai-chat" | "openai-responses" | "anthropic-messages";
export interface ProviderConnection { endpoint: string; apiKey: string; model: string; temperature?: number; protocol?: ProviderProtocol; timeoutMs?: number; maxRetries?: number; }

function url(endpoint: string, suffix: string): string { const base = endpoint.replace(/\/+$/, ""); return base.endsWith(suffix) ? base : base + suffix; }
function responseTools(tools: OpenAIToolSchema[] = []): any[] { return tools.map((tool) => ({ type: "function", name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters })); }
function anthropicTools(tools: OpenAIToolSchema[] = []): any[] { return tools.map((tool) => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters })); }
function normalizeResponses(data: any): ChatCompletionResponse {
  const calls: ToolCall[] = (data.output ?? []).filter((item: any) => item.type === "function_call").map((item: any) => ({ id: item.call_id ?? item.id, type: "function", function: { name: item.name, arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}) } }));
  const content = data.output_text ?? (data.output ?? []).filter((item: any) => item.type === "message").flatMap((item: any) => item.content ?? []).map((part: any) => part.text ?? "").join("");
  return { id: data.id, model: data.model, choices: [{ message: { role: "assistant", content, tool_calls: calls.length ? calls : undefined } }], usage: data.usage ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens, totalTokens: data.usage.total_tokens } : undefined };
}
function normalizeAnthropic(data: any): ChatCompletionResponse {
  const calls: ToolCall[] = (data.content ?? []).filter((part: any) => part.type === "tool_use").map((part: any) => ({ id: part.id, type: "function", function: { name: part.name, arguments: JSON.stringify(part.input ?? {}) } }));
  const content = (data.content ?? []).filter((part: any) => part.type === "text").map((part: any) => part.text ?? "").join("");
  return { id: data.id, model: data.model, choices: [{ message: { role: "assistant", content, tool_calls: calls.length ? calls : undefined } }], usage: data.usage ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens } : undefined };
}
function anthropicMessages(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: unknown }> {
  const output: Array<{ role: "user" | "assistant"; content: unknown }> = [];
  for (const message of messages.filter((item) => item.role !== "system")) {
    if (message.role === "assistant") {
      const content: any[] = [];
      if (message.content) content.push({ type: "text", text: message.content });
      for (const call of message.tool_calls ?? []) {
        let input: unknown = {}; try { input = JSON.parse(call.function.arguments); } catch { input = {}; }
        content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
      }
      output.push({ role: "assistant", content: content.length ? content : "" });
    } else if (message.role === "tool") {
      output.push({ role: "user", content: [{ type: "tool_result", tool_use_id: message.tool_call_id || "call_unknown", content: message.content ?? "" }] });
    } else {
      output.push({ role: "user", content: message.content ?? "" });
    }
  }
  return output;
}
export class ProtocolChatClient {
  constructor(private readonly connection: ProviderConnection, private readonly fetchImpl: typeof fetch = fetch) {}
  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const timeoutSignal = this.connection.timeoutMs ? AbortSignal.timeout(this.connection.timeoutMs) : undefined;
    const signal = request.signal && timeoutSignal ? AbortSignal.any([request.signal, timeoutSignal]) : request.signal ?? timeoutSignal;
    const effectiveRequest = { ...request, signal };
    const protocol = this.connection.protocol ?? "openai-chat";
    if (protocol === "openai-chat") { const { OpenAIChatClient } = await import("./openai-client.js"); return new OpenAIChatClient({ ...this.connection, fetch: this.fetchImpl }).createChatCompletion(effectiveRequest); }
    const isResponses = protocol === "openai-responses";
    const endpoint = isResponses ? url(this.connection.endpoint, "/responses") : url(this.connection.endpoint, "/messages");
    const system = effectiveRequest.messages.filter((m) => m.role === "system").map((m) => m.content ?? "").join("\n");
    const body = isResponses
      ? { model: this.connection.model, input: effectiveRequest.messages.map((m) => ({ role: m.role, content: m.content ?? "" })), tools: responseTools(effectiveRequest.tools), temperature: this.connection.temperature }
      : { model: this.connection.model, system, messages: anthropicMessages(effectiveRequest.messages), tools: anthropicTools(effectiveRequest.tools), max_tokens: 4096, temperature: this.connection.temperature };
    const headers: Record<string,string> = { "content-type": "application/json" };
    if (isResponses) headers.authorization = "Bearer " + this.connection.apiKey; else { headers["x-api-key"] = this.connection.apiKey; headers["anthropic-version"] = "2023-06-01"; }
    const response = await this.fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal });
    const raw = await response.text(); if (!response.ok) throw new Error("Provider request failed (" + response.status + "): " + raw);
    const result = isResponses ? normalizeResponses(JSON.parse(raw)) : normalizeAnthropic(JSON.parse(raw));
    if (request.onChunk && result.choices[0]?.message.content) request.onChunk(result.choices[0].message.content ?? "");
    return result;
  }
}

export async function discoverProviderModels(options: {
  endpoint: string;
  apiKey: string;
  protocol?: ProviderProtocol;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const rawEndpoint = options.endpoint.trim().replace(/\/+$/, "");
  const protocol = options.protocol ?? "openai-chat";
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 15000);

  const cleanEndpoint = rawEndpoint
    .replace(/\/chat\/completions$/, "")
    .replace(/\/responses$/, "")
    .replace(/\/messages$/, "");

  const models: Set<string> = new Set();

  if (protocol === "anthropic-messages") {
    const targetUrl = cleanEndpoint.endsWith("/v1")
      ? `${cleanEndpoint}/models`
      : `${cleanEndpoint}/v1/models`;
    try {
      const response = await fetchImpl(targetUrl, {
        method: "GET",
        headers: {
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: timeoutSignal,
      });
      if (response.ok) {
        const data: any = await response.json();
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        for (const item of list) {
          const id = typeof item === "string" ? item : item?.id || item?.name;
          if (id) models.add(String(id));
        }
      }
    } catch {
      // Fallback
    }

    if (models.size === 0) {
      return [
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
      ];
    }
    return [...models].sort();
  }

  const candidateUrls: string[] = [];
  if (cleanEndpoint.endsWith("/v1") || cleanEndpoint.endsWith("/v4")) {
    candidateUrls.push(`${cleanEndpoint}/models`);
  } else {
    candidateUrls.push(`${cleanEndpoint}/v1/models`, `${cleanEndpoint}/models`, `${cleanEndpoint}/api/tags`);
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.apiKey) {
    headers.authorization = `Bearer ${options.apiKey}`;
  }

  let lastError: Error | null = null;
  for (const targetUrl of candidateUrls) {
    try {
      const response = await fetchImpl(targetUrl, {
        method: "GET",
        headers,
        signal: timeoutSignal,
      });
      if (response.ok) {
        const data: any = await response.json();
        const list = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.models)
          ? data.models
          : Array.isArray(data)
          ? data
          : [];
        for (const item of list) {
          const id = typeof item === "string" ? item : item?.id || item?.name;
          if (id && typeof id === "string") {
            models.add(id);
          }
        }
        if (models.size > 0) {
          break;
        }
      } else {
        const text = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 150)}`);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  if (models.size === 0 && lastError) {
    throw new Error(`Failed to discover models from ${cleanEndpoint}: ${lastError.message}`);
  }

  return [...models].sort((a, b) => a.localeCompare(b));
}