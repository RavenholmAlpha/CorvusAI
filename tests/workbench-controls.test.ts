import { describe, expect, it } from "vitest";
import { RuntimeStateManager } from "../src/runtime-state.js";

describe("global workbench controls", () => {
  it("opens and closes navigation and approval overlays independently", () => {
    const state = new RuntimeStateManager({ mode: "stream" });
    state.toggleNavigation(true);
    expect(state.get()).toMatchObject({ navigationOpen: true, approvalCenterOpen: false });
    state.setNavigationIndex(3);
    expect(state.get().navigationIndex).toBe(3);
    state.toggleApprovalCenter(true);
    expect(state.get()).toMatchObject({ navigationOpen: false, approvalCenterOpen: true });
    state.toggleApprovalCenter(false);
    expect(state.get().approvalCenterOpen).toBe(false);
    state.setInputMode("compose");
    expect(state.get()).toMatchObject({ inputMode: "compose", focusedPane: "stream" });
    state.setActivePage("tasks");
    expect(state.get()).toMatchObject({ activePage: "tasks", inputMode: "navigation", contentIndex: 0 });
    state.setFocusedPane("panel");
    state.setContentIndex(4);
    expect(state.get()).toMatchObject({ focusedPane: "panel", contentIndex: 4 });
    state.setDetailOverlay("task", "task_1");
    expect(state.get()).toMatchObject({ detailOverlay: "task", selectedItemId: "task_1" });
    state.setDetailOverlay("none", null);
    expect(state.get().detailOverlay).toBe("none");
    state.setActivePage("settings");
    expect(state.get()).toMatchObject({ activePage: "settings", dashboardSection: "settings", inputMode: "navigation", contentIndex: 0 });
    state.setActivePage("tools");
    expect(state.get()).toMatchObject({ activePage: "tools", dashboardSection: "tools" });
    state.setActivePage("settings");
    state.setActivePage("providers");
    expect(state.get().pageHistory).toContain("settings");
    state.goBack();
    expect(state.get().activePage).toBe("settings");
  });
});
