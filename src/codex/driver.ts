import { execFile, spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import { detectCodexCli } from "./detector.js";
import type {
  CodexCallbacks,
  CodexEvent,
  CodexRunOptions,
  CodexRunResult,
  CodexThreadItem,
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try {
      execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    } catch {
      try {
        child.kill();
      } catch {}
    }
  } else {
    try {
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
      }, 2000);
    } catch {
      try {
        child.kill();
      } catch {}
    }
  }
}

/**
 * Execute Codex CLI non-interactively with streaming event callbacks and timeout protection.
 * Automatically feeds prompt via stdin and closes stdin to prevent hanging.
 */
export async function runCodex(
  options: CodexRunOptions,
  callbacks?: CodexCallbacks,
): Promise<CodexRunResult> {
  const detection = await detectCodexCli(options.codexPath);
  if (!detection.installed || !detection.path) {
    const errMsg = detection.error || "Codex CLI is not installed or not found in system PATH. Please run 'npm install -g @openai/codex' to install.";
    callbacks?.onError?.(errMsg);
    return {
      ok: false,
      finalResponse: "",
      reasoning: "",
      commands: [],
      fileChanges: [],
      mcpCalls: [],
      error: errMsg,
    };
  }

  const args: string[] = ["exec", "--json", "-C", options.workingDirectory, "--skip-git-repo-check"];

  if (options.sandbox && options.sandbox !== "workspace-write") {
    args.push("-s", options.sandbox);
  } else {
    // --approve-for-me uses workspace-write sandbox and avoids interactive prompt deadlocks
    args.push("--approve-for-me");
  }

  if (options.model) {
    args.push("-m", options.model);
  }

  if (options.threadId) {
    args.push("resume", options.threadId);
  }

  // Read prompt from stdin
  args.push("-");

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<CodexRunResult>((resolvePromise) => {
    let child: ChildProcess;
    try {
      const isWindows = process.platform === "win32";
      const executable = isWindows ? (process.env.ComSpec || "cmd.exe") : detection.path!;
      const spawnArgs = isWindows ? ["/d", "/s", "/c", detection.path!, ...args] : args;

      child = spawn(executable, spawnArgs, {
        cwd: options.workingDirectory,
        env: {
          ...process.env,
          // Ensure UTF-8 output
          PYTHONIOENCODING: "utf-8",
        },
        windowsHide: true,
      });
    } catch (spawnErr) {
      const errStr = (spawnErr as Error).message;
      callbacks?.onError?.(errStr);
      return resolvePromise({
        ok: false,
        finalResponse: "",
        reasoning: "",
        commands: [],
        fileChanges: [],
        mcpCalls: [],
        error: `Failed to spawn Codex CLI process: ${errStr}`,
      });
    }

    let threadId: string | undefined = options.threadId;
    let finalResponse = "";
    let reasoning = "";
    const commands: CommandExecutionItem[] = [];
    const fileChanges: FileChangeItem[] = [];
    const mcpCalls: McpToolCallItem[] = [];
    let lastError: string | undefined;
    const stderrChunks: string[] = [];
    let isSettled = false;

    const timeoutTimer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        killProcessTree(child);
        const timeoutMsg = `Codex execution timed out after ${Math.round(timeoutMs / 1000)}s`;
        callbacks?.onError?.(timeoutMsg);
        resolvePromise({
          ok: false,
          threadId,
          finalResponse,
          reasoning,
          commands,
          fileChanges,
          mcpCalls,
          error: timeoutMsg,
        });
      }
    }, timeoutMs);

    const onAbort = () => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeoutTimer);
        killProcessTree(child);
        const abortMsg = "Codex execution canceled by user";
        callbacks?.onError?.(abortMsg);
        resolvePromise({
          ok: false,
          threadId,
          finalResponse,
          reasoning,
          commands,
          fileChanges,
          mcpCalls,
          error: abortMsg,
        });
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    // Crucial: write prompt and close stdin immediately so Codex doesn't wait
    if (child.stdin) {
      child.stdin.write(options.prompt);
      child.stdin.end();
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        stderrChunks.push(data.toString("utf8"));
      });
    }

    if (child.stdout) {
      const rl = readline.createInterface({ input: child.stdout, terminal: false });
      rl.on("line", (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          const event = JSON.parse(trimmed) as CodexEvent;
          switch (event.type) {
            case "thread.started":
              threadId = event.thread_id;
              callbacks?.onThreadStarted?.(event.thread_id);
              break;

            case "item.started":
              callbacks?.onItemStarted?.(event.item);
              break;

            case "item.updated":
              if (event.item.type === "agent_message") {
                callbacks?.onChunk?.(event.item.text);
              } else if (event.item.type === "reasoning") {
                callbacks?.onReasoningChunk?.(event.item.text);
              }
              callbacks?.onItemUpdated?.(event.item);
              break;

            case "item.completed":
              callbacks?.onItemCompleted?.(event.item);
              if (event.item.type === "command_execution") {
                commands.push(event.item);
              } else if (event.item.type === "file_change") {
                fileChanges.push(event.item);
              } else if (event.item.type === "mcp_tool_call") {
                mcpCalls.push(event.item);
              } else if (event.item.type === "agent_message") {
                finalResponse = event.item.text;
              } else if (event.item.type === "reasoning") {
                reasoning += (reasoning ? "\n\n" : "") + event.item.text;
              }
              break;

            case "turn.failed":
              lastError = event.error.message;
              callbacks?.onError?.(event.error.message);
              break;

            case "error":
              lastError = event.message;
              callbacks?.onError?.(event.message);
              break;

            default:
              break;
          }
        } catch {
          // Line wasn't JSON (e.g. raw output or warning)
        }
      });
    }

    child.on("error", (err) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeoutTimer);
        const errMsg = `Codex process error: ${err.message}`;
        callbacks?.onError?.(errMsg);
        resolvePromise({
          ok: false,
          threadId,
          finalResponse,
          reasoning,
          commands,
          fileChanges,
          mcpCalls,
          error: errMsg,
        });
      }
    });

    child.on("close", (code) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeoutTimer);
        if (options.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }

        const isOk = code === 0 && !lastError;
        let finalError = lastError;
        if (!isOk && !finalError) {
          const combinedStderr = stderrChunks.join("").trim();
          finalError = combinedStderr || `Codex CLI exited with status ${code}`;
        }

        resolvePromise({
          ok: isOk,
          threadId,
          finalResponse,
          reasoning,
          commands,
          fileChanges,
          mcpCalls,
          error: finalError,
        });
      }
    });
  });
}
