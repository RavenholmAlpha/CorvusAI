import { describe, expect, it } from "vitest";
import { withModelBudget } from "../src/budgets.js";

describe("role model budgets", () => {
  it("enforces request limits", async () => {
    const model = withModelBudget({ createChatCompletion: async () => ({ choices: [{ message: { role: "assistant", content: "ok" } }], usage: { promptTokens: 3, completionTokens: 1 } }) }, { maxRequests: 1 });
    await model.createChatCompletion({ messages: [] });
    await expect(model.createChatCompletion({ messages: [] })).rejects.toThrow("ROLE_BUDGET_EXCEEDED");
  });
});
