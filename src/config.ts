import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createDefaultPolicy, type PermissionPolicy } from "./permissions.js";

export interface ReviewConfig {
  enabled: boolean;
  instruction: string;
}

export interface CorvusConfig {
  name: "Corvus";
  endpoint: string;
  model: string;
  apiKey: string;
  apiKeyEnv: string;
  goal: string;
  pluginDir: string;
  maxToolRounds: number;
  temperature: number;
  permissions: PermissionPolicy;
  review: ReviewConfig;
  systemPrompt: string;
  compactionThreshold: number;
}

export function createDefaultConfig(): CorvusConfig {
  return {
    name: "Corvus",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "",
    apiKeyEnv: "OPENAI_API_KEY",
    goal: "",
    pluginDir: "plugins",
    maxToolRounds: 6,
    temperature: 0.2,
    permissions: createDefaultPolicy(),
    review: {
      enabled: false,
      instruction:
        "Before final answers, review tool results and permissions, then call out risks, uncertainty, and next actions.",
    },
    systemPrompt:
      "You are Corvus, a permissioned AI agent harness. Use tools when useful, respect permission decisions, and keep responses concise and actionable.",
    compactionThreshold: 20000,
  };
}

export function getDefaultConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, ".corvus", "config.json");
}

export async function loadConfig(path = getDefaultConfigPath()): Promise<CorvusConfig> {
  const defaults = createDefaultConfig();

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<CorvusConfig>;
    return {
      ...defaults,
      ...parsed,
      permissions: {
        ...defaults.permissions,
        ...(parsed.permissions ?? {}),
        rules: {
          ...defaults.permissions.rules,
          ...(parsed.permissions?.rules ?? {}),
        },
      },
      review: {
        ...defaults.review,
        ...(parsed.review ?? {}),
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaults;
    }
    throw error;
  }
}

export async function saveConfig(config: CorvusConfig, path = getDefaultConfigPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

