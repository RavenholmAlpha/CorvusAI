import { describe, expect, it } from "vitest";
import { createBuiltInToolManifests } from "../src/tools/builtin.js";
import { McpClient } from "../src/mcp/client.js";

describe("built-in tools", () => {
  it("includes the task (sub-agent delegation) tool", () => {
    const tools = createBuiltInToolManifests();
    const task = tools.find((t) => t.name === "task");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("local");
    const batch = tools.find((t) => t.name === "parallel_tasks");
    expect(batch).toBeDefined();
    expect(batch?.capability).toBe("local");
    for (const name of ["manage_mcp", "manage_skill", "record_project_memory", "unregister_workspace", "get_workspace_summary", "check_subagent_task"]) {
      expect(tools.find((tool) => tool.name === name), name).toBeDefined();
    }
  });
});

describe("McpClient", () => {
  it("constructs with a server config", () => {
    const client = new McpClient({ command: "echo", args: [] });
    expect(client).toBeDefined();
  });
});
