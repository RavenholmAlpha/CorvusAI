import type { ChatMessage } from "./types.js";

export type ContextState = "global" | "compacting" | "summarized";

export interface RoleBreakdown {
  system: number;
  user: number;
  assistant: number;
  tool: number;
}

export function emptyBreakdown(): RoleBreakdown {
  return { system: 0, user: 0, assistant: 0, tool: 0 };
}

export function breakdownOf(messages: ChatMessage[]): RoleBreakdown {
  const breakdown = emptyBreakdown();
  for (const message of messages) {
    const role = message.role as keyof RoleBreakdown;
    if (role in breakdown) {
      breakdown[role] += estimateTokens([message]);
    }
  }
  return breakdown;
}

export function breakdownTotal(breakdown: RoleBreakdown): number {
  return breakdown.system + breakdown.user + breakdown.assistant + breakdown.tool;
}

export interface CompactionRecord {
  at: string;
  compactedCount: number;
  summaryTokens: number;
}

export interface ContextUsage {
  messageCount: number;
  estimatedTokens: number;
  lastRequestTokens: number;
  memoryBreakdown: RoleBreakdown;
  lastRequestBreakdown: RoleBreakdown;
  threshold: number;
  contextWindow: number;
  hasSummary: boolean;
  summaryTokens: number;
  isCompacting: boolean;
  state: ContextState;
  compactionHistory: CompactionRecord[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
}

// Token-budget constants (character-based estimate: ~4 chars per token).
export const DEFAULT_COMPACTION_THRESHOLD = 8000;
export const DEFAULT_KEEP_RECENT_MESSAGES = 4;
export const COMPACTION_TIMEOUT_MS = 60000;

// System Separation Token (SST) style marker for compacted history, following
// the SmoothContext design: [SEG:SUMMARY|scope|ARCHIVAL].
export const SUMMARY_MARKER = "[SEG:SUMMARY";
export const SUMMARY_END_MARKER = "[SEG:SUMMARY|END]";

export function isSummaryMessage(message: ChatMessage): boolean {
  return (
    typeof message.content === "string" &&
    message.content.startsWith(SUMMARY_MARKER)
  );
}

export function estimateContextChars(messages: ChatMessage[]): number {
  return JSON.stringify(messages).length;
}

/** Rough token estimate: ~4 chars per token, JSON overhead folded in. */
export function estimateTokens(messages: ChatMessage[]): number {
  return Math.ceil(estimateContextChars(messages) / 4);
}

export interface TrimResult {
  messages: ChatMessage[];
  trimmedCount: number;
}

/**
 * Trim a message list to stay under a character budget.
 * Always keeps the system message (index 0), any existing summary message,
 * and the most recent non-summary messages.
 */
export function trimMessagesToBudget(
  messages: ChatMessage[],
  budgetChars: number,
  keepRecent = DEFAULT_KEEP_RECENT_MESSAGES,
): TrimResult {
  if (messages.length === 0 || estimateContextChars(messages) <= budgetChars) {
    return { messages, trimmedCount: 0 };
  }
  const [systemMessage, ...rest] = messages;
  if (!systemMessage) {
    return { messages, trimmedCount: 0 };
  }
  const summary = rest.find(isSummaryMessage);
  const nonSummary = rest.filter((message) => !isSummaryMessage(message));
  const recent = nonSummary.slice(-Math.max(1, keepRecent));
  const trimmed = summary ? [summary, ...recent] : recent;
  const result = [systemMessage, ...trimmed];
  return { messages: result, trimmedCount: messages.length - result.length };
}

export function findAssistantWithToolCalls(messages: ChatMessage[]): number {
  return messages.findIndex(
    (message) => message.role === "assistant" && (message.tool_calls?.length ?? 0) > 0,
  );
}

/**
 * Build the compaction summary message: SST delimiters + transition bridge
 * guidance, so the model treats it as archival context, not user input.
 */
export function buildSummaryMessage(
  summaryText: string,
  compressedTurns: number,
): ChatMessage {
  const scope = compressedTurns > 0 ? `turns:1-${compressedTurns}` : "turns:1-*";
  const content = [
    `${SUMMARY_MARKER}|${scope}|ARCHIVAL]`,
    "The conversation before this point was compacted into the summary below.",
    "You are continuing an ongoing conversation. Base your answers on this summary",
    "plus the recent messages; if the summary lacks a detail the user asks about,",
    "say so and proceed rather than guessing.",
    "",
    summaryText,
    SUMMARY_END_MARKER,
  ].join("\n");
  // System role keeps archival context out of the user stream.
  return { role: "system", content };
}

export function buildCompactionPrompt(toCompact: ChatMessage[]): string {
  return `Summarize the following interaction history compactly, focusing on actions taken, files modified, and current state. Keep it concise.

${JSON.stringify(toCompact)}`;
}