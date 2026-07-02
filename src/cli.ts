#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRegistry, createCoreCommands } from "./commands.js";
import { loadConfig, saveConfig } from "./config.js";
import { CorvusAgent } from "./agent.js";
import { loadPlugins } from "./plugins.js";
import { createConfigBackedChatModel } from "./runtime.js";
import { CorvusTui } from "./tui.js";
import { createBuiltInTools, ToolRegistry } from "./tools/index.js";

export async function main(): Promise<void> {
  const config = await loadConfig();
  const tools = new ToolRegistry(config.permissions);
  tools.registerMany(createBuiltInTools());

  const commands = new CommandRegistry(createCoreCommands());
  const loadedPlugins = await loadPlugins(resolve(config.pluginDir), {
    tools,
    registerCommand: (command) => commands.register(command),
  });

  const client = createConfigBackedChatModel(config);
  const agent = new CorvusAgent({ config, tools, model: client });
  const tui = new CorvusTui({
    config,
    agent,
    commands,
    tools,
    plugins: loadedPlugins,
    saveConfig: () => saveConfig(config),
  });
  tools.setPermissionRequester((prompt) => tui.askPermission(prompt));

  await tui.start();
}

export function isCliEntryPoint(moduleUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) {
    return false;
  }
  return fileURLToPath(moduleUrl) === resolve(argvPath);
}

if (isCliEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Corvus failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
