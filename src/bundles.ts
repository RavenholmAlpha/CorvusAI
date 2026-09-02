import type { CorvusConfig } from "./config.js";

export type BundleId = "minimal" | "default" | "full" | "custom";
export type PermissionPreset = "safe" | "balanced" | "autonomous" | "custom";
export interface BundleDefinition { id: BundleId; label: string; description: string; features: string[]; pluginDefaults: string[]; }
export interface BundlePlan { from: BundleId; to: BundleId; enableFeatures: string[]; installPlugins: string[]; requiredCapabilities: string[]; preservesCustomPlugins: true; }

export const BUNDLES: Record<Exclude<BundleId, "custom">, BundleDefinition> = {
  minimal: { id: "minimal", label: "Minimal", description: "Durable core with local coding essentials.", features: ["durable-harness", "filesystem", "shell", "webui"], pluginDefaults: [] },
  default: { id: "default", label: "Default", description: "Recommended developer agent with memory, skills, delegation and MCP.", features: ["durable-harness", "filesystem", "shell", "git", "web", "memory", "skills", "delegation", "workspaces", "mcp-client", "mcp-importer", "webhook", "webui"], pluginDefaults: [] },
  full: { id: "full", label: "Full", description: "Default installation with every bundled integration, including inbound webhooks; high-risk capabilities still follow the permission policy.", features: ["durable-harness", "filesystem", "shell", "git", "web", "memory", "skills", "delegation", "workspaces", "mcp-client", "mcp-importer", "mcp-server", "scheduler", "browser", "channels", "webhook", "execution-nodes", "webui"], pluginDefaults: [] },
};

const FEATURE_CAPABILITIES: Record<string, string[]> = {
  filesystem: ["filesystem.read", "filesystem.write"], shell: ["process"], web: ["network"], "mcp-client": ["plugin", "process"], "mcp-server": ["network.listen"], scheduler: ["scheduler.execute"], browser: ["browser.control", "network"], channels: ["network", "messaging.send"], webhook: ["network", "agent.delegate"], "execution-nodes": ["process.remote"], delegation: ["agent.delegate"], memory: ["memory.read", "memory.write"],
};

export function featureEnabled(config: CorvusConfig, feature: string): boolean { return (config.installation?.features ?? BUNDLES.full.features).includes(feature); }

export function currentBundle(config: CorvusConfig): BundleId { return config.installation?.bundle ?? "full"; }
export function planBundle(config: CorvusConfig, target: Exclude<BundleId, "custom">): BundlePlan {
  const definition = BUNDLES[target]; const enabled = new Set(config.installation?.features ?? BUNDLES[currentBundle(config) === "custom" ? "full" : currentBundle(config) as Exclude<BundleId,"custom">].features);
  const enableFeatures = definition.features.filter((feature) => !enabled.has(feature));
  return { from: currentBundle(config), to: target, enableFeatures, installPlugins: definition.pluginDefaults.filter((id) => !config.plugins?.installed?.[id]), requiredCapabilities: [...new Set(enableFeatures.flatMap((feature) => FEATURE_CAPABILITIES[feature] ?? []))], preservesCustomPlugins: true };
}
export function applyBundle(config: CorvusConfig, target: Exclude<BundleId, "custom">): BundlePlan {
  const plan = planBundle(config, target); const definition = BUNDLES[target];
  config.installation = { ...(config.installation ?? {}), bundle: target, features: [...definition.features], permissionPreset: config.installation?.permissionPreset ?? "balanced", updatedAt: new Date().toISOString() };
  config.plugins = { installed: { ...(config.plugins?.installed ?? {}) }, enabled: { ...(config.plugins?.enabled ?? {}) }, grants: { ...(config.plugins?.grants ?? {}) }, configs: { ...(config.plugins?.configs ?? {}) } };
  for (const id of definition.pluginDefaults) { config.plugins.installed![id] ??= { version: "bundled", source: "bundle:" + target }; config.plugins.enabled![id] ??= true; }
  return plan;
}
export function applyPermissionPreset(config: CorvusConfig, preset: Exclude<PermissionPreset, "custom">): void {
  const rules = config.permissions.rules;
  if (preset === "safe") { for (const key of Object.keys(rules)) rules[key] = key.endsWith(".read") || key === "capability:local" ? "allow" : "ask"; }
  if (preset === "balanced") { for (const key of Object.keys(rules)) rules[key] = key.endsWith(".read") || key === "capability:local" ? "allow" : "ask"; }
  if (preset === "autonomous") { for (const key of Object.keys(rules)) rules[key] = "allow"; }
  config.installation = { ...(config.installation ?? { bundle: "full", features: [...BUNDLES.full.features] }), permissionPreset: preset, updatedAt: new Date().toISOString() };
}
