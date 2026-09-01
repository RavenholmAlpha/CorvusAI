# Corvus

Corvus is a Node.js AI agent harness with a cassette-futurist terminal UI, OpenAI Chat Completions compatible API support, AI-callable tools, permission controls, and a plugin system.

## Install

Requires Node.js 22 or newer. No repository clone is needed:

```bash
npm install --global @ravenholmalpha/corvus
corvus
```

Or run once without a global install:

```bash
npx --yes @ravenholmalpha/corvus
```

If npm publishing is not configured yet, install the GitHub Release artifact directly in one command:

```bash
npm install --global https://github.com/RavenholmAlpha/CorvusAI/releases/download/v0.1.0/ravenholmalpha-corvus-0.1.0.tgz
```

Launch the local WebUI with:

```bash
corvus --web
```

After installation, use `/setting wizard` to configure a provider, or set provider credentials in `~/.corvus/config.json`.

## Development from source

```bash
npm install
npm run build
npm run dev
```

Use `/setting wizard` to configure the endpoint, model, and API key. Use normal text to chat with the agent. Use slash commands to control runtime state.

## Commands

- `/menu` shows the task-oriented control deck.
- `/setting [show|wizard|key value]` shows, edits, or starts an interactive settings wizard.
- `/status` shows model, endpoint, API-key, tool, plugin, review, and permission state.
- `/goal [text]` sets or shows the active goal.
- `/permission [tool:name|capability:name] [allow|ask|deny]` manages tool permissions.
- `/model [name] [--endpoint url] [--api-key KEY] [--temperature n]` configures any OpenAI Chat Completions compatible endpoint.
- `/review [on|off|status]` toggles review instructions in the system prompt.
- `/runs` lists durable runs.
- `/run <id>` inspects a durable run, its messages, and latest snapshot.
- `/cancel <id>` cancels a durable run.
- `/approvals` lists pending tool approvals.
- `/approve <id|all>` approves pending tool approvals and resumes approved tool calls when the tool manifest is available.
- `/deny <id|all>` denies pending tool approvals.
- `/evidence [id|last]` shows stored evidence.
- `/tools` lists registered AI-callable tools.
- `/plugins` lists loaded plugins.
- `/config` shows runtime configuration.
- `/help` shows command help.
- `/exit` quits the TUI.

Global configuration is persisted to `~/.corvus/config.json` (`%USERPROFILE%\.corvus\config.json` on Windows). A workspace may override global maps and settings with `<workspace>/.corvus/config.json`; built-in defaults remain in the installed `builtin/` tier. Set `CORVUS_HOME` to override the user-global root for automation and testing.

## Durable Harness

Corvus stores durable cross-project run state in `~/.corvus/corvus.db`. On first startup, an existing package-local `.corvus` directory is copied non-destructively into the user-global root.

The harness records:

- runs
- steps
- messages
- tool calls
- approvals
- evidence
- append-only events
- state snapshots

Useful durable commands:

- `/runs`
- `/run <id>`
- `/resume <id>`
- `/cancel <id>`
- `/approvals`
- `/approve <id|all>`
- `/deny <id|all>`
- `/evidence [id|last]`

Tool calls run through the durable queue. Permission `ask` decisions pause the run and create an approval record. Tool outputs, tool failures, model failures, and denials create evidence for later inspection.

## Settings Menu

`/setting` is the main configuration surface. It can customize OpenAI-compatible endpoints and models without restarting the TUI because Corvus reads the active config before each model request.

Run `/setting wizard` in the TUI to enter an interactive step-by-step flow. Enter a new value at each prompt, press Enter to keep the current value, or type `/cancel` to leave without saving. Prefer `apiKeyRef: "env:VARIABLE"` over plaintext credentials in `~/.corvus/config.json`; TUI output masks stored keys.

```text
/setting wizard
/setting model gpt-4.1-mini
/setting endpoint https://api.openai.com/v1
/setting api-key sk-...
/setting temperature 0.2
/setting max-tool-rounds 6
/setting plugin-dir plugins
/setting review on
/setting goal Complete the current implementation
```

`/model` remains available as a shorter compatibility command for model, endpoint, API key, and temperature changes.

## Built-In Tools

- `read_file` and `list_dir` are allowed by default.
- `write_file`, `shell`, and `web_fetch` ask for approval by default.
- `now` is a local safe utility.

Permission rules can target either `tool:<name>` or `capability:<name>`, for example:

```text
/permission tool:shell deny
/permission capability:network allow
```

## Plugin-first installation

Corvus keeps one durable kernel and adds product capabilities through bundled or user plugins. `minimal`, `default`, and `full` are feature presets—not separate products—and never widen tool permissions automatically.

```bash
corvus bundle plan full
corvus bundle apply default
corvus plugin list
corvus plugin install ./my-plugin
corvus plugin enable my.plugin
corvus doctor --json
```

The WebUI **Installation** page can preview and apply presets, inspect plugin health, and enable or disable user plugins. Installed, enabled, configured, healthy, exposed, and authorized are separate states.

One-click source-checkout installers are available as `scripts/install.sh` and `scripts/install.ps1`:

```bash
./scripts/install.sh --preset default
```

```powershell
.\scripts\install.ps1

# Or bypass prompts for automation:
.\scripts\install.ps1 -Preset default -Permissions balanced -OpenWebUI:$false -NonInteractive
```

Plugin Manifest v1 supports stable IDs, API versions, runtime types, capability declarations, entry containment, scoped JSON state and backward-compatible legacy manifests. Native plugins remain trusted in-process code; capability declarations do not constitute an OS sandbox. See `plugins/echo-plugin` and `docs/plugin-authoring.md`.


## MCP interoperability

Discover MCP servers already configured in Claude Desktop, Cursor (global and workspace), and Codex:

```bash
corvus mcp import --dry-run
corvus mcp import
```

Existing Corvus server names win conflicts, so repeated imports are idempotent. To expose Corvus itself as an MCP stdio server to Claude Desktop, Cursor, or Codex:

```json
{ "mcpServers": { "corvus": { "command": "corvus", "args": ["mcp-serve"] } } }
```

The server advertises the `corvus_chat` tool, which delegates requests to Corvus. MCP calls remain subject to Corvus permission policy; headless and MCP invocations no longer enable auto-approval implicitly. Protocol messages use stdout; operational errors use stderr.

## Skills

Skills load with deterministic precedence: built-in < `~/.corvus/skills` < `<workspace>/.corvus/skills`. A `SKILL.md` supports YAML frontmatter fields `name`, `description`, `triggers`, and `tools_required`. Trigger matches activate skill bodies on demand; role-bound skills remain explicitly activated. The WebUI Skills page displays metadata, origin, trigger phrases, and required tools.

## Verification

```bash
npm test
npm run lint
npm run build
```
