import type { CorvusConfig, ModelProfile, ProviderProfile } from "./config.js";
import type { ChatModel } from "./agent.js";
import { buildCompactionPrompt, buildSummaryMessage, estimateTokens } from "./context.js";
import type { ChatCompletionRequest } from "./openai-client.js";
import { ProtocolChatClient, type ProviderConnection } from "./provider-client.js";
import { resolveSecret } from "./secrets.js";
import type { ChatMessage } from "./types.js";

export interface ResolvedModelSettings {
  contextWindowTokens: number;
  maxOutputTokens?: number;
  temperature: number;
}

/** Resolve one model's effective limits and sampling settings. */
export function resolveModelSettings(config: CorvusConfig, provider: ProviderProfile | undefined, model: string): ResolvedModelSettings {
  const settings = provider?.modelSettings?.[model];
  return {
    contextWindowTokens: settings?.contextWindowTokens ?? config.contextWindowTokens,
    maxOutputTokens: settings?.maxOutputTokens,
    temperature: settings?.temperature ?? provider?.temperature ?? config.temperature,
  };
}

/** Resolve the currently selected main provider, model, and effective settings. */
export function resolveMainModel(config: CorvusConfig): { provider?: ProviderProfile; model: string; settings: ResolvedModelSettings } {
  const provider = config.mainProviderId ? config.providers?.[config.mainProviderId] : undefined;
  const model = provider?.defaultModel ?? provider?.models[0] ?? config.model;
  return { provider, model, settings: resolveModelSettings(config, provider, model) };
}

function providerConnection(config: CorvusConfig, provider: ProviderProfile, model: string, fallbackKey: string, temperatureOverride?: number): ProviderConnection {
  const settings = resolveModelSettings(config, provider, model);
  return { endpoint: provider.endpoint, apiKey: resolveSecret(provider.apiKeyRef, provider.apiKey || fallbackKey), model, temperature: temperatureOverride ?? settings.temperature, maxOutputTokens: settings.maxOutputTokens, contextWindowTokens: settings.contextWindowTokens, protocol: provider.protocol, timeoutMs: provider.timeoutMs, maxRetries: provider.maxRetries };
}

function connectionFromProfile(profile: ModelProfile, config?: CorvusConfig): ProviderConnection {
  const provider = profile.providerId && config ? config.providers?.[profile.providerId] : undefined;
  return provider && config ? providerConnection(config, provider, profile.model, profile.apiKey, profile.temperature) : { endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, temperature: profile.temperature, protocol: profile.protocol ?? "openai-chat", contextWindowTokens: config?.contextWindowTokens };
}

function mainConnections(config: CorvusConfig): ProviderConnection[] {
  const resolved = resolveMainModel(config);
  if (!resolved.provider) return [{ endpoint: config.endpoint, apiKey: config.apiKey, model: config.model, temperature: config.temperature, protocol: "openai-chat", contextWindowTokens: config.contextWindowTokens }];
  const primary = providerConnection(config, resolved.provider, resolved.model, config.apiKey);
  const fallback = (resolved.provider.fallbackProviderIds ?? []).map((id) => config.providers?.[id]).filter((item): item is ProviderProfile => Boolean(item)).map((item) => providerConnection(config, item, item.defaultModel ?? item.models[0] ?? config.model, config.apiKey));
  return [primary, ...fallback];
}

function requestBudget(connection: ProviderConnection): number {
  return Math.max(1, (connection.contextWindowTokens ?? Number.MAX_SAFE_INTEGER) - (connection.maxOutputTokens ?? 0));
}

/** Keep the system prompt and newest complete messages that fit the target model. */
export function slidingWindowMessages(messages: ChatMessage[], tokenBudget: number): ChatMessage[] {
  if (estimateTokens(messages) <= tokenBudget) return messages;
  const system = messages.filter((message) => message.role === "system");
  const result: ChatMessage[] = [...system];
  let used = estimateTokens(result);
  const nonSystem = messages.filter((message) => message.role !== "system");
  const recent: ChatMessage[] = [];
  for (let index = nonSystem.length - 1; index >= 0; index -= 1) {
    const message = nonSystem[index];
    const cost = estimateTokens([message]);
    if (recent.length > 0 && used + cost > tokenBudget) break;
    recent.unshift(message);
    used += cost;
  }
  return [...result, ...recent];
}

