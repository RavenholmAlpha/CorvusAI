import { createInterface, type Interface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { CommandRegistry } from "./commands.js";
import type { CorvusConfig } from "./config.js";
import type { CorvusAgent } from "./agent.js";
import { assistantLabel, cassetteHeader, errorLine, promptLabel, systemLine } from "./theme.js";
import { setPermissionRule } from "./permissions.js";
import type { ToolPermissionPrompt } from "./tools/index.js";
import type { ToolRegistry } from "./tools/index.js";

export interface CorvusTuiOptions {
  config: CorvusConfig;
  agent: CorvusAgent;
  commands: CommandRegistry;
  tools?: ToolRegistry;
  input?: Readable;
  output?: Writable;
  saveConfig?: () => Promise<void>;
  plugins?: Array<{ name: string; version: string; status: string }>;
}

export class CorvusTui {
  private rl?: Interface;
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
      if (!trimmed) {
        if (running) {
          this.write(promptLabel());
        }
        continue;
      }

      if (trimmed.startsWith("/")) {
        const result = await this.options.commands.execute(trimmed, {
          config: this.options.config,
          tools: this.options.tools,
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
