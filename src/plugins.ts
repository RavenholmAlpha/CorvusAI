import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CommandDefinition } from "./commands.js";
import type { RegisterableTool, ToolRegistry } from "./tools/index.js";
import { WorkerPluginClient } from "./plugin-worker.js";

export const CORVUS_PLUGIN_API_VERSION = 1;
export type PluginRuntime = "native" | "worker" | "mcp" | "declarative";
export type PluginStatus = "loaded" | "disabled" | "failed" | "incompatible";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  entry?: string;
  runtime: PluginRuntime;
  description?: string;
  capabilities: { required: string[]; optional: string[] };
  activation?: { lazy?: boolean; events?: string[] };
  contributes?: { tools?: string[]; commands?: string[]; configSchema?: string };
  sandbox?: { filesystem?: "plugin-only" | "workspace-read" | "unrestricted"; network?: "none" | "public" | "unrestricted"; subprocess?: boolean; memoryMb?: number };
}

export interface LoadedPlugin {
  id: string;
  name: string;
  version: string;
  runtime: PluginRuntime;
  status: PluginStatus;
  capabilities: string[];
  error?: string;
}

export interface PluginLogger { info(message: string, meta?: Record<string, unknown>): void; warn(message: string, meta?: Record<string, unknown>): void; error(message: string, meta?: Record<string, unknown>): void; }
export interface PluginStorage { get<T = unknown>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void>; }
export interface PluginApi {
  readonly manifest: PluginManifest;
  registerTool: (tool: RegisterableTool) => void;
  registerCommand?: (command: CommandDefinition) => void | (() => boolean);
  storage: PluginStorage;
  logger: PluginLogger;
  getConfig<T = unknown>(): T | undefined;
}
export interface PluginModule { default?: (api: PluginApi) => Promise<void | (() => void)> | void | (() => void); activate?: (api: PluginApi) => Promise<void | (() => void)> | void | (() => void); deactivate?: () => Promise<void> | void; }
export interface PluginLoadContext {
  tools: ToolRegistry;
  registerCommand?: (command: CommandDefinition) => void | (() => boolean);
  enabled?: Record<string, boolean>;
  grants?: Record<string, string[]>;
  configs?: Record<string, unknown>;
  stateRoot?: string;
  logger?: PluginLogger;
}

const noopLogger: PluginLogger = { info: () => {}, warn: () => {}, error: () => {} };

interface ActivePlugin { record: LoadedPlugin; disposers: Array<() => boolean>; teardown?: () => Promise<void> | void; }