async function compactForSwitch(request: ChatCompletionRequest, previous: ProviderConnection, next: ProviderConnection, fetchImpl?: typeof fetch): Promise<ChatCompletionRequest> {
  const budget = requestBudget(next);
  if (estimateTokens(request.messages) <= budget) return request;
  const windowed = slidingWindowMessages(request.messages, Math.max(1, Math.floor(budget * 0.55)));
  const retained = new Set(windowed);
  const old = request.messages.filter((message) => !retained.has(message) && message.role !== "system");
  if (old.length === 0 || !previous.apiKey) return { ...request, messages: slidingWindowMessages(request.messages, budget) };
  try {
    const response = await new ProtocolChatClient({ ...previous, maxRetries: 0 }, fetchImpl).createChatCompletion({ messages: [{ role: "system", content: "You compact conversation context for a model switch. Preserve decisions, actions, files, and unresolved work." }, { role: "user", content: buildCompactionPrompt(old) }], tools: [], tool_choice: "none" });
    const summary = response.choices[0]?.message.content;
    if (!summary) throw new Error("Old model returned no compaction summary");
    const system = windowed.filter((message) => message.role === "system");
    const recent = windowed.filter((message) => message.role !== "system");
    return { ...request, messages: slidingWindowMessages([...system, buildSummaryMessage(summary, old.length), ...recent], budget) };
  } catch {
    return { ...request, messages: slidingWindowMessages(request.messages, budget) };
  }
}

function modelWithFallback(connections: ProviderConnection[], fetchImpl?: typeof fetch): ChatModel {
  return { createChatCompletion: async (request) => {
    let lastError: unknown;
    for (const connection of connections) {
      try { return await new ProtocolChatClient(connection, fetchImpl).createChatCompletion(request); }
      catch (error) { if (request.signal?.aborted) throw error; lastError = error; }
    }
    throw lastError ?? new Error("No provider connection available");
  } };
}

/** Reads config at request time so TUI changes apply on the next model call. */
export function createConfigBackedChatModel(config: CorvusConfig, fetchImpl?: typeof fetch): ChatModel {
  let previousPrimary: ProviderConnection | undefined;
  return { createChatCompletion: async (request) => {
    const connections = mainConnections(config);
    const primary = connections[0];
    if (!primary) throw new Error("No provider connection available");
    let effective = request;
    const switched = previousPrimary && (previousPrimary.model !== primary.model || previousPrimary.endpoint !== primary.endpoint);
    if (switched && estimateTokens(request.messages) > requestBudget(primary)) {
      effective = config.contextOverflowMode === "sliding-window"
        ? { ...request, messages: slidingWindowMessages(request.messages, requestBudget(primary)) }
        : await compactForSwitch(request, previousPrimary!, primary!, fetchImpl);
    }
    previousPrimary = primary;
    return modelWithFallback(connections, fetchImpl).createChatCompletion(effective);
  } };
}

/** Build a specialist child model; accepts legacy (profile, fetch) and new (profile, config, fetch) signatures. */
export function createProfileBackedChatModel(profile: ModelProfile, configOrFetch?: CorvusConfig | typeof fetch, fetchImpl?: typeof fetch): ChatModel {
  const config = typeof configOrFetch === "function" ? undefined : configOrFetch;
  const actualFetch = typeof configOrFetch === "function" ? configOrFetch : fetchImpl;
  const primary = connectionFromProfile(profile, config);
  const provider = profile.providerId && config ? config.providers?.[profile.providerId] : undefined;
  const fallbacks = provider && config ? (provider.fallbackProviderIds ?? []).map((id) => config.providers?.[id]).filter((item): item is ProviderProfile => Boolean(item)).map((item) => providerConnection(config, item, item.defaultModel ?? item.models[0] ?? profile.model, config.apiKey, profile.temperature)) : [];
  return modelWithFallback([primary, ...fallbacks], actualFetch);
}

export function resolveProviderModel(config: CorvusConfig, providerId: string): ProviderProfile | undefined { return config.providers?.[providerId]; }

/** Build an isolated model client for one persisted conversation selection. */
export function createSessionChatModel(config: CorvusConfig, providerId: string, model: string, fetchImpl?: typeof fetch): ChatModel {
  const provider = config.providers?.[providerId];
  if (!provider) throw new Error(`Provider not found: ${providerId}`);
  if (!provider.models.includes(model) && !provider.modelSettings?.[model]) throw new Error(`Model ${model} is not configured for provider ${providerId}`);
  const primary = providerConnection(config, provider, model, config.apiKey, provider.modelSettings?.[model]?.temperature ?? config.temperature);
  return modelWithFallback([primary], fetchImpl);
}
