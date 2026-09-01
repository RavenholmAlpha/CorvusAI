import type { CorvusConfig } from "./config.js";
import type { HarnessRunner } from "./harness/runner.js";
import type { ChatCompletionRequest } from "./openai-client.js";
import type { ToolRegistry } from "./tools/index.js";
import type { ChatCompletionResponse, ChatMessage, ToolCall } from "./types.js";
import type { DurableHarnessAdapter } from "./commands.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { resolveMainModel } from "./runtime.js";
import {
  buildCompactionPrompt,
  buildSummaryMessage,
  COMPACTION_TIMEOUT_MS,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_KEEP_RECENT_MESSAGES,
  estimateTokens,
  findAssistantWithToolCalls,
  isSummaryMessage,
  breakdownOf,
  emptyBreakdown,
  type CompactionRecord,
  type ContextState,
  type ContextUsage,
  type RoleBreakdown,
} from "./context.js";

export interface ChatModel {
  createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

export interface PendingApprovalInfo {
  approvalId: string;
  toolCallId: string;
  toolName: string | null;
}

export interface SendResult {
  message: ChatMessage;
  runId?: string;
  pendingApprovals?: PendingApprovalInfo[];
}

export interface SendOptions {
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

export interface CorvusAgentOptions {
  config: CorvusConfig;
  tools: ToolRegistry;
  model: ChatModel;
  runner?: HarnessRunner;
  harness?: DurableHarnessAdapter;
  customSystemPrompt?: string;
  /** Adds turn-scoped context such as routed skills without mutating cached history. */
  augmentPrompt?: (content: string) => Promise<string> | string;
  persistCheckpoint?: (sessionId: string, summary: string, sourceMessageCount: number) => Promise<void> | void;
  loadCheckpoint?: (sessionId: string) => { summary: string; sourceMessageCount: number } | undefined;
}

export class CorvusAgent {
  private messages: ChatMessage[];
  private isCompacting = false;
  private pendingCompaction: Promise<void> | null = null;
  private compactionEpoch = 0;
  private lastRunId: string | undefined;
  private currentSessionId: string | undefined;
  private compactionHistory: CompactionRecord[] = [];
  private lastDirectRequestTokens = 0;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalRequests = 0;
  private lastDirectRequestBreakdown: RoleBreakdown = emptyBreakdown();

  constructor(private readonly options: CorvusAgentOptions) {
    this.messages = [{ role: "system", content: this.buildSystemPrompt() }];
  }

  private buildSystemPrompt(): string {
    return this.options.customSystemPrompt ?? buildSystemPrompt(this.options.config);
  }

  private trackUsage(response: ChatCompletionResponse): void {
    const usage = response.usage;
    if (usage) {
      this.totalPromptTokens += usage.promptTokens ?? 0;
      this.totalCompletionTokens += usage.completionTokens ?? 0;
      this.totalRequests += 1;
    }
  }

  refreshSystemPrompt(): void {
    const prompt = this.buildSystemPrompt();
    const index = this.messages.findIndex((message) => message.role === "system" && !isSummaryMessage(message));
    if (index >= 0) this.messages[index] = { role: "system", content: prompt };
    else this.messages.unshift({ role: "system", content: prompt });
  }

  /** Set the active session ID (used to associate runs with a persistent session). */
  setSessionId(sessionId: string | undefined): void {
    this.currentSessionId = sessionId;
  }

  activeSessionId(): string | undefined {
    return this.currentSessionId;
  }

  /** Replace the in-memory conversation with persisted session history. */
  loadSessionHistory(history: ChatMessage[], sessionId: string): void {
    const checkpoint=this.options.loadCheckpoint?.(sessionId);const checkpointMessage=checkpoint?buildSummaryMessage(checkpoint.summary,checkpoint.sourceMessageCount):undefined;
    this.messages = [{ role: "system", content: this.buildSystemPrompt() }, ...(checkpointMessage?[checkpointMessage]:[]), ...history.filter((m) => m.role !== "system")];
    this.currentSessionId = sessionId;
    this.lastRunId = undefined;
  }

