import type { ChatModel } from "./agent.js";

export function withModelBudget(model: ChatModel, budget: { maxRequests?: number; maxPromptTokens?: number; maxCompletionTokens?: number }): ChatModel {
  let requests = 0; let promptTokens = 0; let completionTokens = 0;
  return {
    createChatCompletion: async (request) => {
      if (budget.maxRequests !== undefined && requests >= budget.maxRequests) throw new Error("ROLE_BUDGET_EXCEEDED: maxRequests=" + budget.maxRequests);
      if (budget.maxPromptTokens !== undefined && promptTokens >= budget.maxPromptTokens) throw new Error("ROLE_BUDGET_EXCEEDED: prompt tokens");
      if (budget.maxCompletionTokens !== undefined && completionTokens >= budget.maxCompletionTokens) throw new Error("ROLE_BUDGET_EXCEEDED: completion tokens");
      requests += 1;
      const response = await model.createChatCompletion(request);
      promptTokens += response.usage?.promptTokens ?? 0;
      completionTokens += response.usage?.completionTokens ?? 0;
      return response;
    },
  };
}