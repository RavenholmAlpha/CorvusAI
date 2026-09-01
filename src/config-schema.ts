import type { CorvusConfig, ProviderProtocol } from "./config.js";

export interface ConfigDiagnostic { level: "error" | "warning"; path: string; message: string; }
export const CONFIG_SCHEMA_VERSION = 2;
const PROTOCOLS = new Set<ProviderProtocol>(["openai-chat", "openai-responses", "anthropic-messages"]);

export function migrateConfig(input: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...input };
  const version = typeof migrated.schemaVersion === "number" ? migrated.schemaVersion : 1;
  if (version < 2) {
    migrated.schemaVersion = 2;
    // Existing endpoint/model/apiKey remain a supported legacy main provider.
    if (!migrated.providers) migrated.providers = {};
    if (!migrated.agentRoles) migrated.agentRoles = {};
  }
  return migrated;
}

export function validateConfig(config: CorvusConfig): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = [];
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) diagnostics.push({ level: "error", path: "schemaVersion", message: "Expected schema version " + CONFIG_SCHEMA_VERSION });
  if (!config.model) diagnostics.push({ level: "error", path: "model", message: "Legacy/default model is required" });
  if (!/^https?:\/\//.test(config.endpoint)) diagnostics.push({ level: "error", path: "endpoint", message: "Endpoint must be HTTP(S)" });
  if (config.contextWindowTokens < 8000) diagnostics.push({ level: "error", path: "contextWindowTokens", message: "Context window must be at least 8000" });
  for (const [id, provider] of Object.entries(config.providers ?? {})) {
    if (provider.id !== id) diagnostics.push({ level: "warning", path: "providers." + id + ".id", message: "Provider ID normalized to map key" });
    if (!PROTOCOLS.has(provider.protocol)) diagnostics.push({ level: "error", path: "providers." + id + ".protocol", message: "Unsupported provider protocol" });
    if (!/^https?:\/\//.test(provider.endpoint)) diagnostics.push({ level: "error", path: "providers." + id + ".endpoint", message: "Endpoint must be HTTP(S)" });
    if (!provider.defaultModel && provider.models.length === 0) diagnostics.push({ level: "error", path: "providers." + id + ".models", message: "At least one model is required" });
    if (!provider.apiKey) diagnostics.push({ level: "warning", path: "providers." + id + ".apiKey", message: "No provider API key; legacy key fallback may be used" });
  }
  for (const [id, server] of Object.entries(config.mcpServers ?? {})) {
    if (!server.command && !server.url) diagnostics.push({ level: "error", path: "mcpServers." + id, message: "MCP server requires command or URL" });
    if (server.url && !/^https?:\/\//.test(server.url)) diagnostics.push({ level: "error", path: "mcpServers." + id + ".url", message: "MCP URL must be HTTP(S)" });
    if (server.command && server.url) diagnostics.push({ level: "error", path: "mcpServers." + id, message: "Choose either stdio command or HTTP URL" });
  }
  for (const [id, enabled] of Object.entries(config.plugins?.enabled ?? {})) if (typeof enabled !== "boolean") diagnostics.push({ level: "error", path: "plugins.enabled." + id, message: "Plugin enabled state must be boolean" });
  for (const [id, grants] of Object.entries(config.plugins?.grants ?? {})) if (!Array.isArray(grants) || grants.some((item) => typeof item !== "string")) diagnostics.push({ level: "error", path: "plugins.grants." + id, message: "Plugin grants must be strings" });
  if (config.mainProviderId && !config.providers?.[config.mainProviderId]) diagnostics.push({ level: "error", path: "mainProviderId", message: "Main provider does not exist" });
  for (const [id, channel] of Object.entries(config.channels ?? {})) {
    if (!["webhook", "telegram", "slack", "discord"].includes(channel.type)) diagnostics.push({ level: "error", path: "channels." + id + ".type", message: "Unsupported channel type" });
    if (["telegram", "slack"].includes(channel.type) && (!channel.credentialRef || !channel.targetId)) diagnostics.push({ level: "error", path: "channels." + id, message: "Channel requires credentialRef and targetId" });
    if (channel.type === "discord" && !channel.outboundUrl) diagnostics.push({ level: "error", path: "channels." + id + ".outboundUrl", message: "Discord requires a webhook URL" });
    if (!channel.projectId && !channel.useOrchestrator) diagnostics.push({ level: "error", path: "channels." + id + ".projectId", message: "Webhook channel requires a project or orchestrator" });
    if (channel.roleId && !config.agentRoles?.[channel.roleId]) diagnostics.push({ level: "error", path: "channels." + id + ".roleId", message: "Channel references an unknown role" });
  }
  for (const [id, automation] of Object.entries(config.automations ?? {})) {
    if (!automation.projectId) diagnostics.push({ level: "error", path: "automations." + id + ".projectId", message: "Automation project is required" });
    if (automation.roleId && !config.agentRoles?.[automation.roleId]) diagnostics.push({ level: "error", path: "automations." + id + ".roleId", message: "Automation references an unknown role" });
    if (automation.trigger.type === "interval" && automation.trigger.everySeconds < 10) diagnostics.push({ level: "error", path: "automations." + id + ".trigger.everySeconds", message: "Minimum interval is 10 seconds" });
    if (automation.trigger.type === "once" && !Number.isFinite(Date.parse(automation.trigger.at))) diagnostics.push({ level: "error", path: "automations." + id + ".trigger.at", message: "Once schedule requires an ISO date" });
  }
  for (const [id, role] of Object.entries(config.agentRoles ?? {})) {
    if (!config.providers?.[role.providerId]) diagnostics.push({ level: "error", path: "agentRoles." + id + ".providerId", message: "Role references an unknown provider" });
    if (role.maxConcurrent !== undefined && role.maxConcurrent < 1) diagnostics.push({ level: "error", path: "agentRoles." + id + ".maxConcurrent", message: "maxConcurrent must be at least 1" });
  }
  return diagnostics;
}