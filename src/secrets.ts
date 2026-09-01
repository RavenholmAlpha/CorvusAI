import { getStoredSecret, getStoredSecretSync } from "./secret-store.js";

export async function resolveSecretAsync(reference: string | undefined, fallback = ""): Promise<string> {
  if (!reference) return fallback;
  if (reference.startsWith("env:")) return process.env[reference.slice(4)] ?? fallback;
  if (reference.startsWith("store:")) return (await getStoredSecret(reference.slice(6))) ?? fallback;
  throw new Error("Unsupported secret reference: " + reference);
}

export function resolveSecret(reference: string | undefined, fallback = ""): string {
  if (!reference) return fallback;
  if (reference.startsWith("env:")) return process.env[reference.slice(4)] ?? fallback;
  if (reference.startsWith("store:")) { try { return getStoredSecretSync(reference.slice(6)) ?? fallback; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; } }
  throw new Error("Unsupported secret reference: " + reference);
}

export function mergePreservingSecrets<T>(current: T, update: unknown): T {
  if (!update || typeof update !== "object" || !current || typeof current !== "object") return update as T;
  const result: any = Array.isArray(current) ? [...current] : { ...(current as any) };
  for (const [key, value] of Object.entries(update as Record<string, unknown>)) {
    if (/apiKey|token|secret/i.test(key) && value === "***configured***") continue;
    result[key] = value && typeof value === "object" && result[key] && typeof result[key] === "object" ? mergePreservingSecrets(result[key], value) : value;
  }
  return result;
}

export function redactSecrets<T>(value: T): T {
  const clone = structuredClone(value) as any;
  const visit = (item: any) => {
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (/apiKey|token|secret/i.test(key) && typeof child === "string") item[key] = child ? "***configured***" : "";
      else visit(child);
    }
  };
  visit(clone);
  return clone;
}