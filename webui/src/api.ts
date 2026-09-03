import type { WebState } from "./types";

export function getWebToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("corvus-token") || localStorage.getItem("corvus-token") || "";
}

export function setWebToken(token: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("corvus-token", token);
  localStorage.setItem("corvus-token", token);
  webToken = token;
}

export function clearWebToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("corvus-token");
  localStorage.removeItem("corvus-token");
  webToken = "";
}

if (typeof window !== "undefined") {
  const queryToken = new URLSearchParams(window.location.search).get("token");
  if (queryToken) {
    setWebToken(queryToken);
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("token");
      window.history.replaceState(null, "", cleanUrl.toString());
    } catch {}
  }
}

export let webToken = getWebToken();

function secured(path: string): string {
  const token = getWebToken();
  const url = new URL(path, location.origin);
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.pathname + url.search;
}

export interface RuntimeCapabilities { serverVersion: string; bundle?: { bundle?: string; features?: string[] }; features: string[]; pages: Array<{ id: string; enabled: boolean; feature?: string }> }

export interface AuthStatus {
  initialized: boolean;
  authenticated: boolean;
  authRequired: boolean;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const token = getWebToken();
  const res = await fetch(`/api/auth/status${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
    headers: token ? { "x-corvus-token": token } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getState(): Promise<WebState> {
  return getJson<WebState>("/api/state");
}

export async function getRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  return getJson<RuntimeCapabilities>("/api/v1/runtime/capabilities");
}

export async function getJson<T>(path: string): Promise<T> {
  const token = getWebToken();
  const res = await fetch(secured(path), {
    headers: token ? { "x-corvus-token": token } : {},
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(secured(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(webToken ? { "x-corvus-token": webToken } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? JSON.stringify(data));
  }
  return data;
}

export async function deleteJson<T>(path: string): Promise<T> {
  const res = await fetch(secured(path), { method: "DELETE", headers: webToken ? { "x-corvus-token": webToken } : {} });
  const data = await res.json(); if (!res.ok) throw new Error(data.error ?? JSON.stringify(data)); return data;
}

export function eventUrl(path: string): string {
  return secured(path);
}
