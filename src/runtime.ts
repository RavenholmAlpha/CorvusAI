import type { CorvusConfig } from "./config.js";
import type { ChatModel } from "./agent.js";
import { OpenAIChatClient } from "./openai-client.js";

export function createConfigBackedChatModel(config: CorvusConfig, fetchImpl?: typeof fetch): ChatModel {
  return {
    createChatCompletion: (request) => {
      const client = new OpenAIChatClient({
        endpoint: config.endpoint,
        apiKey: config.apiKey || process.env[config.apiKeyEnv],
        model: config.model,
        temperature: config.temperature,
        fetch: fetchImpl,
      });
      return client.createChatCompletion(request);
    },
  };
}

