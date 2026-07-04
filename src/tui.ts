import { createInterface, type Interface } from "node:readline/promises";
import * as readline from "node:readline";
import type { Readable, Writable } from "node:stream";
import { applySetting, type CommandRegistry, type DurableHarnessAdapter } from "./commands.js";
import type { CorvusConfig } from "./config.js";
import type { CorvusAgent, PendingApprovalInfo } from "./agent.js";
import { assistantLabel, cassetteHeader, colors, errorLine, promptLabel, systemLine } from "./theme.js";
import { setPermissionRule } from "./permissions.js";
import type { ToolPermissionPrompt } from "./tools/index.js";
import type { ToolRegistry } from "./tools/index.js";

class StreamHighlighter {
  private inCodeBlock = false;
  private inInlineCode = false;
  private backtickCount = 0;
  private asterisks = 0;
  private inBold = false;

  process(chunk: string): string {
    let out = "";
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];

      if (char === '`') {
        this.backtickCount++;
        out += char;
        if (this.backtickCount === 3) {
          this.inCodeBlock = !this.inCodeBlock;
          out += this.inCodeBlock ? `\x1b[40m\x1b[36m` : `\x1b[0m`;
          this.backtickCount = 0;
          this.inInlineCode = false;
        }
      } else {
        if (this.backtickCount > 0 && this.backtickCount < 3) {
          this.inInlineCode = !this.inInlineCode;
          if (this.inInlineCode) {
            out += `\x1b[33m`;
          } else {
            out += `\x1b[0m`;
            if (this.inCodeBlock) out += `\x1b[40m\x1b[36m`;
          }
          this.backtickCount = 0;
        }

        if (char === '*' && !this.inCodeBlock && !this.inInlineCode) {
           this.asterisks++;
           out += char;
           if (this.asterisks === 2) {
              this.inBold = !this.inBold;
              out += this.inBold ? `\x1b[1m\x1b[38;5;208m` : `\x1b[0m`;
              this.asterisks = 0;
           }
        } else {
           if (this.asterisks === 1) {
              this.asterisks = 0;
           }
           if (char === '\n') {
             this.backtickCount = 0;
             this.asterisks = 0;
           }
           out += char;
        }
      }
    }
    return out;
  }
}

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
  initialMode?: "line" | "stream" | "dashboard" | "setup";
}

import { RuntimeStateManager } from "./runtime-state.js";

export class CorvusTui {
  private rl?: Interface;
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly stateManager: RuntimeStateManager;
  private running = true;
  private needsLabel = true;

  constructor(private readonly options: CorvusTuiOptions) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.stateManager = new RuntimeStateManager(options.initialMode ? { mode: options.initialMode } : {});

