import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createManagedSkill, deleteManagedSkill, getSkillsCatalogPrompt, loadSkills, parseSkillMarkdown, renderRoutedSkillContext, renderSkillContext, routeSkills, selectRoutedSkills } from "../src/skills.js";

describe("skills registry", () => {
  it("loads builtin, global and project skills with 3-tier override", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-skills-"));
    try {
      const builtin = join(root, "builtin");
      const global = join(root, "global");
      const project = join(root, "project");

      await mkdir(join(builtin, "mcp-manager"), { recursive: true });
      await mkdir(join(global, "testing"), { recursive: true });
      await mkdir(join(project, ".corvus", "skills", "testing"), { recursive: true });

      await writeFile(join(builtin, "mcp-manager", "SKILL.md"), "# MCP Manager\nBuiltin MCP instructions");
      await writeFile(join(global, "testing", "SKILL.md"), "# Testing\nGlobal instructions");
      await writeFile(join(project, ".corvus", "skills", "testing", "SKILL.md"), "# Project Testing\nProject instructions");

      const skills = await loadSkills(global, project, builtin);
      expect(skills.get("mcp-manager")?.title).toBe("MCP Manager");
      expect(skills.get("mcp-manager")?.isBuiltin).toBe(true);
      expect(skills.get("testing")?.title).toBe("Project Testing");

      expect(renderSkillContext(["testing"], skills)).toContain("Project instructions");
      const catalog = getSkillsCatalogPrompt(skills);
      expect(catalog).toContain("MCP Manager");
      expect(catalog).toContain("Project Testing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates and deletes managed global and workspace skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-managed-skills-"));
    try {
      const globalRoot = join(root, "global"); const workspace = join(root, "workspace");
      await createManagedSkill({ id: "reviewer", content: "# Reviewer\nCheck changes.", tier: "global", globalRoot, workspace });
      await createManagedSkill({ id: "local-reviewer", content: "# Local Reviewer\nCheck local changes.", tier: "workspace", globalRoot, workspace });
      const catalog = await loadSkills(globalRoot, workspace, join(root, "builtin"));
      expect(catalog.get("reviewer")?.tier).toBe("global"); expect(catalog.get("local-reviewer")?.tier).toBe("workspace");
      expect((await deleteManagedSkill({ id: "reviewer", tier: "global", globalRoot, workspace })).deleted).toBe(true);
      expect((await loadSkills(globalRoot, workspace, join(root, "builtin"))).has("reviewer")).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("loads the built-in MCP manager without requiring MCP tools", async () => {
    const skills = await loadSkills(join(tmpdir(), "corvus-empty-global-skills"));
    const manager = skills.get("mcp-manager");
    expect(manager?.toolsRequired).toEqual(["write_file"]);
    expect(selectRoutedSkills("帮我配置 MCP server", skills, [], ["write_file"]).selected.map((skill) => skill.id)).toContain("mcp-manager");
  });

  it("parses YAML frontmatter and activates matching triggers on demand", async () => {
    const parsed = parseSkillMarkdown(`---\nname: github-pr-review\ndescription: Review pull requests\ntriggers:\n  - review pr\n  - 审查 pr\ntools_required: [mcp_github_*, git_status]\n---\n# PR Review\nFollow the review checklist.`, "fallback");
    expect(parsed.metadata).toEqual({ name: "github-pr-review", description: "Review pull requests", triggers: ["review pr", "审查 pr"], tools_required: ["mcp_github_*", "git_status"] });
    expect(parsed.body).not.toContain("tools_required");

    const root = await mkdtemp(join(tmpdir(), "corvus-frontmatter-"));
    try {
      await mkdir(join(root, "global", "github-pr-review"), { recursive: true });
      await writeFile(join(root, "global", "github-pr-review", "SKILL.md"), `---\nname: github-pr-review\ndescription: Review pull requests\ntriggers: [review pr, 审查 pr]\ntools_required: [git_status]\n---\n# PR Review\nFollow checklist.`);
      const skills = await loadSkills(join(root, "global"), undefined, join(root, "builtin"));
      expect(routeSkills("Please REVIEW PR 42", skills).map((skill) => skill.id)).toEqual(["github-pr-review"]);
      expect(renderRoutedSkillContext("请审查 pr 42", skills)).toContain("Follow checklist");
      expect(skills.get("github-pr-review")?.description).toBe("Review pull requests");
      expect(selectRoutedSkills("review pr", skills, [], ["read_file"]).unavailable).toEqual([{ id: "github-pr-review", missingTools: ["git_status"] }]);
      expect(selectRoutedSkills("review pr", skills, [], ["git_status"]).selected[0]?.id).toBe("github-pr-review");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
