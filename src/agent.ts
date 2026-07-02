import type { CorvusConfig } from "./config.js";
import type { ChatCompletionRequest } from "./openai-client.js";
import type { ToolRegistry } from "./tools/index.js";
import type { ChatCompletionResponse, ChatMessage, ToolCall } from "./types.js";

export interface ChatModel {
  createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

export interface CorvusAgentOptions {
  config: CorvusConfig;
  tools: ToolRegistry;
  model: ChatModel;
}

export class CorvusAgent {
  private readonly messages: ChatMessage[];

  constructor(private readonly options: CorvusAgentOptions) {
    this.messages = [{ role: "system", content: this.buildSystemPrompt() }];
  }

  history(): ChatMessage[] {
    return [...this.messages];
  }

  async send(content: string): Promise<ChatMessage> {
    this.messages.push({ role: "user", content });

    for (let round = 0; round <= this.options.config.maxToolRounds; round += 1) {
      this.refreshSystemPrompt();
      const response = await this.options.model.createChatCompletion({
        messages: this.messages,
        tools: this.options.tools.toOpenAITools(),
        tool_choice: "auto",
      });
      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error("Model returned no choices");
      }

      this.messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message;
      }

      for (const call of message.tool_calls) {
        this.messages.push(await this.runToolCall(call));
      }
    }

    throw new Error(`Tool loop exceeded maxToolRounds=${this.options.config.maxToolRounds}`);
  }

  private buildSystemPrompt(): string {
    const lines = [this.options.config.systemPrompt];
    if (this.options.config.goal) {
      lines.push(`Active goal: ${this.options.config.goal}`);
    }
    if (this.options.config.review.enabled) {
      lines.push(`Review mode instruction: ${this.options.config.review.instruction}`);
    }
    return lines.join("\n\n");
  }

  private refreshSystemPrompt(): void {
    this.messages[0] = { role: "system", content: this.buildSystemPrompt() };
  }

  private async runToolCall(call: ToolCall): Promise<ChatMessage> {
    try {
      const args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
      const result = await this.options.tools.execute(call.function.name, args);
      return {
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      };
    } catch (error) {
      return {
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify({ error: (error as Error).message }),
      };
    }
  }
}
