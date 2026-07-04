import { createInterface, type Interface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { applySetting, type CommandRegistry, type DurableHarnessAdapter } from "./commands.js";
import type { CorvusConfig } from "./config.js";
import type { CorvusAgent } from "./agent.js";
import { assistantLabel, cassetteHeader, colors, errorLine, promptLabel, systemLine } from "./theme.js";
import { setPermissionRule } from "./permissions.js";
import type { ToolPermissionPrompt } from "./tools/index.js";
import type { ToolRegistry } from "./tools/index.js";

export interface CorvusTuiOptions {
  config: CorvusConfig;
  agent: CorvusAgent;
  commands: CommandRegistry;
  tools?: ToolRegistry;
  harness?: DurableHarnessAdapter;
  input?: Readable;
  output?: Writable;
  saveConfig?: () => Promise<void>;
  plugins?: Array<{ name: string; version: string; status: string }>;
}

export class CorvusTui {
  private rl?: Interface;
  private settingsWizard?: SettingsWizardSession;
  private readonly input: Readable;
  private readonly output: Writable;

  constructor(private readonly options: CorvusTuiOptions) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
  }

  async start(): Promise<void> {
    this.rl = createInterface({ input: this.input, output: this.output });
    this.write(`${cassetteHeader()}\n`);
    this.write(systemLine(`Model=${this.options.config.model} endpoint=${this.options.config.endpoint}`));
    this.write("\n");
    this.write(systemLine("Use /menu for the control deck or /help for command details. Normal text is sent to Corvus."));
    this.write("\n");

    let running = true;
    this.write(promptLabel());
    for await (const line of this.rl) {
      const trimmed = line.trim();
      if (this.settingsWizard && trimmed === "/exit") {
        this.settingsWizard = undefined;
      }
      if (this.settingsWizard) {
        const result = this.settingsWizard.handle(line);
        this.write(result.message);
        if (result.status === "complete") {
          Object.assign(this.options.config, result.config);
          await this.options.saveConfig?.();
          this.settingsWizard = undefined;
          this.write(promptLabel());
        } else if (result.status === "cancel") {
          this.settingsWizard = undefined;
          this.write(promptLabel());
        } else {
          this.write(this.settingsWizard.prompt());
        }
        continue;
      }

      if (!trimmed) {
        if (running) {
          this.write(promptLabel());
        }
        continue;
      }

      if (trimmed.toLowerCase() === "/setting wizard") {
        this.settingsWizard = new SettingsWizardSession(this.options.config);
        this.write(this.settingsWizard.startMessage());
        this.write(this.settingsWizard.prompt());
        continue;
      }

      if (trimmed.startsWith("/")) {
        const result = await this.options.commands.execute(trimmed, {
          config: this.options.config,
          tools: this.options.tools,
          harness: this.options.harness,
          write: (message) => this.write(`${message}\n`),
          saveConfig: this.options.saveConfig,
          plugins: this.options.plugins,
        });
        running = !result.exit;
        if (running) {
          this.write(promptLabel());
        } else {
          break;
        }
        continue;
      }

      try {
        const reply = await this.options.agent.send(trimmed);
        this.write(`${assistantLabel()}: ${reply.content ?? ""}\n`);
      } catch (error) {
        this.write(`${errorLine((error as Error).message)}\n`);
      }
      if (running) {
        this.write(promptLabel());
      }
    }

    this.rl.close();
  }

  async askPermission(prompt: ToolPermissionPrompt): Promise<boolean> {
    if (!this.rl) {
      return false;
    }

    this.write(
      systemLine(
        `Permission requested: ${prompt.tool.name} (${prompt.tool.capability}) with ${JSON.stringify(prompt.input)}`,
      ),
    );
    this.write("\n");
    const answer = (await this.rl.question("allow once / always / deny / never? ")).trim().toLowerCase();
    if (answer === "always") {
      setPermissionRule(this.options.config.permissions, `tool:${prompt.tool.name}`, "allow");
      await this.options.saveConfig?.();
      return true;
    }
    if (answer === "never") {
      setPermissionRule(this.options.config.permissions, `tool:${prompt.tool.name}`, "deny");
      await this.options.saveConfig?.();
      return false;
    }
    return answer === "allow" || answer === "y" || answer === "yes";
  }

  private write(message: string): void {
    this.output.write(message);
  }
}

type SettingsWizardStep = {
  key: string;
  label: string;
  current: (config: CorvusConfig) => string;
};

const settingsWizardSteps: SettingsWizardStep[] = [
  {
    key: "model",
    label: "Model",
    current: (config) => config.model,
  },
  {
    key: "endpoint",
    label: "Endpoint",
    current: (config) => config.endpoint,
  },
  {
    key: "api-key-env",
    label: "API key env",
    current: (config) => config.apiKeyEnv,
  },
  {
    key: "temperature",
    label: "Temperature",
    current: (config) => String(config.temperature),
  },
  {
    key: "max-tool-rounds",
    label: "Tool rounds",
    current: (config) => String(config.maxToolRounds),
  },
  {
    key: "plugin-dir",
    label: "Plugin dir",
    current: (config) => config.pluginDir,
  },
  {
    key: "review",
    label: "Review",
    current: (config) => (config.review.enabled ? "on" : "off"),
  },
  {
    key: "goal",
    label: "Goal",
    current: (config) => config.goal || "not set",
  },
];

class SettingsWizardSession {
  private readonly draft: CorvusConfig;
  private index = 0;

  constructor(config: CorvusConfig) {
    this.draft = cloneConfig(config);
  }

  startMessage(): string {
    return [
      "Interactive Setting Wizard",
      "--------------------------",
      "Enter a value for each setting. Press Enter to keep current. Type /cancel to stop without saving.",
      "",
    ].join("\n");
  }

  prompt(): string {
    const step = settingsWizardSteps[this.index];
    return `${colors.orange}settings>${colors.reset} ${this.index + 1}/${settingsWizardSteps.length} ${step.label} [${step.current(
      this.draft,
    )}]: `;
  }

  handle(line: string): { status: "continue" | "complete" | "cancel"; message: string; config?: CorvusConfig } {
    const answer = line.trim();
    if (answer.toLowerCase() === "/cancel") {
      return { status: "cancel", message: "\nSetting wizard canceled. No changes saved.\n" };
    }
    if (answer.startsWith("/")) {
      return {
        status: "continue",
        message: `\n${errorLine("wizard is active; enter a value, press Enter, or type /cancel")}\n`,
      };
    }

    const step = settingsWizardSteps[this.index];
    if (answer.length > 0) {
      try {
        applySetting(this.draft, step.key, [answer]);
      } catch (error) {
        return { status: "continue", message: `\n${errorLine((error as Error).message)}\n` };
      }
    }

    this.index += 1;
    if (this.index >= settingsWizardSteps.length) {
      return {
        status: "complete",
        message: "\nSetting wizard complete. Saved configuration.\n",
        config: this.draft,
      };
    }

    return { status: "continue", message: "\n" };
  }
}

function cloneConfig(config: CorvusConfig): CorvusConfig {
  return {
    ...config,
    permissions: {
      ...config.permissions,
      rules: { ...config.permissions.rules },
    },
    review: { ...config.review },
  };
}