  private contextLimits(): { contextWindow: number; threshold: number } {
    const contextWindow = resolveMainModel(this.options.config).settings.contextWindowTokens;
    return { contextWindow, threshold: Math.min(this.options.config.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD, Math.round(contextWindow * 0.7)) };
  }

  /** Current context usage statistics (for the status bar / inspector). */
  contextUsage(): ContextUsage {
    const summary = this.messages.find(isSummaryMessage);
    const state: ContextState = this.isCompacting
      ? "compacting"
      : summary
        ? "summarized"
        : "global";
    return {
      messageCount: this.messages.length,
      estimatedTokens: estimateTokens(this.messages),
      lastRequestTokens: this.options.runner
        ? this.options.runner.lastRequestTokens
        : this.lastDirectRequestTokens,
      memoryBreakdown: breakdownOf(this.messages),
      lastRequestBreakdown: this.options.runner
        ? this.options.runner.lastRequestBreakdown
        : this.lastDirectRequestBreakdown,
      threshold: this.contextLimits().threshold,
      contextWindow: this.contextLimits().contextWindow,
      hasSummary: Boolean(summary),
      summaryTokens: summary ? estimateTokens([summary]) : 0,
      isCompacting: this.isCompacting,
      state,
      compactionHistory: [...this.compactionHistory],
      totalPromptTokens: this.options.runner
        ? this.options.runner.totalPromptTokens + this.totalPromptTokens
        : this.totalPromptTokens,
      totalCompletionTokens: this.options.runner
        ? this.options.runner.totalCompletionTokens + this.totalCompletionTokens
        : this.totalCompletionTokens,
      totalRequests: this.options.runner
        ? this.options.runner.totalRequests + this.totalRequests
        : this.totalRequests,
    };
  }

  /** Trigger compaction immediately (used by /compact). Returns true when truncation happened. */
  compactNow(): boolean {
    return this.checkCompaction();
  }

  /** Drop the in-memory conversation history, keeping only the system prompt (used by /clear). */
  clearContext(): boolean {
    if (this.messages.length <= 1) {
      return false;
    }
    this.messages.length = 1;
    this.lastRunId = undefined;
    this.compactionEpoch += 1;
    this.pendingCompaction = null;
    this.isCompacting = false;
    return true;
  }

  history(): ChatMessage[] {
    return [...this.messages];
  }

  async send(content: string, options: SendOptions = {}): Promise<SendResult> {
    content = this.options.augmentPrompt ? await this.options.augmentPrompt(content) : content;
    // Compaction is fully decoupled: never block the front end on a summary.
    // The sliding window guarantees the last turns stay available regardless.
    this.checkCompaction();

    if (this.options.runner) {
      this.refreshSystemPrompt();
      // Heal a context left dangling by the command-path approval flow:
      // an assistant message with tool_calls but no tool results in memory.
      const healing = await this.healPendingRun();
      if (healing && healing.length > 0) {
        return {
          message: this.messages[this.messages.length - 1],
          runId: this.lastRunId,
          pendingApprovals: healing,
        };
      }
      const history = this.messages.slice(1);
      const result = await this.options.runner.runTurn(content, {
        history,
        onChunk: options.onChunk,
        signal: options.signal,
        sessionId: this.currentSessionId,
      });
      this.lastRunId = result.runId;
      this.messages.push({ role: "user", content });
      this.messages.push(result.message);
      this.scheduleBackgroundCompaction();

      // Check if the run is waiting for approval
      let pendingApprovals: PendingApprovalInfo[] | undefined;
      if (this.options.harness) {
        const run = this.options.harness.getRun(result.runId);
        if (run && run.status === "waiting_for_approval") {
          const approvals = this.options.harness.listPendingApprovals(result.runId);
          if (approvals.length > 0) {
            pendingApprovals = approvals.map((a) => ({
              approvalId: a.id,
              toolCallId: a.toolCallId,
              toolName: a.toolName,
            }));
          }
        }
      }

      return { message: result.message, runId: result.runId, pendingApprovals };
    }

    this.checkCompaction();
    this.messages.push({ role: "user", content });

    const maxRounds = this.options.config.maxToolRounds;
    for (let round = 0; maxRounds === 0 || round <= maxRounds; round += 1) {
      this.refreshSystemPrompt();
      this.lastDirectRequestTokens = estimateTokens(this.messages);
      this.lastDirectRequestBreakdown = breakdownOf(this.messages);
      const response = await this.options.model.createChatCompletion({
        messages: this.messages,
        tools: this.options.tools.toOpenAITools(),
        tool_choice: "auto",
        onChunk: options.onChunk,
        signal: options.signal,
      });
      this.trackUsage(response);
      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error("Model returned no choices");
      }

      this.messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        this.scheduleBackgroundCompaction();
        return { message };
      }

