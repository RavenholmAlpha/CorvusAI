import type { ChatCompletionResponse, ChatMessage, OpenAIToolSchema } from "./types.js";

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  tools?: OpenAIToolSchema[];
  tool_choice?: "auto" | "none";
  onChunk?: (text: string) => void;
}

export interface OpenAIChatClientOptions {
  endpoint: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  fetch?: typeof fetch;
}

export class OpenAIChatClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly temperature?: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIChatClientOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.temperature = options.temperature;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.apiKey) {
      throw new Error("Missing API key. Use /setting wizard, /setting api-key <key>, or configure api-key-env.");
    }

    const isStreaming = !!request.onChunk;

    const response = await this.fetchImpl(this.chatCompletionsUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: request.messages,
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
          }
        }]
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

