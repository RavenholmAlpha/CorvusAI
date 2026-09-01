import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillDefinition {
  id: string;
  title: string;
  name: string;
  description?: string;
  triggers: string[];
  toolsRequired: string[];
  instructions: string;
  source: string;
  isBuiltin?: boolean;
  tier?: "builtin" | "global" | "workspace";
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  tools_required?: string[];
}

function scalar(value: string): string {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}

function inlineList(value: string): string[] {
  const text = value.trim();
  if (!text.startsWith("[") || !text.endsWith("]")) return text ? [scalar(text)] : [];
  return text.slice(1, -1).split(",").map(scalar).filter(Boolean);
}

export function parseSkillMarkdown(markdown: string, fallbackId: string): { metadata: SkillFrontmatter; body: string } {
  const normalized = markdown.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) return { metadata: {}, body: markdown };
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { metadata: {}, body: markdown };
  const metadata: SkillFrontmatter = {};
  let listKey: "triggers" | "tools_required" | undefined;
  for (const raw of match[1].split(/\r?\n/)) {
    const item = raw.match(/^\s*-\s+(.+)$/);
    if (item && listKey) { (metadata[listKey] ??= []).push(scalar(item[1])); continue; }
    const field = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!field) continue;
    const key = field[1]; const value = field[2]; listKey = undefined;
    if (key === "name" || key === "description") metadata[key] = scalar(value);
    else if (key === "triggers" || key === "tools_required") { listKey = key; metadata[key] = inlineList(value); }
  }
  metadata.name ||= fallbackId;
  return { metadata, body: normalized.slice(match[0].length) };
}

