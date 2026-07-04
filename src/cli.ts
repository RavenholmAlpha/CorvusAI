#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRegistry, createCoreCommands, type DurableHarnessAdapter } from "./commands.js";
import { loadConfig, saveConfig } from "./config.js";
import { CorvusAgent } from "./agent.js";
import { openCorvusDatabase } from "./db/connection.js";
import { ensureDatabase } from "./db/migrations.js";
import { ApprovalService } from "./harness/approval-service.js";
import { EventLog } from "./harness/event-log.js";
import { EvidenceStore } from "./harness/evidence-store.js";
import { HarnessRunner } from "./harness/runner.js";
import { RunStore } from "./harness/run-store.js";
import { ToolQueue } from "./harness/tool-queue.js";
import { loadPlugins } from "./plugins.js";
import { createConfigBackedChatModel } from "./runtime.js";
import { CorvusTui } from "./tui.js";
import { createBuiltInTools, ToolRegistry } from "./tools/index.js";

export async function main(): Promise<void> {
  const config = await loadConfig();
  const db = openCorvusDatabase();
  try {
    ensureDatabase(db);

    const tools = new ToolRegistry(config.permissions);
    tools.registerMany(createBuiltInTools());

    const commands = new CommandRegistry(createCoreCommands());
    const events = new EventLog(db);
    const runs = new RunStore(db, events);
    const evidence = new EvidenceStore(db, events);
    const approvals = new ApprovalService(db, events, config.permissions, evidence);
    const queue = new ToolQueue(db, events, evidence, approvals);

    const loadedPlugins = await loadPlugins(resolve(config.pluginDir), {
      tools,
      registerCommand: (command) => commands.register(command),
    });

    const client = createConfigBackedChatModel(config);
    const runner = new HarnessRunner({ config, model: client, tools, runs, queue, evidence, events });
    const harness = createCliHarnessAdapter(runs, evidence, approvals, queue, runner);
    const agent = new CorvusAgent({ config, tools, model: client, runner, harness });

    const needsSetup = !config.endpoint || !config.model || !config.apiKeyEnv || !process.env[config.apiKeyEnv];

    const tui = new CorvusTui({
      config,
      agent,
      commands,
      tools,
      harness,
      plugins: loadedPlugins,
      initialMode: needsSetup ? "setup" : "line",
      saveConfig: () => saveConfig(config),
    });
    tools.setPermissionRequester((prompt) => tui.askPermission(prompt));

    await tui.start();
  } finally {
    db.close();
  }
}

function createCliHarnessAdapter(
  runs: RunStore,
  evidence: EvidenceStore,
  approvals: ApprovalService,
  queue: ToolQueue,
  runner: HarnessRunner,
): DurableHarnessAdapter {
  return {
    listRuns: () => runs.listRuns(),
    getRun: (id) => runs.getRun(id),
    listMessages: (runId) => runs.listMessages(runId),
    latestSnapshot: (runId) => runs.latestSnapshot(runId),
    cancelRun: (id) => {
      const run = runs.getRun(id);
      if (!run) {
        return undefined;
      }
      if (isTerminalRunStatus(run.status)) {
        return run;
      }
      return runs.updateRunStatus(id, "canceled");
    },
    resumeRun: async (id) => {
      const result = await runner.resumeRun(id);
      return runs.getRun(result.runId);
    },
    listPendingApprovals: (runId) => approvals.listPending(runId),
    resolveApproval: (id, status, scope) => approvals.resolveApproval(id, status, scope),
    runApproved: (toolCallId, tool) => queue.runApproved(toolCallId, tool),
    getEvidence: (id) => evidence.getEvidence(id),
    listEvidence: (runId) => evidence.listEvidence(runId),
  };
}

function isTerminalRunStatus(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled" || status === "interrupted";
}

export function isCliEntryPoint(moduleUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) {
    return false;
  }
  return fileURLToPath(moduleUrl) === resolve(argvPath);
}

if (isCliEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Corvus failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
