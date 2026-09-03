import { existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { RunStore } from "../harness/run-store.js";
import type { SubagentManager } from "../subagents.js";
import { detectCodexCli } from "./detector.js";
import { runCodex } from "./driver.js";
import type { CodexThreadItem } from "./types.js";
import { logger } from "../logger.js";

export interface DispatchCodexOptions {
  runs: RunStore;
  subagents: SubagentManager;
  projectIdOrPath: string;
  prompt: string;
  description?: string;
  model?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  parentRunId?: string;
  parentSessionId?: string;
  timeoutMs?: number;
  onChunk?: (text: string) => void;
  onItem?: (item: CodexThreadItem) => void;
  signal?: AbortSignal;
}

export async function dispatchCodexTask(options: DispatchCodexOptions): Promise<string> {
  const { runs, subagents, projectIdOrPath, prompt, description, model, sandbox, parentRunId, parentSessionId: parentSessionOverride, timeoutMs, onChunk, onItem, signal } = options;

  // 1. Verify Codex CLI is installed
  const detection = await detectCodexCli();
  if (!detection.installed) {
    throw new Error(
      detection.error || "Codex CLI is not installed in system PATH. Please run 'npm install -g @openai/codex' to install.",
    );
  }

  // 2. Resolve workspace project
  const projects = runs.listProjects();
  const cleanInput = String(projectIdOrPath || "").trim();
  const normInput = cleanInput.replace(/\\/g, "/").toLowerCase();
  let target = projects.find((p) => {
    if (p.id === cleanInput) return true;
    if (p.name.toLowerCase() === cleanInput.toLowerCase()) return true;
    const pNorm = (p.path || "").replace(/\\/g, "/").toLowerCase();
    if (pNorm === normInput) return true;
    if (pNorm.endsWith("/" + normInput) || normInput.endsWith("/" + pNorm)) return true;
    const baseName = (p.path || "").split(/[\\/]/).filter(Boolean).pop()?.toLowerCase();
    if (baseName && baseName === normInput) return true;
    return false;
  });

  if (!target && existsSync(cleanInput)) {
    try {
      const stat = statSync(cleanInput);
      if (stat.isDirectory()) {
        const resolvedPath = resolve(cleanInput);
        const dirName = basename(resolvedPath) || "Workspace";
        target = runs.createProject(dirName, resolvedPath);
        logger.info("Auto-registered directory as workspace for Codex", { name: dirName, path: resolvedPath, id: target.id });
      }
    } catch {}
  }

  if (!target) {
    throw new Error(
      `Workspace project not found for '${projectIdOrPath}'. Registered projects: ${projects.map((p) => `${p.name} (${p.path})`).join(", ")}. Use list_workspaces or register_workspace.`,
    );
  }

  const parentSessionId =
    parentSessionOverride ??
    subagents.currentParentSessionId() ??
    (parentRunId ? runs.getRun(parentRunId)?.sessionId ?? undefined : undefined) ??
    runs.getLatestMasterSession()?.id ??
    target.lastSessionId ??
    "";

  // 3. Run inside SubagentManager
  const delegated = await subagents.run(
    parentSessionId,
    prompt,
    description,
    async (depth, taskId, taskSignal) => {
      const childSession = runs.createSession(
        target.id,
        description?.trim() || "Codex: " + prompt.slice(0, 56),
      );
      subagents.bindChildSession(taskId, childSession.id);

      const workerAgent = runs.createAgent({
        kind: "worker",
        projectId: target.id,
        parentAgentId: runs.ensureProjectAgent(target.id).id,
        roleId: "codex",
        labelConfig: { label: description?.trim() || "Codex Agent", taskId },
      });
      runs.assignSessionAgent(childSession.id, workerAgent.id, "worker", parentSessionId);

      runs.createSubagentTask({
        id: taskId,
        parentRunId: parentRunId ?? null,
        parentSessionId,
        childSessionId: childSession.id,
        prompt,
        description: description ?? null,
        modelProfile: "codex",
        agentScope: "project",
        projectId: target.id,
        depth,
      });

      const run = runs.createRun({
        goal: prompt,
        model: model || detection.version || "codex-cli",
        endpoint: "local:codex",
        sessionId: childSession.id,
      });
      runs.updateRunStatus(run.id, "running");

      runs.appendMessage({
        runId: run.id,
        role: "user",
        content: prompt,
      });

      // Forward cancellation from parent signal if supplied
      if (signal) {
        signal.addEventListener("abort", () => {
          subagents.cancel(taskId);
        }, { once: true });
      }

      const codexResult = await runCodex(
        {
          prompt,
          workingDirectory: target.path,
          model,
          sandbox: sandbox ?? "workspace-write",
          timeoutMs: timeoutMs ?? 600000,
          signal: taskSignal,
        },
        {
          onChunk: (text) => {
            onChunk?.(text);
          },
          onItemCompleted: (item) => {
            onItem?.(item);
            if (item.type === "command_execution") {
              runs.appendMessage({
                runId: run.id,
                role: "tool",
                content: JSON.stringify({
                  command: item.command,
                  output: item.aggregated_output,
                  exitCode: item.exit_code,
                  status: item.status,
                }),
                metadata: {
                  name: `codex:exec ${item.command.split(" ")[0] || "shell"}`,
                  command: item.command,
                  status: item.status,
                },
              });
            } else if (item.type === "file_change") {
              runs.appendMessage({
                runId: run.id,
                role: "tool",
                content: JSON.stringify({
                  changes: item.changes,
                  status: item.status,
                }),
                metadata: {
                  name: "codex:file_change",
                  changes: item.changes,
                  status: item.status,
                },
              });
            } else if (item.type === "mcp_tool_call") {
              runs.appendMessage({
                runId: run.id,
                role: "tool",
                content: JSON.stringify(item.result ?? item.error ?? {}),
                metadata: {
                  name: `codex:mcp ${item.server}/${item.tool}`,
                  status: item.status,
                },
              });
            }
          },
        },
      );

      const isAborted = taskSignal.aborted;
      const finalStatus = isAborted ? "canceled" : codexResult.ok ? "succeeded" : "failed";
      runs.updateRunStatus(run.id, finalStatus);
      runs.updateSubagentTask(taskId, finalStatus, isAborted ? "Canceled by user" : codexResult.error ?? null);

      let fullContent = "";
      if (codexResult.reasoning) {
        fullContent += `<think>\n${codexResult.reasoning.trim()}\n</think>\n\n`;
      }
      fullContent += codexResult.finalResponse || (codexResult.error ? `**Codex Error**: ${codexResult.error}` : "Task completed by Codex.");

      const metadata: Record<string, any> = {
        engine: "codex",
        commandsCount: codexResult.commands.length,
        fileChangesCount: codexResult.fileChanges.length,
      };
      if (codexResult.threadId) metadata.threadId = codexResult.threadId;
      if (codexResult.usage) metadata.usage = codexResult.usage;

      runs.appendMessage({
        runId: run.id,
        role: "assistant",
        content: fullContent,
        metadata,
      });

      const summaryParts = [
        `### Codex Agent Execution on [${target.name}] (\`${target.path}\`)`,
        codexResult.threadId ? `- **Thread ID**: \`${codexResult.threadId}\`` : null,
        `- **Commands Executed**: ${codexResult.commands.length}`,
        codexResult.commands.length > 0
          ? codexResult.commands.map((c) => `  - \`${c.command}\` (${c.status})`).slice(0, 5).join("\n")
          : null,
        `- **Files Changed**: ${codexResult.fileChanges.flatMap((f) => f.changes).length}`,
        codexResult.fileChanges.flatMap((f) => f.changes).length > 0
          ? codexResult.fileChanges
              .flatMap((f) => f.changes)
              .map((c) => `  - [${c.kind}] \`${c.path}\``)
              .slice(0, 5)
              .join("\n")
          : null,
        "",
        "#### Outcome:",
        codexResult.finalResponse || codexResult.error || "Completed.",
      ].filter(Boolean);

      return {
        childSessionId: childSession.id,
        result: summaryParts.join("\n"),
      };
    },
  );

  return delegated.result;
}
