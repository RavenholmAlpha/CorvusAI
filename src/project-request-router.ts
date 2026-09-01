export interface RoutableProject { id: string; name: string; path: string; }
export type ProjectRouteDecision = { kind: "master" } | { kind: "project"; project: RoutableProject } | { kind: "clarify"; candidates: RoutableProject[] };
const PROJECT_INTENT = /(?:分析|审查|检查|修改|实现|测试|修复|代码|项目|仓库|代码库|analy[sz]e|review|inspect|modify|implement|test|fix|code|project|repository|repo)/i;
export function routeProjectRequest(prompt: string, projects: RoutableProject[]): ProjectRouteDecision {
  if (!PROJECT_INTENT.test(prompt)) return { kind: "master" };
  const normalized = prompt.normalize("NFKC").toLowerCase();
  const candidates = projects.filter((project) => [project.id, project.name, project.path.split(/[\\/]/).filter(Boolean).pop() ?? ""].some((value) => value && normalized.includes(value.normalize("NFKC").toLowerCase())));
  if (candidates.length === 1) return { kind: "project", project: candidates[0] };
  if (candidates.length > 1) return { kind: "clarify", candidates };
  return { kind: "master" };
}