async function loadDirectory(root: string, tier: SkillDefinition["tier"]): Promise<SkillDefinition[]> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const skills: SkillDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, "SKILL.md");
    try {
      const raw = await readFile(path, "utf8");
      const { metadata, body } = parseSkillMarkdown(raw, entry.name);
      const heading = body.split(/\r?\n/).find((line) => /^#\s+/.test(line));
      const name = metadata.name ?? entry.name;
      skills.push({ id: entry.name, name, title: heading?.replace(/^#\s+/, "") ?? name, description: metadata.description, triggers: metadata.triggers ?? [], toolsRequired: metadata.tools_required ?? [], instructions: body, source: path, tier });
    } catch {}
  }
  return skills;
}

export function getBuiltinSkillsRoot(): string {
  try {
    const fileDir = dirname(fileURLToPath(import.meta.url));
    const candidate1 = resolve(fileDir, "..", "builtin", "skills");
    if (existsSync(candidate1)) return candidate1;
    const candidate2 = resolve(fileDir, "builtin", "skills");
    if (existsSync(candidate2)) return candidate2;
  } catch {}
  return resolve(process.cwd(), "builtin", "skills");
}

export type ManagedSkillTier = "global" | "workspace";

function validateSkillId(id: string): string {
  const normalized = id.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) throw new Error("Skill id must contain only letters, numbers, underscores, and hyphens");
  return normalized;
}

export function managedSkillPath(id: string, tier: ManagedSkillTier, globalRoot: string, workspace = process.cwd()): string {
  const root = tier === "global" ? globalRoot : join(resolve(workspace), ".corvus", "skills");
  return join(root, validateSkillId(id), "SKILL.md");
}

export async function createManagedSkill(input: { id: string; content: string; tier: ManagedSkillTier; globalRoot: string; workspace?: string; overwrite?: boolean }): Promise<{ id: string; tier: ManagedSkillTier; path: string }> {
  const path = managedSkillPath(input.id, input.tier, input.globalRoot, input.workspace);
  if (!input.overwrite && existsSync(path)) throw new Error("Skill already exists: " + input.id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, input.content, "utf8");
  return { id: validateSkillId(input.id), tier: input.tier, path };
}

export async function deleteManagedSkill(input: { id: string; tier: ManagedSkillTier; globalRoot: string; workspace?: string }): Promise<{ id: string; tier: ManagedSkillTier; deleted: boolean }> {
  const path = managedSkillPath(input.id, input.tier, input.globalRoot, input.workspace);
  const deleted = existsSync(path);
  await rm(dirname(path), { recursive: true, force: true });
  return { id: validateSkillId(input.id), tier: input.tier, deleted };
}

export async function loadSkills(globalRoot: string, projectRoot?: string, builtinRoot?: string): Promise<Map<string, SkillDefinition>> {
  const builtinSkills = (await loadDirectory(builtinRoot ?? getBuiltinSkillsRoot(), "builtin")).map((skill) => ({ ...skill, isBuiltin: true }));
  const globalSkills = await loadDirectory(globalRoot, "global");
  const projectSkills = projectRoot ? await loadDirectory(join(projectRoot, ".corvus", "skills"), "workspace") : [];
  const map = new Map<string, SkillDefinition>();
  for (const s of builtinSkills) map.set(s.id, s);
  for (const s of globalSkills) map.set(s.id, s);
  for (const s of projectSkills) map.set(s.id, s);
  return map;
}

export function routeSkills(input: string, registry: Map<string, SkillDefinition>): SkillDefinition[] {
  const normalized = input.toLocaleLowerCase();
  return [...registry.values()].filter((skill) => skill.triggers.some((trigger) => normalized.includes(trigger.toLocaleLowerCase())));
}

export function renderSkillContext(skillIds: string[], registry: Map<string, SkillDefinition>): string {
  const selected = [...new Set(skillIds)].map((id) => registry.get(id)).filter((skill): skill is SkillDefinition => Boolean(skill));
  if (selected.length === 0) return "";
  return "\n\nActivated skills:\n" + selected.map((skill) => "## " + skill.title + " (" + skill.id + ")\n" + skill.instructions.slice(0, 6000)).join("\n\n");
}

function toolRequirementSatisfied(requirement: string, available: Set<string>): boolean {
  if (!requirement.includes("*")) return available.has(requirement);
  const pattern = new RegExp("^" + requirement.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  return [...available].some((name) => pattern.test(name));
}

export function selectRoutedSkills(input: string, registry: Map<string, SkillDefinition>, assigned: string[] = [], availableTools?: Iterable<string>): { selected: SkillDefinition[]; unavailable: Array<{ id: string; missingTools: string[] }> } {
  const ids = [...new Set([...assigned, ...routeSkills(input, registry).map((skill) => skill.id)])];
  const available = availableTools ? new Set(availableTools) : undefined; const selected: SkillDefinition[] = []; const unavailable: Array<{ id: string; missingTools: string[] }> = [];
  for (const id of ids) { const skill = registry.get(id); if (!skill) continue; const missing = available ? skill.toolsRequired.filter((requirement) => !toolRequirementSatisfied(requirement, available)) : []; if (missing.length) unavailable.push({ id, missingTools: missing }); else selected.push(skill); }
  return { selected, unavailable };
}

export function renderRoutedSkillContext(input: string, registry: Map<string, SkillDefinition>, assigned: string[] = [], availableTools?: Iterable<string>): string {
  const routed = selectRoutedSkills(input, registry, assigned, availableTools);
  const context = renderSkillContext(routed.selected.map((skill) => skill.id), registry);
  const warning = routed.unavailable.length ? "\n\nUnavailable skills (required tools missing):\n" + routed.unavailable.map((item) => "- " + item.id + ": " + item.missingTools.join(", ")).join("\n") : "";
  return context + warning;
}

export function getSkillsCatalogPrompt(registry: Map<string, SkillDefinition>): string {
  if (registry.size === 0) return "";
  const list = [...registry.values()].map((s) => `- ` + s.title + ` (ID: \`` + s.id + `\`)` + (s.description ? ` — ` + s.description : ``) + (s.isBuiltin ? ` [builtin]` : ``)).join("\n");
  return "\n\nAvailable system skills (activated automatically when triggers match):\n" + list;
}
