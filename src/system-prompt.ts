import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getConfigRoot, type CorvusConfig } from "./config.js";

/**
 * Build the full system prompt: base persona + workspace rules + skills + goal + review mode.
 * Shared by the direct agent path and the durable harness runner so both paths
 * present identical instructions to the model.
 */
export function buildSystemPrompt(config: CorvusConfig): string {
  const lines = [config.systemPrompt];

  // Workspace rules (.corvusrules) and local skills (.corvus/rules/*.md).
  try {
    const cwd = process.cwd();
    const rootRulePath = join(cwd, ".corvusrules");
    if (existsSync(rootRulePath)) {
      lines.push(`Local Guidelines (.corvusrules):\n${readFileSync(rootRulePath, "utf8")}`);
    }

    const rulesDir = join(getConfigRoot(), "rules");
    if (existsSync(rulesDir)) {
      const files = readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        lines.push(`Local Skill (${file}):\n${readFileSync(join(rulesDir, file), "utf8")}`);
      }
    }
  } catch {
    // Ignore file system errors when loading rules.
  }

  const roles = Object.values(config.agentRoles ?? {});
  if (roles.length) {
    lines.push("Configured agent roles (use these proactively when their specialty matches):\n" + roles.map((role) => "- " + role.id + (role.label ? " (" + role.label + ")" : "") + ": provider=" + role.providerId + (role.model ? ", model=" + role.model : "") + (role.systemPrompt ? "; specialty=" + role.systemPrompt.slice(0, 240) : "")).join("\n") + "\nUsage: pass role: <id> to task or parallel_tasks; pass role: <id> to dispatch_project_task for project work. Use manage_role to list, create, update, or delete roles when the user asks.");
  }
  if (config.goal) {
    lines.push(`Active goal: ${config.goal}`);
  }
  if (config.review.enabled) {
    lines.push(`Review mode instruction: ${config.review.instruction}`);
  }
  return lines.join("\n\n");
}