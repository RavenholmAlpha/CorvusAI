import type { ProjectMemoryRow } from "./harness/types.js";

export interface MemoryCandidate { kind: ProjectMemoryRow["kind"]; title: string; content: string; confidence: number; }

function section(text: string, names: string[]): string[] {
  const lines = text.split(/\r?\n/); const values: string[] = []; let active = false;
  for (const raw of lines) { const line = raw.trim(); const heading = line.replace(/^#+\s*/, "").replace(/:$/, "").toLowerCase(); if (names.includes(heading)) { active = true; continue; } if (active && /^#/.test(line)) break; if (active && /^[-*]\s+/.test(line)) values.push(line.replace(/^[-*]\s+/, "")); }
  return values;
}

/** Extract durable learnings from a child handoff without treating arbitrary prose as verified fact. */
export function curateHandoff(title: string, text: string): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [{ kind: "handoff", title, content: text.slice(0, 12000), confidence: 0.75 }];
  for (const risk of section(text, ["risks", "risk", "风险", "注意事项"])) candidates.push({ kind: "pitfall", title: "Risk from " + title, content: risk, confidence: 0.65 });
  for (const issue of section(text, ["open issues", "open questions", "未解决问题", "开放问题", "next actions", "下一步"])) candidates.push({ kind: "open_issue", title: "Open item from " + title, content: issue, confidence: 0.6 });
  for (const decision of section(text, ["decisions", "decision", "技术决策", "架构决策"])) candidates.push({ kind: "decision", title: "Decision from " + title, content: decision, confidence: 0.7 });
  return candidates.slice(0, 12);
}