    if (this.options.tools) {
      for (const tool of this.options.tools.list()) {
        const originalExecute = tool.execute.bind(tool);
        tool.execute = async (input, context) => {
          if (!this.needsLabel) {
            this.write("\n");
          }
          this.write(`\x1b[35m⠋ ⚙️ 正在调用工具: ${tool.name}...\x1b[0m\n`);
          const start = Date.now();
          try {
            const res = await originalExecute(input, context);
            const ms = Date.now() - start;
            this.write(`\x1b[32m✔ 工具 ${tool.name} 执行完毕 (${(ms / 1000).toFixed(1)}s)\x1b[0m\n`);
            this.needsLabel = true;
            return res;
          } catch (e: any) {
            const ms = Date.now() - start;
            this.write(`\x1b[31m✖ 工具 ${tool.name} 执行失败 (${(ms / 1000).toFixed(1)}s): ${e.message}\x1b[0m\n`);
            this.needsLabel = true;
            throw e;
          }
        };
      }
    }
  }

  async start(): Promise<void> {
    while (this.running) {
      if (this.stateManager.get().mode === "line") {
        await this.runLineMode();
      } else {
        await this.runInkMode();
      }
    }
  }

  private async runInkMode(): Promise<void> {
    const { render } = await import("ink");
    const React = await import("react");
    const { App } = await import("./ui/App.js");

    const instance = render(
      React.createElement(App, {
        stateManager: this.stateManager,
        agent: this.options.agent,
        config: this.options.config,
      })
    );
    
    await instance.waitUntilExit();
    
    // Ensure stdin is referenced and resumed so readline can capture it again
    if (this.input.isPaused && this.input.isPaused()) {
      this.input.resume();
    }
    if ((this.input as any).ref) {
      (this.input as any).ref();
    }
  }

  private async runLineMode(): Promise<void> {
    this.rl = createInterface({ input: this.input, output: this.output });
    
    const onStateChange = (state: ReturnType<RuntimeStateManager["get"]>) => {
      if (state.mode !== "line") {
        this.rl?.close();
      }
    };
    this.stateManager.on("change", onStateChange);

    this.write(`${cassetteHeader()}\n`);
    this.write(systemLine(`Model=${this.options.config.model} endpoint=${this.options.config.endpoint}`));
    this.write("\n");
    this.write(systemLine("Use /menu for the control deck or /help for command details. Normal text is sent to Corvus."));
    this.write("\n");
    this.write(promptLabel());

    for await (const line of this.rl) {
      const trimmed = line.trim();

      if (!trimmed) {
        if (this.running && this.stateManager.get().mode === "line") {
          this.write(promptLabel());
        }
        continue;
      }

      if (trimmed.toLowerCase() === "/settings" || trimmed.toLowerCase() === "/setting") {
        this.stateManager.setMode("dashboard");
        this.stateManager.setDashboardSection("settings");
        continue;
      }

      if (trimmed.startsWith("/")) {
        const result = await this.options.commands.execute(trimmed, {
          config: this.options.config,
          tools: this.options.tools,
          harness: this.options.harness,
          runtimeState: this.stateManager,
          write: (message) => this.write(`${message}\n`),
          saveConfig: this.options.saveConfig,
          plugins: this.options.plugins,
        });
        this.running = !result.exit;
        if (!this.running || this.stateManager.get().mode !== "line") {
          break;
        }
        this.write(promptLabel());
        continue;
      }

      try {
        this.needsLabel = true;
        const start = Date.now();
        let streamedChars = 0;
        const highlighter = new StreamHighlighter();

        const result = await this.options.agent.send(trimmed, {
          onChunk: (text) => {
            if (this.needsLabel) {
              this.write(`${assistantLabel()}: `);
              this.needsLabel = false;
            }
            this.write(highlighter.process(text));
            streamedChars += text.length;
          },
        });

        // Ensure formatting resets at the end of output
        this.write(`\x1b[0m`);

        if (streamedChars > 0 && !result.message.content?.endsWith("\n")) {
          this.write("\n");
        }

        if (streamedChars === 0 && result.message.content) {
          if (this.needsLabel) {
            this.write(`${assistantLabel()}: `);
          }
          this.write(`${result.message.content}\n`);
        }
        
        const ms = Date.now() - start;
        this.write(`\x1b[90m[⚡ 回复耗时: ${(ms/1000).toFixed(1)}s]\x1b[0m\n`);

        // Handle pending approvals interactively
        if (result.pendingApprovals && result.pendingApprovals.length > 0 && result.runId) {
          await this.handlePendingApprovals(result.runId, result.pendingApprovals);
        }
      } catch (error) {
        this.write(`${errorLine((error as Error).message)}\n`);
      }
      
      if (!this.running || this.stateManager.get().mode !== "line") {
        break;
      }
      this.write(promptLabel());
    }

    this.stateManager.off("change", onStateChange);
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
    const answer = await this.interactiveSelect(
      `${colors.orange}Permission:${colors.reset}`,
      ["allow once", "workspace", "always", "deny", "never"]
    );
    if (answer === "always") {
      setPermissionRule(this.options.config.permissions, `tool:${prompt.tool.name}`, "allow");
      await this.options.saveConfig?.();
      return true;
    }
    if (answer === "workspace") {
      setPermissionRule(this.options.config.permissions, `tool:${prompt.tool.name}`, "allow", process.cwd());
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

  private async handlePendingApprovals(runId: string, approvals: PendingApprovalInfo[]): Promise<void> {
    if (!this.rl || !this.options.harness) {
      return;
    }

    this.write("\n");
    this.write(systemLine(`Run paused — ${approvals.length} tool(s) require approval:`));
    this.write("\n");

    let anyApproved = false;

    for (const approval of approvals) {
      const toolName = approval.toolName;
      this.write(systemLine(`  Tool: ${colors.bold}${toolName}${colors.reset}`));
      this.write("\n");

      const answer = await this.interactiveSelect(
        `  ${colors.orange}approve>${colors.reset}`,
        ["allow once", "workspace", "always", "deny", "never"]
      );

      try {
        if (answer === "always") {
          this.options.harness.resolveApproval(approval.approvalId, "approved", "always");
          setPermissionRule(this.options.config.permissions, `tool:${toolName}`, "allow");
          await this.options.saveConfig?.();
          anyApproved = true;
        } else if (answer === "workspace") {
          this.options.harness.resolveApproval(approval.approvalId, "approved", "always");
          setPermissionRule(this.options.config.permissions, `tool:${toolName}`, "allow", process.cwd());
          await this.options.saveConfig?.();
          anyApproved = true;
        } else if (answer === "never") {
          this.options.harness.resolveApproval(approval.approvalId, "denied", "never");
          setPermissionRule(this.options.config.permissions, `tool:${toolName}`, "deny");
          await this.options.saveConfig?.();
        } else if (answer === "deny" || answer === "n" || answer === "no") {
          this.options.harness.resolveApproval(approval.approvalId, "denied", "once");
        } else {
          // Default: allow once
          this.options.harness.resolveApproval(approval.approvalId, "approved", "once");
          anyApproved = true;
        }

        // Execute approved tool calls immediately
        if (answer !== "deny" && answer !== "n" && answer !== "no" && answer !== "never") {
          const tool = this.options.tools?.list().find((t) => t.name === toolName);
          if (tool) {
            await this.options.harness.runApproved(approval.toolCallId, tool);
          }
        }
      } catch (error) {
        this.write(`${errorLine((error as Error).message)}\n`);
      }
    }

    // Auto-resume the run unconditionally so the model receives the tool results (including denials)
    this.write("\n");
    this.write(systemLine("Resuming run..."));
    this.write("\n");
    try {
      const resumed = await this.options.agent.resume(runId);
      if (resumed) {
        if (resumed.pendingApprovals && resumed.pendingApprovals.length > 0) {
          // If resuming resulted in MORE approvals, handle them recursively
          await this.handlePendingApprovals(runId, resumed.pendingApprovals);
        } else if (resumed.message && resumed.message.content) {
          this.write(`${assistantLabel()}: ${resumed.message.content}\n`);
        }
      }
    } catch (error) {
        this.write(`${errorLine((error as Error).message)}\n`);
      }
    }

  private async interactiveSelect(prompt: string, options: string[]): Promise<string> {
    if (!process.stdin.isTTY) {
      return (await this.rl!.question(`${prompt} ${options.join(" / ")}? `)).trim().toLowerCase();
    }
    
    return new Promise((resolve) => {
      this.rl?.pause();
      
      let selectedIndex = 0;
      const render = () => {
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        const parts = options.map((opt, i) =>
          i === selectedIndex ? `\x1b[36m\x1b[4m> ${opt} <\x1b[0m` : `  ${opt}  `
        );
        process.stdout.write(`${prompt} ${parts.join("")}`);
      };

      const onKeypress = (str: string, key: readline.Key) => {
        if (key.name === "left") {
          selectedIndex = Math.max(0, selectedIndex - 1);
          render();
        } else if (key.name === "right") {
          selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
          render();
        } else if (key.name === "return" || key.name === "enter") {
          cleanup();
          process.stdout.write("\n");
          resolve(options[selectedIndex].trim().toLowerCase());
        } else if (key.name === "c" && key.ctrl) {
          cleanup();
          process.stdout.write("\n");
          process.exit(0);
        }
      };

      const cleanup = () => {
        process.stdin.removeListener("keypress", onKeypress);
        if (process.stdin.isRaw) {
          process.stdin.setRawMode(false);
        }
        this.rl?.resume();
      };

      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.on("keypress", onKeypress);
      render();
    });
  }

  private write(message: string): void {
    this.output.write(message);
  }
}
