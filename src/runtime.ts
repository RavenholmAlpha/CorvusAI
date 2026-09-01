import type { CorvusConfig, ModelProfile, ProviderProfile } from "./config.js";
import type { ChatModel } from "./agent.js";
import { ProtocolChatClient, type ProviderConnection } from "./provider-client.js";
import { resolveSecret } from "./secrets.js";

function providerConnection(provider: ProviderProfile, model: string, fallbackKey: string, fallbackTemperature: number): ProviderConnection {
  return { endpoint: provider.endpoint, apiKey: resolveSecret(provider.apiKeyRef, provider.apiKey || fallbackKey), model, temperature: provider.temperature ?? fallbackTemperature, protocol: provider.protocol, timeoutMs: provider.timeoutMs, maxRetries: provider.maxRetries };
}
function connectionFromProfile(profile: ModelProfile, config?: CorvusConfig): ProviderConnection {
  const provider = profile.providerId && config ? config.providers?.[profile.providerId] : undefined;
  return provider ? providerConnection(provider, profile.model, profile.apiKey, profile.temperature ?? config?.temperature ?? 0.2) : { endpoint: profile.endpoint, apiKey: profile.apiKey, model: profile.model, temperature: profile.temperature, protocol: profile.protocol ?? "openai-chat" };
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
function mainConnections(config: CorvusConfig): ProviderConnection[] {
  const provider = config.mainProviderId ? config.providers?.[config.mainProviderId] : undefined;
  if (!provider) return [{ endpoint: config.endpoint, apiKey: config.apiKey, model: config.model, temperature: config.temperature, protocol: "openai-chat" }];
  const primary = providerConnection(provider, provider.defaultModel ?? provider.models[0] ?? config.model, config.apiKey, config.temperature);
  const fallback = (provider.fallbackProviderIds ?? []).map((id) => config.providers?.[id]).filter((item): item is ProviderProfile => Boolean(item)).map((item) => providerConnection(item, item.defaultModel ?? item.models[0] ?? config.model, config.apiKey, config.temperature));
  return [primary, ...fallback];
}

/** Reads config at request time so TUI changes apply on the next model call. */
export function createConfigBackedChatModel(config: CorvusConfig, fetchImpl?: typeof fetch): ChatModel {
  return { createChatCompletion: (request) => modelWithFallback(mainConnections(config), fetchImpl).createChatCompletion(request) };
}

/** Build a specialist child model; accepts legacy (profile, fetch) and new (profile, config, fetch) signatures. */
export function createProfileBackedChatModel(profile: ModelProfile, configOrFetch?: CorvusConfig | typeof fetch, fetchImpl?: typeof fetch): ChatModel {
  const config = typeof configOrFetch === "function" ? undefined : configOrFetch;
  const actualFetch = typeof configOrFetch === "function" ? configOrFetch : fetchImpl;
  const primary = connectionFromProfile(profile, config);
  const provider = profile.providerId && config ? config.providers?.[profile.providerId] : undefined;
  const fallbacks = provider && config ? (provider.fallbackProviderIds ?? []).map((id) => config.providers?.[id]).filter((item): item is ProviderProfile => Boolean(item)).map((item) => providerConnection(item, item.defaultModel ?? item.models[0] ?? profile.model, config.apiKey, profile.temperature ?? config.temperature)) : [];
  return modelWithFallback([primary, ...fallbacks], actualFetch);
}

export function resolveProviderModel(config: CorvusConfig, providerId: string): ProviderProfile | undefined { return config.providers?.[providerId]; }
