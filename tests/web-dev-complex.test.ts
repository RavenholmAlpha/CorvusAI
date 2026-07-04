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

describe("Complex Web Dev Test", () => {
  it("builds a complex multi-file dashboard in D:/cotest", async () => {
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
    
    config.maxToolRounds = 30; // High limit for complex tasks
    config.compactionThreshold = 3000; // Artificially low to force compaction to trigger during the test!
    config.goal = "You are an expert Frontend Developer building premium complex applications.";
    
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
        if (rounds > 30) break;
      }
      return response;
    }

    const prompt = `
Please build a complex Premium Web Dashboard in D:\\cotest.
Requirements:
1. Use 'shell' to ensure the directory D:\\cotest exists and is empty.
2. Create 'index.html' which includes a sidebar, a top navigation bar, and a main content area with 3 widget cards. It must import 'styles.css' and 'app.js'. Use Chart.js from CDN for a chart widget.
3. Create 'styles.css'. Implement a premium dark mode UI (vibrant colors, glassmorphism, smooth gradients, modern typography).
4. Create 'app.js' to initialize the Chart.js chart with some mock data, and add a toggle button logic to switch a sidebar state.
5. Create a subdirectory D:\\cotest\\components and write a 'Sidebar.js' file exporting a mock function just to test your multi-directory capabilities.
6. After writing all files, use 'replace_file_content' to update a specific color or text in 'styles.css' to prove you can surgically edit your complex files.
7. Report back with a markdown summary of all files created and actions taken.
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
  }, 180000); // 3 minutes timeout for complex generation
});
