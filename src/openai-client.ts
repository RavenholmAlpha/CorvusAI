import type { ChatCompletionResponse, ChatMessage, OpenAIToolSchema } from "./types.js";

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  tools?: OpenAIToolSchema[];
  tool_choice?: "auto" | "none";
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
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Chat completion failed (${response.status}): ${text}`);
    }

    return (await response.json()) as ChatCompletionResponse;
  }

  private chatCompletionsUrl(): string {
    const trimmed = this.endpoint.replace(/\/+$/, "");
    if (trimmed.endsWith("/chat/completions")) {
      return trimmed;
    }
    return `${trimmed}/chat/completions`;
  }
}

