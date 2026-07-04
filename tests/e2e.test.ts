import { describe, it, expect, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { CorvusAgent } from "../src/agent.js";
import { openCorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { HarnessRunner } from "../src/harness/runner.js";
import { RunStore } from "../src/harness/run-store.js";
import { ToolQueue } from "../src/harness/tool-queue.js";
import { createConfigBackedChatModel } from "../src/runtime.js";
import { createBuiltInTools, ToolRegistry } from "../src/tools/index.js";

describe("E2E Corvus Agent Tests", () => {
  it("runs the test scenarios", async () => {
    const config = await loadConfig();
    const db = openCorvusDatabase(":memory:"); // use in-memory db
    ensureDatabase(db);

    const tools = new ToolRegistry(config.permissions);
    tools.registerMany(createBuiltInTools());
    tools.setPermissionRequester(async () => "allow"); // auto allow

    const events = new EventLog(db);
    const runs = new RunStore(db, events);
    const evidence = new EvidenceStore(db, events);
    const approvals = new ApprovalService(db, events, config.permissions, evidence);
    const queue = new ToolQueue(db, events, evidence, approvals);

    const client = createConfigBackedChatModel(config);
    const runner = new HarnessRunner({ config, model: client, tools, runs, queue, evidence, events });
    const harness = {
      listRuns: () => runs.listRuns(),
      getRun: (id: string) => runs.getRun(id),
      listMessages: (runId: string) => runs.listMessages(runId),
      latestSnapshot: (runId: string) => runs.latestSnapshot(runId),
      cancelRun: (id: string) => runs.updateRunStatus(id, "canceled"),
      listPendingApprovals: (runId: string) => approvals.listPending(runId),
      resolveApproval: (id: string, status: any, scope: any) => approvals.resolveApproval(id, status, scope),
      runApproved: (toolCallId: string, tool: any) => queue.runApproved(toolCallId, tool),
      getEvidence: (id: string) => evidence.getEvidence(id),
      listEvidence: (runId: string) => evidence.listEvidence(runId),
    };
    
    // Set mock goal
    config.goal = "You are a helpful assistant.";
    
    const agent = new CorvusAgent({ config, tools, model: client, runner, harness });
    
    async function sendAndResolve(prompt: string) {
      let response = await agent.send(prompt);
      while (response.pendingApprovals && response.pendingApprovals.length > 0) {
        for (const app of response.pendingApprovals) {
          await harness.resolveApproval(app.approvalId, "approved", "once");
          const toolCall = queue.getToolCall(app.toolCallId);
          if (toolCall) {
            await harness.runApproved(app.toolCallId, tools.list().find(t => t.name === toolCall.toolName)!);
          }
        }
        const resumeResult = await agent.resume(response.runId!);
        response = {
          message: resumeResult.message,
          runId: resumeResult.runId,
          pendingApprovals: harness.listPendingApprovals(resumeResult.runId!).map(a => ({
            approvalId: a.id,
            toolCallId: a.toolCallId,
            toolName: a.toolName,
          }))
        };
      }
      return response;
    }
    
    console.log(">> Test 1: Generate a file");
    let response = await sendAndResolve("Write a file named 'hello.txt' with the word 'Test'");
    console.log("Agent response:", response.message.content);
    expect(response.message.content).toBeDefined();

    console.log(">> Test 2: Replace file content");
    response = await sendAndResolve("Use replace_file_content to replace 'Test' with 'Success' in 'hello.txt'");
    console.log("Agent response:", response.message.content);
    expect(response.message.content).toBeDefined();

    console.log(">> Test 3: Self-correction on bad tool");
    response = await sendAndResolve("Call a tool named 'missing_tool' explicitly to demonstrate you can handle the error.");
    console.log("Agent response:", response.message.content);
    expect(response.message.content).toBeDefined();
    
    db.close();
  }, 60000); // 60s timeout
});
