import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../src/types.js";
import { estimateMessageLines, selectVisibleMessages } from "../src/ui/stream-utils.js";

function msg(role: ChatMessage["role"], content: string, toolCalls = 0): ChatMessage {
  const message: ChatMessage = { role, content };
  if (toolCalls > 0) {
    message.tool_calls = Array.from({ length: toolCalls }, (_, i) => ({
      id: "c" + i,
      type: "function" as const,
      function: { name: "tool", arguments: "{}" },
    }));
  }
  return message;
}

describe("estimateMessageLines", () => {
  it("counts at least one row per message", () => {
    expect(estimateMessageLines(msg("user", ""), 40)).toBe(1);
    expect(estimateMessageLines(msg("user", "hi"), 40)).toBe(1);
  });

  it("counts wrapped rows for long content", () => {
    // 50 chars at columnWidth 40 = 2 rows
    expect(estimateMessageLines(msg("user", "x".repeat(50)), 40)).toBe(2);
    // wide CJK chars count double
    expect(estimateMessageLines(msg("assistant", "中".repeat(30)), 40)).toBe(2);
  });

  it("adds a row for tool-call badges", () => {
    expect(estimateMessageLines(msg("assistant", "ok", 2), 40)).toBe(2);
  });
});

describe("selectVisibleMessages", () => {
  it("keeps the newest tail that fits and reports hidden count", () => {
    const history = [
      msg("user", "old 1"),
      msg("assistant", "old 2"),
      msg("user", "new 1"),
      msg("assistant", "new 2"),
    ];
    const result = selectVisibleMessages(history, 2, 40);
    expect(result.messages.map((m) => m.content)).toEqual(["new 1", "new 2"]);
    expect(result.hiddenCount).toBe(2);
    expect(result.newerCount).toBe(0);

    // Scrolled up by one message: the window shows older content and reports newer.
    const scrolled = selectVisibleMessages(history, 2, 40, 1);
    expect(scrolled.messages.map((m) => m.content)).toEqual(["old 2", "new 1"]);
    expect(scrolled.hiddenCount).toBe(1);
    expect(scrolled.newerCount).toBe(1);
  });

  it("returns everything when it fits", () => {
    const history = [msg("user", "a"), msg("assistant", "b")];
    const result = selectVisibleMessages(history, 10, 40);
    expect(result.hiddenCount).toBe(0);
    expect(result.messages).toHaveLength(2);
  });

  it("keeps at least the newest message even when it exceeds the budget", () => {
    const history = [msg("user", "old"), msg("assistant", "very long content".repeat(20))];
    const result = selectVisibleMessages(history, 1, 40);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toContain("very long");
  });
});
