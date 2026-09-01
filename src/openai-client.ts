import type { ChatCompletionResponse, ChatMessage, OpenAIToolSchema } from "./types.js";

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  tools?: OpenAIToolSchema[];
  tool_choice?: "auto" | "none";
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

export interface OpenAIChatClientOptions {
  endpoint: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  fetch?: typeof fetch;
  maxRetries?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("fetch failed") || msg.includes("econnreset") || msg.includes("timeout") || msg.includes("network") || msg.includes("socket hang up");
  }
  return false;
}

export function sanitizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const intermediate: ChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "system" || msg.role === "user") {
      intermediate.push({ role: msg.role, content: msg.content ?? "" });
      continue;
    }

    if (msg.role === "assistant") {
      const toolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0 ? msg.tool_calls : undefined;
      const content = msg.content ?? (toolCalls ? null : "");
      intermediate.push({
        role: "assistant",
        content,
        tool_calls: toolCalls,
      });

      if (toolCalls && toolCalls.length > 0) {
        // Collect all subsequent tool messages answering this assistant message
        const answeredIds = new Set<string>();
        let j = i + 1;
        while (j < messages.length && messages[j].role === "tool") {
          const toolMsg = messages[j];
          const toolCallId = toolMsg.tool_call_id;
          if (toolCallId) {
            answeredIds.add(toolCallId);
            intermediate.push({
              role: "tool",
              content: toolMsg.content ?? "",
              tool_call_id: toolCallId,
              name: toolMsg.name,
            });
          }
          j++;
        }
        // Advance i to skip already-consumed tool messages
        i = j - 1;

        // Synthesize placeholder tool responses for any missing tool_call_id to satisfy OpenAI API invariants
        for (const call of toolCalls) {
          if (call.id && !answeredIds.has(call.id)) {
            intermediate.push({
              role: "tool",
              content: "[Tool execution was interrupted or incomplete in previous turn]",
              tool_call_id: call.id,
              name: call.function?.name,
            });
          }
        }
      }
      continue;
    }

    if (msg.role === "tool") {
      // Orphaned tool message that was not preceded by an assistant tool_calls block
      intermediate.push({
        role: "tool",
        content: msg.content ?? "",
        tool_call_id: msg.tool_call_id || `call_${i}`,
        name: msg.name,
      });
      continue;
    }
  }

  // Final invariant validation pass: Ensure every role="tool" message strictly follows an assistant with matching tool_call_id
  const finalResult: ChatMessage[] = [];
  const activeToolCallIds = new Set<string>();

  for (const msg of intermediate) {
    if (msg.role === "assistant") {
      activeToolCallIds.clear();
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.id) activeToolCallIds.add(tc.id);
        }
      }
      finalResult.push(msg);
    } else if (msg.role === "tool") {
      if (msg.tool_call_id && activeToolCallIds.has(msg.tool_call_id)) {
        finalResult.push(msg);
      } else {
        // Orphaned tool response without matching active tool_call_id: wrap into a user context note
        finalResult.push({
          role: "user",
          content: `[Previous Tool Result: ${msg.content ?? ""}]`,
        });
      }
    } else {
      activeToolCallIds.clear();
      finalResult.push(msg);
    }
  }

  return finalResult;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });
}

export class OpenAIChatClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly temperature?: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(options: OpenAIChatClientOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.temperature = options.temperature;
    this.fetchImpl = options.fetch ?? fetch;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.apiKey) {
      throw new Error("Missing API key. Use /setting wizard, /setting api-key <key>, or configure api-key-env.");
    }

    const isStreaming = !!request.onChunk;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.doRequest(request, isStreaming);
      } catch (error) {
        // Never retry if the caller aborted, or if streaming already began
        // (partial output cannot be safely resumed).
        const aborted = request.signal?.aborted || (error as Error).name === "AbortError";
        if (aborted || attempt >= this.maxRetries) {
          throw error;
        }
        if (!this.shouldRetry(error)) {
          throw error;
        }
        // Exponential backoff: 1s, 2s, 4s...
        const delayMs = Math.min(1000 * 2 ** attempt, 16000);
        await sleep(delayMs, request.signal);
      }
    }
    throw new Error("Chat completion exhausted retries");
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof Error) {
      const match = error.message.match(/Chat completion failed \((\d+)\)/);
      if (match) {
        const status = Number(match[1]);
        return RETRYABLE_STATUS.has(status);
      }
      return isRetryableError(error);
    }
    return false;
  }

  private async doRequest(
    request: ChatCompletionRequest,
    isStreaming: boolean,
  ): Promise<ChatCompletionResponse> {
    const messages = sanitizeChatMessages(request.messages);
    const response = await this.fetchImpl(this.chatCompletionsUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      signal: request.signal,
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: request.tools,
        tool_choice: request.tool_choice,
        temperature: this.temperature,
        stream: isStreaming,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Chat completion failed (${response.status}): ${text}`);
    }

    if (isStreaming && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullContent = "";
      let toolCalls: any[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices[0]?.delta;
              if (delta) {
                if (delta.content) {
                  fullContent += delta.content;
                  request.onChunk?.(delta.content);
                }
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (tc.id) {
                      toolCalls[tc.index] = { id: tc.id, type: tc.type, function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" } };
                    } else if (tc.function?.arguments) {
                      toolCalls[tc.index].function.arguments += tc.function.arguments;
                    }
                  }
                }
              }
            } catch (e) {
              // Ignore invalid JSON chunks
            }
          }
        }
      }

      return {
        id: "stream-res",
        choices: [{
          message: {
            role: "assistant",
            content: fullContent,
            tool_calls: toolCalls.length > 0 ? toolCalls.filter(Boolean) : undefined,
          },
        }],
      } as ChatCompletionResponse;
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as ChatCompletionResponse;
    } catch (e) {
      const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
      throw new Error(`Invalid JSON response from endpoint (${this.endpoint}): ${preview}`);
    }
  }

  private chatCompletionsUrl(): string {
    const trimmed = this.endpoint.replace(/\/+$/, "");
    if (trimmed.endsWith("/chat/completions")) {
      return trimmed;
    }
    return `${trimmed}/chat/completions`;
  }
}