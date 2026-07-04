import type { CorvusConfig } from "./config.js";
import type { HarnessRunner } from "./harness/runner.js";
import type { ChatCompletionRequest } from "./openai-client.js";
import type { ToolRegistry } from "./tools/index.js";
import type { ChatCompletionResponse, ChatMessage, ToolCall } from "./types.js";
import type { DurableHarnessAdapter } from "./commands.js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
}

export interface CorvusAgentOptions {
  config: CorvusConfig;
  tools: ToolRegistry;
  model: ChatModel;
  runner?: HarnessRunner;
  harness?: DurableHarnessAdapter;
}

export class CorvusAgent {
  private readonly messages: ChatMessage[];
  private isCompacting = false;

  constructor(private readonly options: CorvusAgentOptions) {
    this.messages = [{ role: "system", content: this.buildSystemPrompt() }];
  }

  history(): ChatMessage[] {
    return [...this.messages];
  }

  async send(content: string, options: SendOptions = {}): Promise<SendResult> {
    this.checkCompaction();

    if (this.options.runner) {
      this.refreshSystemPrompt();
      const history = this.messages.slice(1);
      const result = await this.options.runner.runTurn(content, { 
        history,
        onChunk: options.onChunk,
      });
      this.messages.push({ role: "user", content });
      this.messages.push(result.message);

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

    for (let round = 0; round <= this.options.config.maxToolRounds; round += 1) {
      this.refreshSystemPrompt();
      const response = await this.options.model.createChatCompletion({
        messages: this.messages,
        tools: this.options.tools.toOpenAITools(),
        tool_choice: "auto",
        onChunk: options.onChunk,
      });
      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error("Model returned no choices");
      }

      this.messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return { message };
      }

      for (const call of message.tool_calls) {
        this.messages.push(await this.runToolCall(call));
      }
    }

    throw new Error(`Tool loop exceeded maxToolRounds=${this.options.config.maxToolRounds}`);
  }

  private checkCompaction(): void {
    if (this.isCompacting || this.messages.length <= 5) return;
    
    // Estimate token size by character length
    const estLength = JSON.stringify(this.messages).length;
    const threshold = this.options.config.compactionThreshold ?? 20000;
    
    if (estLength > threshold) {
      this.startAsyncCompaction();
    }
  }

  private startAsyncCompaction(): void {
    this.isCompacting = true;
    
    const systemMsg = this.messages[0];
    const keepCount = Math.min(this.messages.length - 1, 4); // Keep last 4 messages (Sliding Window)
    const toCompact = this.messages.slice(1, this.messages.length - keepCount);
    const recent = this.messages.slice(this.messages.length - keepCount);
    
    // Switch to Sliding Window mode immediately
    this.messages.length = 0;
    this.messages.push(systemMsg, ...recent);
    
    const compactionPrompt = `Summarize the following interaction history compactly, focusing on actions taken, files modified, and current state. Keep it concise.\n\n${JSON.stringify(toCompact)}`;
    
    // Background execution
    this.options.model.createChatCompletion({
      messages: [
        { role: "system", content: "You are a context compaction engine. Produce a concise summary of the conversation." },
        { role: "user", content: compactionPrompt }
      ]
    }).then(response => {
      const summaryMsg = response.choices[0]?.message;
      if (summaryMsg) {
        const compactMsg: ChatMessage = {
          role: "user",
          content: `[Previous Context Compacted]\n${summaryMsg.content}`
        };
        // Splice the early summary back into the global history just after the system prompt
        this.messages.splice(1, 0, compactMsg);
      }
    }).catch(() => {
      // Silently fail if compaction errors, the sliding window remains
    }).finally(() => {
      this.isCompacting = false;
    });
  }

  private buildSystemPrompt(): string {
    const lines = [this.options.config.systemPrompt];
    
    // Load local rules / workspace skills
    try {
      const cwd = process.cwd();
      const rootRulePath = join(cwd, ".corvusrules");
      if (existsSync(rootRulePath)) {
        lines.push(`Local Guidelines (.corvusrules):\n${readFileSync(rootRulePath, "utf8")}`);
      }
      
      const rulesDir = join(cwd, ".corvus", "rules");
      if (existsSync(rulesDir)) {
        const files = readdirSync(rulesDir).filter(f => f.endsWith(".md"));
        for (const file of files) {
          lines.push(`Local Skill (${file}):\n${readFileSync(join(rulesDir, file), "utf8")}`);
        }
      }
    } catch (e) {
      // Ignore file system errors when loading rules
    }

    if (this.options.config.goal) {
      lines.push(`Active goal: ${this.options.config.goal}`);
    }
    if (this.options.config.review.enabled) {
      lines.push(`Review mode instruction: ${this.options.config.review.instruction}`);
    }
    return lines.join("\n\n");
  }

  private refreshSystemPrompt(): void {
    this.messages[0] = { role: "system", content: this.buildSystemPrompt() };
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