      for (const call of message.tool_calls) {
        this.messages.push(await this.runToolCall(call));
      }
    }

    throw new Error(`Tool loop exceeded maxToolRounds=${this.options.config.maxToolRounds}`);
  }

  /**
   * Repair the in-memory context when its tail is an assistant message with
   * tool_calls but no matching tool results (left behind when approvals were
   * resolved through the /approve command path, which never resumes the run).
   *
   * Returns pending approvals when the user must decide first; otherwise
   * replaces the dangling tail with the durable message sequence.
   */
  private async healPendingRun(): Promise<PendingApprovalInfo[] | undefined> {
    const last = this.messages[this.messages.length - 1];
    if (!last || last.role !== "assistant" || (last.tool_calls?.length ?? 0) === 0) {
      return undefined;
    }
    if (!this.lastRunId || !this.options.runner || !this.options.harness) {
      return undefined;
    }
    const run = this.options.harness.getRun(this.lastRunId);
    if (!run) {
      return undefined;
    }

    const pending = this.options.harness.listPendingApprovals(this.lastRunId);
    if (pending.length > 0) {
      return pending.map((approval) => ({
        approvalId: approval.id,
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
      }));
    }

    const recovered = await this.options.runner.recoverRunContext(this.lastRunId);
    if (recovered.pendingApprovals.length > 0 || recovered.messages.length === 0) {
      return undefined;
    }
    const assistantIndex = findAssistantWithToolCalls(recovered.messages);
    const tail = assistantIndex >= 0 ? recovered.messages.slice(assistantIndex) : recovered.messages.slice(1);
    if (tail.length === 0) {
      return undefined;
    }
    this.messages = [...this.messages.slice(0, -1), ...tail];
    return undefined;
  }

  private checkCompaction(): boolean {
    if (this.messages.length <= 5) {
      return false;
    }
    if (this.isCompacting) {
      // Cascade eviction: while a summary is in flight the window may still
      // grow; evict oldest non-summary messages if it blows past 2x budget.
      this.cascadeEvict();
      return false;
    }

    const estTokens = estimateTokens(this.messages);
    const threshold = this.contextLimits().threshold;

    if (estTokens > threshold) {
      this.startAsyncCompaction(true);
      return true;
    }
    return false;
  }

  /**
   * After a send completes, kick off a background summary for the next turn
   * without truncating the current context. The next send awaits it first,
   * so the summary is visible when the window is finally trimmed.
   */
  private scheduleBackgroundCompaction(): void {
    if (this.isCompacting || this.messages.length <= 5) {
      return;
    }
    const threshold = this.contextLimits().threshold;
    if (estimateTokens(this.messages) > threshold) {
      this.startAsyncCompaction(false);
    }
  }

  /**
   * Cascade eviction: when compaction is already in flight, drop the oldest
   * non-summary messages if the window still exceeds twice the budget.
   */
  private cascadeEvict(): void {
    const threshold = this.contextLimits().threshold;
    if (estimateTokens(this.messages) <= threshold * 2) {
      return;
    }
    const systemMsg = this.messages[0];
    const summary = this.messages.find(isSummaryMessage);
    const nonSummary = this.messages.filter((message) => !isSummaryMessage(message));
    const keepCount = Math.max(2, DEFAULT_KEEP_RECENT_MESSAGES);
    const recent = nonSummary.slice(-keepCount);
    this.messages.length = 0;
    this.messages.push(systemMsg, ...(summary ? [summary] : []), ...recent);
  }

