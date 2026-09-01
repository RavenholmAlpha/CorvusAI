import { describe, expect, it } from "vitest";
import { pendingApprovalsForSession } from "./ChatPage";

describe("pendingApprovalsForSession", () => {
  it("shows only approvals belonging to the active conversation", () => {
    const approvals = [
      { id: "a", sessionId: "session-a" },
      { id: "b", sessionId: "session-b" },
      { id: "legacy", sessionId: null },
    ];
    expect(pendingApprovalsForSession(approvals, "session-a")).toEqual([approvals[0]]);
    expect(pendingApprovalsForSession(approvals, "")).toEqual([]);
  });
});
