# Corvus

Corvus is a Node.js AI agent harness with a cassette-futurist terminal UI, OpenAI Chat Completions compatible API support, AI-callable tools, permission controls, and a plugin system.

## Quick Start

```bash
npm install
npm run build
$env:OPENAI_API_KEY="sk-..."
npm run dev
```

Use normal text to chat with the agent. Use slash commands to control runtime state.

## Commands

- `/menu` shows the task-oriented control deck.
- `/setting [show|wizard|key value]` shows, edits, or walks through runtime settings.
- `/status` shows model, endpoint, API-key, tool, plugin, review, and permission state.
- `/goal [text]` sets or shows the active goal.
- `/permission [tool:name|capability:name] [allow|ask|deny]` manages tool permissions.
- `/model [name] [--endpoint url] [--api-key-env ENV] [--temperature n]` configures any OpenAI Chat Completions compatible endpoint.
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

Configuration is persisted to `.corvus/config.json`.

## Durable Harness

Corvus stores durable local run state in `.corvus/corvus.db`.

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

```text
/setting wizard
/setting model gpt-4.1-mini
/setting endpoint https://api.openai.com/v1
/setting api-key-env OPENAI_API_KEY
/setting temperature 0.2
/setting max-tool-rounds 6
/setting plugin-dir plugins
/setting review on
/setting goal Complete the current implementation
```

`/model` remains available as a shorter compatibility command for model, endpoint, API-key env, and temperature changes.

## Built-In Tools

- `read_file` and `list_dir` are allowed by default.
- `write_file`, `shell`, and `web_fetch` ask for approval by default.
- `now` is a local safe utility.

Permission rules can target either `tool:<name>` or `capability:<name>`, for example:

```text
/permission tool:shell deny
/permission capability:network allow
```

## Plugins

Corvus loads plugins from `plugins/`. See `plugins/echo-plugin` and `docs/plugin-authoring.md`.

## Verification

```bash
npm test
npm run lint
npm run build
```
