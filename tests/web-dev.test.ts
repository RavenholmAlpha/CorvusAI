import { describe, it, expect } from "vitest";
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

describe("Web Dev Test", () => {
  it("builds a simple webpage in D:/cotest", async () => {
    const config = await loadConfig();
    const db = openCorvusDatabase(":memory:");
    ensureDatabase(db);

    const tools = new ToolRegistry(config.permissions);
    tools.registerMany(createBuiltInTools());
    tools.setPermissionRequester(async () => "allow");

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
    
    config.maxToolRounds = 15;
    config.goal = "You are a helpful assistant.";
    
    const agent = new CorvusAgent({ config, tools, model: client, runner, harness });
    
    async function sendAndResolve(prompt: string) {
      let response = await agent.send(prompt);
      let rounds = 0;
      while (response.pendingApprovals && response.pendingApprovals.length > 0) {
        for (const app of response.pendingApprovals) {
          console.log(`[Auto-Approving Tool]: ${app.toolName}`);
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
        rounds++;
        if (rounds > 15) break;
      }
      return response;
    }

    const prompt = `
Please perform a web development test to verify your tools:
1. Use 'shell' to create a directory D:\\cotest (if it doesn't exist).
2. Inside D:\\cotest, use 'write_file' to create a modern index.html with some basic styling and a button.
3. Use 'shell' to list the contents of D:\\cotest to verify the file was created.
4. Use 'replace_file_content' on index.html to change the button text to "Corvus AI Activated!".
5. Use 'grep_search' to search for "Corvus" inside D:\\cotest to verify the replace worked.
Report back your final status once all these steps are complete.
`;
    
    console.log(`\n\nPrompt: ${prompt}\n\n`);
    const response = await sendAndResolve(prompt);
    console.log(`\n== Final Agent Reply ==\n${response.message.content}`);
    
    const runId = response.runId;
    if (runId) {
       console.log(`\n== Tool Execution Trace ==`);
       const allMsgs = runs.listMessages(runId);
       for (const m of allMsgs) {
         if (m.role === "tool") {
           console.log(`- Executed tool: ${m.toolName}`);
         }
       }
    }
    
    db.close();
  }, 120000); // 120s timeout
});
