import { describe, expect, it } from "vitest";
import { GlobalOrchestrator } from "../src/orchestrator.js";

describe("GlobalOrchestrator", () => {
  it("builds a multi-project plan from routing rules and dispatches sequentially", async () => {
    const order: string[] = [];
    const orchestrator = new GlobalOrchestrator(
      () => [{ id: "corvus", name: "Corvus", path: "/corvus" }, { id: "vault", name: "Vault", path: "/vault" }],
      () => [{ id: "integration", keywords: ["vault", "corvus"], projectIds: ["vault", "corvus"], roleId: "architect" }],
      async (projectId) => { order.push(projectId); return "done:" + projectId; },
    );
    const plan = orchestrator.plan("Integrate Vault into Corvus", "corvus");
    expect(plan.targets.map((target) => target.projectId)).toEqual(["vault", "corvus"]);
    const result = await orchestrator.execute(plan);
    expect(order).toEqual(["vault", "corvus"]);
    expect(result).toEqual([{ projectId: "vault", content: "done:vault" }, { projectId: "corvus", content: "done:corvus" }]);
  });

  it("keeps the highest-priority role when rules target the same project", () => {
    const orchestrator = new GlobalOrchestrator(
      () => [{ id: "app", name: "App", path: "/app" }],
      () => [
        { id: "low", keywords: ["review"], projectIds: ["app"], roleId: "general", priority: 1 },
        { id: "high", keywords: ["review"], projectIds: ["app"], roleId: "security", priority: 10 },
      ],
      async () => "done",
    );
    expect(orchestrator.plan("review this").targets[0]).toMatchObject({ roleId: "security", reason: "routing rule high" });
  });
});