/** Owns native plugin registrations and reverses them during shutdown/reload. */
export class PluginRuntimeManager {
  private active: ActivePlugin[] = [];
  constructor(private readonly root: string, private readonly context: PluginLoadContext) {}
  async startAll(): Promise<LoadedPlugin[]> {
    await this.stopAll();
    const resolvedRoot = resolve(this.root); let entries;
    try { entries = await readdir(resolvedRoot, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const records: LoadedPlugin[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const pluginDir = join(resolvedRoot, entry.name); let manifest: PluginManifest | undefined;
      try {
        manifest = await readPluginManifest(pluginDir);
        if (this.context.enabled?.[manifest.id] === false) { records.push(summary(manifest, "disabled")); continue; }
        if (manifest.apiVersion !== CORVUS_PLUGIN_API_VERSION) { records.push({ ...summary(manifest, "incompatible"), error: "Unsupported plugin API " + manifest.apiVersion }); continue; }
        const grants = new Set(this.context.grants?.[manifest.id] ?? []); const missing = manifest.capabilities.required.filter((capability) => !grants.has(capability));
        if (this.context.grants && Object.prototype.hasOwnProperty.call(this.context.grants, manifest.id) && missing.length) throw new Error("Missing capability grants: " + missing.join(", "));
        if (manifest.runtime === "declarative" || manifest.runtime === "mcp") { records.push(summary(manifest, "loaded")); continue; }
        if (!manifest.entry) throw new Error("Plugin runtime requires entry");
        if (manifest.runtime === "worker") {
          const worker = new WorkerPluginClient(resolvePluginEntry(pluginDir, manifest.entry), manifest, this.context.configs?.[manifest.id]);
          const workerTools = await worker.start(); const disposers: Array<() => boolean> = [];
          try { for (const tool of workerTools) disposers.push(this.context.tools.register(tool)); } catch (error) { for (const dispose of disposers.reverse()) dispose(); await worker.stop(); throw error; }
          const record=summary(manifest,"loaded");this.active.push({record,disposers,teardown:()=>worker.stop()});records.push(record);continue;
        }
        const module = await import(pathToFileURL(resolvePluginEntry(pluginDir, manifest.entry)).href + "?t=" + Date.now()) as PluginModule;
        const activate = module.default ?? module.activate; if (!activate) throw new Error("Plugin does not export activate/default");
        const stagedTools: RegisterableTool[] = []; const stagedCommands: CommandDefinition[] = [];
        const returned = await activate({ manifest, registerTool: (tool) => stagedTools.push(tool), registerCommand: this.context.registerCommand ? (command) => { stagedCommands.push(command); } : undefined, storage: createPluginStorage(this.context.stateRoot ?? join(resolvedRoot, ".state"), manifest.id), logger: this.context.logger ?? noopLogger, getConfig: <T = unknown>() => this.context.configs?.[manifest!.id] as T | undefined });
        const disposers: Array<() => boolean> = [];
        try { for (const tool of stagedTools) disposers.push(this.context.tools.register(tool)); if (this.context.registerCommand) for (const command of stagedCommands) { const dispose = this.context.registerCommand(command); if (typeof dispose === "function") disposers.push(dispose); } }
        catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error; }
        const record = summary(manifest, "loaded");
        const teardown = typeof returned === "function" ? async () => { await returned(); } : module.deactivate;
        this.active.push({ record, disposers, teardown }); records.push(record);
      } catch (error) { records.push({ id: manifest?.id ?? entry.name, name: manifest?.name ?? entry.name, version: manifest?.version ?? "unknown", runtime: manifest?.runtime ?? "native", status: "failed", capabilities: manifest?.capabilities.required ?? [], error: (error as Error).message }); }
    }
    return records;
  }
  async stopAll(): Promise<void> { for (const plugin of this.active.splice(0).reverse()) { try { await plugin.teardown?.(); } catch (error) { this.context.logger?.warn("Plugin teardown failed", { pluginId: plugin.record.id, error: (error as Error).message }); } finally { for (const dispose of plugin.disposers.reverse()) dispose(); } } }
  listActive(): LoadedPlugin[] { return this.active.map((item) => item.record); }
}


export async function loadPlugins(root: string, context: PluginLoadContext): Promise<LoadedPlugin[]> {
  const resolvedRoot = resolve(root);
  let entries;
  try { entries = await readdir(resolvedRoot, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const loaded: LoadedPlugin[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = join(resolvedRoot, entry.name);
    let manifest: PluginManifest | undefined;
    try {
      manifest = await readPluginManifest(pluginDir);
      if (context.enabled?.[manifest.id] === false) { loaded.push(summary(manifest, "disabled")); continue; }
      if (manifest.apiVersion !== CORVUS_PLUGIN_API_VERSION) { loaded.push({ ...summary(manifest, "incompatible"), error: `Unsupported plugin API ` + manifest.apiVersion }); continue; }
      const granted = new Set(context.grants?.[manifest.id] ?? []);
      const missing = manifest.capabilities.required.filter((capability) => !granted.has(capability));
      // Legacy manifests receive their declared tool capabilities at registration;
      // v1 manifests require explicit grants only when the grants map has an entry.
      if (context.grants && Object.prototype.hasOwnProperty.call(context.grants, manifest.id) && missing.length) throw new Error("Missing capability grants: " + missing.join(", "));
      if (manifest.runtime !== "native") { loaded.push(summary(manifest, "loaded")); continue; }
      if (!manifest.entry) throw new Error("Native plugin requires runtime.entry or entry");
      const entryPath = resolvePluginEntry(pluginDir, manifest.entry);
      const module = await import(`` + pathToFileURL(entryPath).href + `?t=` + Date.now()) as PluginModule;
      const activate = module.default ?? module.activate;
      if (!activate) throw new Error("Plugin does not export activate/default");
      const stagedTools: RegisterableTool[] = []; const stagedCommands: CommandDefinition[] = [];
      await activate({ manifest, registerTool: (tool) => stagedTools.push(tool), registerCommand: context.registerCommand ? (command) => { stagedCommands.push(command); } : undefined, storage: createPluginStorage(context.stateRoot ?? join(resolvedRoot, ".state"), manifest.id), logger: context.logger ?? noopLogger, getConfig: <T = unknown>() => context.configs?.[manifest!.id] as T | undefined });
      for (const tool of stagedTools) context.tools.register(tool);
      if (context.registerCommand) for (const command of stagedCommands) context.registerCommand(command);
      loaded.push(summary(manifest, "loaded"));
    } catch (error) { loaded.push({ id: manifest?.id ?? entry.name, name: manifest?.name ?? entry.name, version: manifest?.version ?? "unknown", runtime: manifest?.runtime ?? "native", status: "failed", capabilities: manifest?.capabilities.required ?? [], error: (error as Error).message }); }
  }
  return loaded;
}

function summary(manifest: PluginManifest, status: PluginStatus): LoadedPlugin { return { id: manifest.id, name: manifest.name, version: manifest.version, runtime: manifest.runtime, status, capabilities: manifest.capabilities.required }; }

export async function readPluginManifest(pluginDir: string): Promise<PluginManifest> {
  const raw = JSON.parse(await readFile(join(pluginDir, "corvus.plugin.json"), "utf8")) as Record<string, unknown>;
  const legacy = !raw.id && raw.name && raw.entry;
  const runtimeValue = typeof raw.runtime === "string" ? raw.runtime : (raw.runtime as Record<string, unknown> | undefined)?.type;
  const entry = typeof raw.entry === "string" ? raw.entry : typeof (raw.runtime as Record<string, unknown> | undefined)?.entry === "string" ? String((raw.runtime as Record<string, unknown>).entry) : undefined;
  const id = String(raw.id ?? raw.name ?? "").trim(); const name = String(raw.name ?? raw.id ?? "").trim(); const version = String(raw.version ?? "").trim();
  if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) throw new Error("Plugin manifest requires a valid id");
  if (!name || !version) throw new Error("Plugin manifest requires name and version");
  const runtime = String(runtimeValue ?? "native") as PluginRuntime;
  if (!["native", "worker", "mcp", "declarative"].includes(runtime)) throw new Error("Unsupported plugin runtime: " + runtime);
  const capabilitiesRaw = raw.capabilities as { required?: unknown; optional?: unknown } | string[] | undefined;
  const required = Array.isArray(capabilitiesRaw) ? capabilitiesRaw.map(String) : Array.isArray(capabilitiesRaw?.required) ? capabilitiesRaw.required.map(String) : [];
  const optional = !Array.isArray(capabilitiesRaw) && Array.isArray(capabilitiesRaw?.optional) ? capabilitiesRaw.optional.map(String) : [];
  const manifest: PluginManifest = { id, name, version, apiVersion: Number(raw.apiVersion ?? (legacy ? 1 : 0)), entry, runtime, description: typeof raw.description === "string" ? raw.description : undefined, capabilities: { required, optional }, activation: raw.activation as PluginManifest["activation"], contributes: raw.contributes as PluginManifest["contributes"], sandbox: raw.sandbox as PluginManifest["sandbox"] };
  if (entry) resolvePluginEntry(pluginDir, entry);
  return manifest;
}

export function resolvePluginEntry(pluginDir: string, entry: string): string {
  if (isAbsolute(entry)) throw new Error("Plugin entry must be relative");
  const root = resolve(pluginDir); const target = resolve(root, entry); const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Plugin entry escapes plugin directory");
  return target;
}

function createPluginStorage(root: string, pluginId: string): PluginStorage {
  const path = join(root, pluginId.replace(/[^a-zA-Z0-9._-]/g, "_") + ".json");
  const read = async (): Promise<Record<string, unknown>> => { try { return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; } };
  const save = async (value: Record<string, unknown>) => { await mkdir(root, { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8"); };
  return { get: async <T = unknown>(key: string): Promise<T | undefined> => (await read())[key] as T | undefined, set: async (key, value) => { const state = await read(); state[key] = value; await save(state); }, delete: async (key) => { const state = await read(); delete state[key]; await save(state); } };
}
