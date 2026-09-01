import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CorvusConfig } from "./config.js";
import { readPluginManifest, type PluginManifest } from "./plugins.js";

export interface ManagedPlugin { id: string; manifest?: PluginManifest; path?: string; installed: boolean; enabled: boolean; configured: boolean; grantedCapabilities: string[]; missingCapabilities: string[]; health: "ready" | "disabled" | "needs-permission" | "invalid"; error?: string; source?: string; }

export class PluginManagementService {
  constructor(private readonly root: string, private readonly config: CorvusConfig, private readonly persist: () => Promise<void>) {}

  async list(): Promise<ManagedPlugin[]> {
    await mkdir(this.root, { recursive: true });
    const discovered = new Map<string, ManagedPlugin>();
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const path = join(this.root, entry.name);
      try {
        const manifest = await readPluginManifest(path); const grants = this.config.plugins?.grants?.[manifest.id] ?? []; const missing = manifest.capabilities.required.filter((item) => !grants.includes(item));
        discovered.set(manifest.id, { id: manifest.id, manifest, path, installed: true, enabled: this.config.plugins?.enabled?.[manifest.id] !== false, configured: this.config.plugins?.configs?.[manifest.id] !== undefined, grantedCapabilities: grants, missingCapabilities: missing, health: this.config.plugins?.enabled?.[manifest.id] === false ? "disabled" : missing.length ? "needs-permission" : "ready", source: this.config.plugins?.installed?.[manifest.id]?.source ?? "local" });
      } catch (error) { discovered.set(entry.name, { id: entry.name, path, installed: true, enabled: false, configured: false, grantedCapabilities: [], missingCapabilities: [], health: "invalid", error: (error as Error).message }); }
    }
    for (const [id, record] of Object.entries(this.config.plugins?.installed ?? {})) if (!discovered.has(id)) discovered.set(id, { id, installed: true, enabled: this.config.plugins?.enabled?.[id] !== false, configured: this.config.plugins?.configs?.[id] !== undefined, grantedCapabilities: this.config.plugins?.grants?.[id] ?? [], missingCapabilities: [], health: "invalid", error: "Plugin files are missing", source: record.source });
    return [...discovered.values()].sort((a,b)=>a.id.localeCompare(b.id));
  }

  async installFromDirectory(source: string): Promise<ManagedPlugin> {
    const sourcePath = resolve(source); const manifest = await readPluginManifest(sourcePath); const target = join(this.root, manifest.id);
    await mkdir(this.root, { recursive: true }); await cp(sourcePath, target, { recursive: true, force: false, errorOnExist: true });
    this.ensureConfig(); this.config.plugins!.installed![manifest.id] = { version: manifest.version, source: "file:" + sourcePath }; this.config.plugins!.enabled![manifest.id] = false; await this.persist();
    return (await this.list()).find((item)=>item.id===manifest.id)!;
  }

  async enable(id: string): Promise<void> { await this.requireInstalled(id); this.ensureConfig(); this.config.plugins!.enabled![id] = true; await this.persist(); }
  async disable(id: string): Promise<void> { this.ensureConfig(); this.config.plugins!.enabled![id] = false; await this.persist(); }
  async grant(id: string, capabilities: string[]): Promise<void> { const plugin=await this.requireInstalled(id); const allowed=new Set([...(plugin.manifest?.capabilities.required??[]),...(plugin.manifest?.capabilities.optional??[])]); for(const capability of capabilities) if(!allowed.has(capability)) throw new Error("Plugin does not declare capability: "+capability); this.ensureConfig(); this.config.plugins!.grants![id]=[...new Set([...(this.config.plugins!.grants![id]??[]),...capabilities])].sort(); await this.persist(); }
  async revoke(id: string, capabilities: string[]): Promise<void> { this.ensureConfig(); const remove=new Set(capabilities); this.config.plugins!.grants![id]=(this.config.plugins!.grants![id]??[]).filter((item)=>!remove.has(item)); await this.persist(); }
  async configure(id: string, value: unknown): Promise<void> { await this.requireInstalled(id); this.ensureConfig(); this.config.plugins!.configs![id]=value; await this.persist(); }
  async remove(id: string): Promise<void> { const plugin=(await this.list()).find((item)=>item.id===id); if(plugin?.path) await rm(plugin.path,{recursive:true,force:true}); this.ensureConfig(); delete this.config.plugins!.installed![id]; delete this.config.plugins!.enabled![id]; delete this.config.plugins!.grants![id]; delete this.config.plugins!.configs![id]; await this.persist(); }

  private ensureConfig(): void { this.config.plugins ??= {}; this.config.plugins.installed ??= {}; this.config.plugins.enabled ??= {}; this.config.plugins.grants ??= {}; this.config.plugins.configs ??= {}; }
  private async requireInstalled(id:string):Promise<ManagedPlugin>{const plugin=(await this.list()).find((item)=>item.id===id);if(!plugin?.installed)throw new Error("Plugin not installed: "+id);return plugin;}
}
