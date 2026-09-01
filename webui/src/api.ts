import type { WebState } from "./types";

const queryToken = new URLSearchParams(location.search).get("token");
if (queryToken) {
  sessionStorage.setItem("corvus-token", queryToken);
}

export const webToken = sessionStorage.getItem("corvus-token") ?? "";

function secured(path: string): string {
  const url = new URL(path, location.origin);
  if (webToken) {
    url.searchParams.set("token", webToken);
  }
  return url.pathname + url.search;
}

export interface RuntimeCapabilities { serverVersion: string; bundle?: { bundle?: string; features?: string[] }; features: string[]; pages: Array<{ id: string; enabled: boolean; feature?: string }> }

export async function getState(): Promise<WebState> {
  return getJson<WebState>("/api/state");
}

export async function getRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  return getJson<RuntimeCapabilities>("/api/v1/runtime/capabilities");
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(secured(path), {
    headers: webToken ? { "x-corvus-token": webToken } : {},
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
