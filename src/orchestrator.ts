export interface ProjectSummary { id: string; name: string; path: string; }
export interface RoutingRule { id: string; keywords: string[]; projectIds: string[]; roleId?: string; priority?: number; }
export interface ProjectDispatchPlan { prompt: string; targets: Array<{ projectId: string; roleId?: string; reason: string }>; }

export class GlobalOrchestrator {
  constructor(private readonly projects: () => ProjectSummary[], private readonly rules: () => RoutingRule[], private readonly dispatch: (projectId: string, prompt: string, roleId?: string) => Promise<string>) {}
  plan(prompt: string, fallbackProjectId?: string): ProjectDispatchPlan {
    const lower = prompt.toLowerCase();
    const matched = [...this.rules()].sort((a,b)=>(b.priority??0)-(a.priority??0)).filter((rule) => rule.keywords.some((keyword) => lower.includes(keyword.toLowerCase())));
    const targets = new Map<string, { projectId: string; roleId?: string; reason: string }>();
    for (const rule of matched) for (const projectId of rule.projectIds) if (!targets.has(projectId) && this.projects().some((project) => project.id === projectId)) targets.set(projectId, { projectId, roleId: rule.roleId, reason: "routing rule " + rule.id });
    if (targets.size === 0 && fallbackProjectId) targets.set(fallbackProjectId, { projectId: fallbackProjectId, reason: "active project fallback" });
    return { prompt, targets: [...targets.values()] };
  }
  async execute(plan: ProjectDispatchPlan): Promise<Array<{ projectId: string; content?: string; error?: string }>> {
    const results: Array<{ projectId: string; content?: string; error?: string }> = [];
    // Sequential project dispatch prevents the shared foreground runtime from switching projects concurrently.
    for (const target of plan.targets) {
      try { results.push({ projectId: target.projectId, content: await this.dispatch(target.projectId, plan.prompt, target.roleId) }); }
      catch (error) { results.push({ projectId: target.projectId, error: (error as Error).message }); }
    }
    return results;
  }
}