  private startAsyncCompaction(truncateNow: boolean): void {
    this.isCompacting = true;

    const systemMsg = this.messages[0];
    const summary = this.messages.find(isSummaryMessage);
    const nonSummary = this.messages.filter((message) => !isSummaryMessage(message));
    const keepCount = Math.min(nonSummary.length - 1, DEFAULT_KEEP_RECENT_MESSAGES);
    let toCompact: ChatMessage[];

    if (truncateNow) {
      toCompact = nonSummary.slice(1, nonSummary.length - keepCount);
      const recent = nonSummary.slice(nonSummary.length - keepCount);
      // Switch to Sliding Window mode immediately, keeping any existing summary.
      this.messages.length = 0;
      this.messages.push(systemMsg, ...(summary ? [summary] : []), ...recent);
    } else {
      toCompact = nonSummary.slice(1);
    }

    if (toCompact.length === 0) {
      this.isCompacting = false;
      return;
    }

    const compactionPrompt = buildCompactionPrompt(toCompact);
    const epoch = this.compactionEpoch;

    // Background execution
    const summaryPromise = this.options.model
      .createChatCompletion({
        messages: [
          {
            role: "system",
            content: "You are a context compaction engine. Produce a concise summary of the conversation.",
          },
          { role: "user", content: compactionPrompt },
        ],
      })
      .then((response) => {
        if (epoch !== this.compactionEpoch) {
          // Context was cleared while summarizing; drop the stale summary.
          return;
        }
        const summaryMsg = response.choices[0]?.message;
        if (summaryMsg) {
          const compactMsg = buildSummaryMessage(summaryMsg.content ?? "", toCompact.length);
          // Replace any stale summary, then insert the fresh one after the system prompt.
          this.messages = [
            this.messages[0],
            ...this.messages.slice(1).filter((message) => !isSummaryMessage(message)),
          ];
          this.messages.splice(1, 0, compactMsg);
          if(this.currentSessionId)void this.options.persistCheckpoint?.(this.currentSessionId,summaryMsg.content ?? "",toCompact.length);
          this.compactionHistory.push({
            at: new Date().toLocaleTimeString(),
            compactedCount: toCompact.length,
            summaryTokens: estimateTokens([compactMsg]),
          });
          if (this.compactionHistory.length > 10) {
            this.compactionHistory.shift();
          }
        }
      });

    // Timeout fallback: if summarization stalls, keep the sliding window as-is.
    const timeoutPromise = new Promise<void>((_resolve, reject) => {
      setTimeout(() => reject(new Error("compaction timeout")), COMPACTION_TIMEOUT_MS);
    });

    this.pendingCompaction = Promise.race([summaryPromise, timeoutPromise])
      .catch(() => {
        // Silently fail if compaction errors or times out; the window remains.
      })
      .finally(() => {
        this.isCompacting = false;
        this.pendingCompaction = null;
      });
  }

  private async runToolCall(call: ToolCall): Promise<ChatMessage> {
    try {
      const args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
      const result = await this.options.tools.execute(call.function.name, args);
      return {
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      };
    } catch (error) {
      return {
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify({ error: (error as Error).message }),
      };
    }
  }

  async resume(runId: string): Promise<SendResult> {
    if (!this.options.runner) {
      throw new Error("Cannot resume without a runner");
    }

    const result = await this.options.runner.resumeRun(runId);
    this.lastRunId = runId;

    // Replace the intermediate assistant message (which had tool_calls) with the new message
    if (this.messages.length > 0) {
      const last = this.messages[this.messages.length - 1];
      if (last.role === "assistant" && last.tool_calls) {
        this.messages[this.messages.length - 1] = result.message;
      } else {
        this.messages.push(result.message);
      }
    } else {
      this.messages.push(result.message);
    }

    // Check for further pending approvals
    let pendingApprovals: PendingApprovalInfo[] | undefined;
    if (this.options.harness) {
      const run = this.options.harness.getRun(runId);
      if (run && run.status === "waiting_for_approval") {
        const approvals = this.options.harness.listPendingApprovals(runId);
        if (approvals.length > 0) {
          pendingApprovals = approvals.map((a) => ({
            approvalId: a.id,
            toolCallId: a.toolCallId,
            toolName: a.toolName,
          }));
        }
      }
    }

    return { message: result.message, runId, pendingApprovals };
  }
}
