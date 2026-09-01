import stringWidth from "string-width";
import type { ChatMessage } from "../types.js";

export function estimateMessageLines(msg: ChatMessage, columnWidth: number): number {
  const content = msg.content ?? "";
  const prefixWidth = msg.role === "user" || msg.role === "assistant" ? 9 : 0;
  const lines = content.split("\n");
  let total = 0;
  for (const line of lines) total += Math.max(1, Math.ceil((prefixWidth + stringWidth(line)) / Math.max(1, columnWidth)));
  if (msg.role === "assistant" && (msg.tool_calls?.length ?? 0) > 0) total += 1;
  return total;
}

export interface VisibleWindow { messages: ChatMessage[]; hiddenCount: number; newerCount: number; }
export function selectVisibleMessages(history: ChatMessage[], availableRows: number, columnWidth: number, offset = 0): VisibleWindow {
  if (history.length === 0 || availableRows <= 0) return { messages: [], hiddenCount: history.length, newerCount: 0 };
  let end = Math.max(0, history.length - 1 - offset);
  const visible: ChatMessage[] = []; let used = 0; let i = end;
  for (; i >= 0; i -= 1) { const msg = history[i]; const rows = estimateMessageLines(msg, columnWidth); if (used + rows > availableRows && visible.length > 0) break; visible.unshift(msg); used += rows; }
  if (visible.length === 0) visible.unshift(history[end]);
  return { messages: visible, hiddenCount: i + 1, newerCount: offset > 0 ? Math.min(offset, history.length - 1) : 0 };
}

export interface ConversationRow { role: "user" | "assistant" | "tool" | "system" | "separator"; text: string; }
export interface LineViewport { rows: ConversationRow[]; hiddenAbove: number; hiddenBelow: number; totalRows: number; }

/** Split text into terminal-width rows without cutting wide CJK glyphs. */
export function wrapDisplayText(text: string, width: number): string[] {
  const out: string[] = []; const safeWidth = Math.max(8, width);
  for (const rawLine of text.split("\n")) {
    if (!rawLine) { out.push(""); continue; }
    let line = "";
    for (const char of Array.from(rawLine)) {
      if (stringWidth(line + char) > safeWidth && line) { out.push(line); line = char; } else line += char;
    }
    out.push(line);
  }
  return out;
}

/** Build render rows for the line-level CLI chat viewport. */
export function buildConversationRows(history: ChatMessage[], width: number): ConversationRow[] {
  const rows: ConversationRow[] = [];
  history.forEach((msg, index) => {
    if (msg.role === "system") return;
    if (msg.role === "user" && index > 0) rows.push({ role: "separator", text: "" });
    const role = msg.role === "tool" ? "tool" : msg.role;
    const label = msg.role === "user" ? "▸ YOU" : msg.role === "assistant" ? "◂ CORVUS" : "↳ TOOL";
    rows.push({ role, text: label });
    for (const line of wrapDisplayText(msg.content ?? "", Math.max(8, width - 4))) rows.push({ role, text: "  " + line });
  });
  return rows;
}

/** Return a fixed-height line viewport; offset 0 is pinned to newest output. */
export function selectConversationRows(rows: ConversationRow[], availableRows: number, offset = 0): LineViewport {
  const end = Math.max(0, rows.length - Math.max(0, offset));
  const start = Math.max(0, end - Math.max(1, availableRows));
  return { rows: rows.slice(start, end), hiddenAbove: start, hiddenBelow: rows.length - end, totalRows: rows.length };
}
