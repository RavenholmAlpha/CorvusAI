import { describe, expect, it } from "vitest";
import { CorvusAgent } from "../src/agent.js";
import { createDefaultConfig } from "../src/config.js";
import { createDefaultPolicy } from "../src/permissions.js";
import { ToolRegistry } from "../src/tools/index.js";

describe("CorvusAgent", () => {
  it("restores a persisted compaction checkpoint into session context", () => {
    const agent=new CorvusAgent({config:createDefaultConfig(),tools:new ToolRegistry(createDefaultPolicy()),model:{createChatCompletion:async()=>({choices:[{message:{role:"assistant" as const,content:"ok"}}]})},loadCheckpoint:()=>({summary:"Persisted decisions and actions",sourceMessageCount:12})});
    agent.loadSessionHistory([{role:"user",content:"recent"}],"session-1");expect(agent.history()[1].content).toContain("Persisted decisions and actions");expect(agent.history()[2].content).toBe("recent");
  });
  it("runs OpenAI tool calls and sends tool results back to the model", async () => {
    const tools = new ToolRegistry(createDefaultPolicy());
    tools.register({
      name: "echo",
      description: "Echo input",
      capability: "local",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      execute: async ({ text }) => ({ text }),
    });

    const requests: Array<{ messages: unknown[] }> = [];
    const model = {
      createChatCompletion: async (request: { messages: unknown[] }) => {
        requests.push(request);
        if (requests.length === 1) {
          return {
            choices: [
              {
                message: {
                  role: "assistant" as const,
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function" as const,
                      function: { name: "echo", arguments: JSON.stringify({ text: "hi" }) },
                    },
                  ],
                },
              },
            ],
          };
        }

        return {
          choices: [{ message: { role: "assistant" as const, content: "tool said hi" } }],
        };
      },
    };

    const agent = new CorvusAgent({
      config: createDefaultConfig(),
      tools,
      model,
    });

    const reply = await agent.send("say hi");

    expect(reply.message.content).toBe("tool said hi");
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", tool_call_id: "call_1", name: "echo" }),
      ]),
    );
  });

  it("reports context usage statistics", async () => {
    const config = createDefaultConfig();
    const model = {
      createChatCompletion: async () => ({
        choices: [{ message: { role: "assistant" as const, content: "ok" } }],
      }),
    };
    const agent = new CorvusAgent({
      config,
      tools: new ToolRegistry(createDefaultPolicy()),
      model,
    });

    const usage = agent.contextUsage();
    expect(usage.messageCount).toBe(1);
    expect(usage.estimatedTokens).toBeGreaterThan(0);
    expect(usage.threshold).toBe(config.compactionThreshold);
    expect(usage.hasSummary).toBe(false);
    expect(usage.isCompacting).toBe(false);
    expect(usage.state).toBe("global");
    expect(usage.compactionHistory).toEqual([]);
    expect(usage.lastRequestTokens).toBe(0);

    await agent.send("hello");
    const after = agent.contextUsage();
    expect(after.lastRequestTokens).toBeGreaterThan(0);
  });

  it("refreshes the system prompt from current config before each model call", async () => {
    const config = createDefaultConfig();
    const requests: Array<{ messages: Array<{ role: string; content?: string | null }> }> = [];
    const model = {
      createChatCompletion: async (request: { messages: Array<{ role: string; content?: string | null }> }) => {
        requests.push(request);
        return {
          choices: [{ message: { role: "assistant" as const, content: "ok" } }],
        };
      },
    };
    const agent = new CorvusAgent({
      config,
      tools: new ToolRegistry(createDefaultPolicy()),
      model,
    });

    config.goal = "Ship dynamic goals";
    config.review.enabled = true;

    await agent.send("hello");

    expect(requests[0]?.messages[0]?.content).toContain("Ship dynamic goals");
    expect(requests[0]?.messages[0]?.content).toContain("Review mode instruction");
  });
});
