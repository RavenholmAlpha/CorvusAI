import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import type { CommandDefinition } from "./commands.js";
import type { RegisterableTool, ToolRegistry } from "./tools/index.js";

export interface PluginManifest {
  name: string;
  version: string;
  entry: string;
}

export interface LoadedPlugin {
  name: string;
  version: string;
  status: "loaded" | "failed";
  error?: string;
}

export interface PluginApi {
  registerTool: (tool: RegisterableTool) => void;
  registerCommand?: (command: CommandDefinition) => void;
}

export interface PluginLoadContext {
  tools: ToolRegistry;
  registerCommand?: (command: CommandDefinition) => void;
}

interface DirectoryEntry {
  name: string;
  isDirectory: () => boolean;
}

export async function loadPlugins(root: string, context: PluginLoadContext): Promise<LoadedPlugin[]> {
  const resolvedRoot = resolve(root);
  let entries: DirectoryEntry[];

  try {
    entries = await readdir(resolvedRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const loaded: LoadedPlugin[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const pluginDir = join(resolvedRoot, entry.name);
    let manifest: PluginManifest | undefined;
    try {
      manifest = await readManifest(pluginDir);
      const entryUrl = pathToFileURL(join(pluginDir, manifest.entry)).href;
      const module = (await import(`${entryUrl}?t=${Date.now()}`)) as {
        default?: (api: PluginApi) => Promise<void> | void;
        activate?: (api: PluginApi) => Promise<void> | void;
      };
      const activate = module.default ?? module.activate;
      if (!activate) {
        throw new Error("Plugin does not export a default activate function");
      }
      const stagedTools: RegisterableTool[] = [];
      const stagedCommands: CommandDefinition[] = [];
      await activate({
        registerTool: (tool) => stagedTools.push(tool),
        registerCommand: context.registerCommand ? (command) => stagedCommands.push(command) : undefined,
      });
      for (const tool of stagedTools) {
        context.tools.register(tool);
      }
      if (context.registerCommand) {
        for (const command of stagedCommands) {
          context.registerCommand(command);
        }
      }
      loaded.push({ name: manifest.name, version: manifest.version, status: "loaded" });
    } catch (error) {
      loaded.push({
        name: manifest?.name ?? entry.name,
        version: manifest?.version ?? "unknown",
        status: "failed",
        error: (error as Error).message,
      });
    }
  }

  return loaded;
}

async function readManifest(pluginDir: string): Promise<PluginManifest> {
  const raw = await readFile(join(pluginDir, "corvus.plugin.json"), "utf8");
  const manifest = JSON.parse(raw) as Partial<PluginManifest>;
  if (!manifest.name || !manifest.version || !manifest.entry) {
    throw new Error("Plugin manifest requires name, version, and entry");
  }
  return manifest as PluginManifest;
}
