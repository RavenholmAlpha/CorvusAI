# Corvus Human-Computer Interaction Redesign

Date: 2026-07-02

## Purpose

This design upgrades Corvus from a command-oriented AI agent harness into a hybrid human-computer interaction system. The requested direction is a complete interaction improvement with priority order:

1. Agent workbench experience
2. Command console experience
3. First-run onboarding experience

The design keeps the existing scriptable line-mode interface and adds a full-screen workbench with two explicit modes: Stream Workbench for daily agent collaboration and Control Dashboard for management, settings, diagnostics, plugins, permissions, and setup.

## Current Project Context

The current implementation is a Node.js and TypeScript terminal application with:

- A readline-based TUI entry point.
- Slash commands including `/goal`, `/setting`, `/permission`, `/model`, `/review`, `/menu`, `/status`, `/tools`, `/plugins`, `/config`, `/help`, and `/exit`.
- OpenAI Chat Completions compatible client support.
- Config persistence in `.corvus/config.json`.
- Built-in AI-callable tools.
- Permission policy handling.
- Plugin loading from `plugins/`.
- Vitest test coverage for commands, TUI flow, runtime model config, tools, plugins, permissions, and agent tool calls.

The redesign must preserve these capabilities while introducing richer interaction modes.

## Confirmed Design Decisions

- Use a full integration direction rather than only command polish.
- Preserve current command-line flow.
- Add a full-screen workbench.
- Support two separate workbench modes:
  - Stream Workbench
  - Control Dashboard
- Do not use `Tab` as the primary mode-switch mechanism.
- Use obvious shortcuts:
  - `F2` for Stream Workbench
  - `F3` for Control Dashboard
  - `Ctrl+K` for Command Deck
  - `Esc` for Back
  - `Q` for Exit Workspace
- Use command equivalents:
  - `/workspace`
  - `/dashboard`
  - `/exit-workspace`
- Use a hybrid tool and permission UI:
  - Compact inline tool badges in the conversation stream.
  - Important permission requests inline.
  - Approval queue and evidence dock in the side inspector.
- Support both first-run Setup Wizard and reusable Setup Center.

## Interaction Architecture

Corvus will have two interface layers.

### Line Mode

Line Mode is the existing scriptable command flow. It remains the default interface for:

- Simple command execution.
- Piped input.
- Fast configuration changes.
- Users who do not want a full-screen UI.
- Automation-friendly use.

Line Mode continues to support all current commands. New commands are added for entering workbench surfaces and interacting with workbench state.

### Workbench Mode

Workbench Mode is a full-screen terminal interface. It is entered through:

- `/workspace` for Stream Workbench.
- `/dashboard` for Control Dashboard.
- First-run Setup Wizard when required configuration is missing.

Workbench Mode has a persistent top hotkey bar and a bottom input or action hint bar. It shares runtime state with Line Mode.

## Stream Workbench

Stream Workbench is the default daily collaboration surface.

### Layout

The layout has four primary regions:

- Top status bar:
  - Corvus branding.
  - Active model.
  - Active endpoint.
  - API key env state.
  - Permission status summary.
  - Hotkey hints.

- Conversation stream:
  - User messages.
  - Assistant messages.
  - Compact tool badges.
  - Important permission checkpoints.
  - Final responses with evidence references.

- Inspector dock:
  - Active goal.
  - Approval queue.
  - Evidence drawer.
  - Settings snapshot.
  - Review checklist.
  - Recent tool and permission events.

- Bottom input:
  - Natural-language messages.
  - Slash commands.
  - Lightweight action commands such as `approve 1`, `deny shell`, and `evidence last`.

### Behavior

Stream Workbench should keep conversation readable. Long tool outputs do not flood the main stream. Instead:

- Compact inline badges summarize each tool call.
- Detailed outputs are stored as evidence items.
- Final answers can reference evidence items by id.
- Pending approvals are visible both inline and in the inspector dock.

## Control Dashboard

Control Dashboard is the management surface.

### Layout

The dashboard has four primary regions:

- Top status bar:
  - Same hotkey hints as Stream Workbench.
  - Runtime warnings.
  - Current mode marker.

- Section navigation:
  - Setup Center.
  - Settings.
  - Permissions.
  - Tools.
  - Plugins.
  - Diagnostics.

- Active management panel:
  - Forms.
  - Tables.
  - Rule editors.
  - Fix actions.
  - Plugin errors.
  - Permission presets.

- Runtime summary:
  - Model and endpoint.
  - API key env state.
  - Tool count.
  - Plugin load state.
  - Review state.
  - Warnings.

### Behavior

Dashboard is optimized for configuration and inspection. It should support keyboard navigation and command access:

- Arrow keys move through lists and sections.
- `Enter` edits or applies the focused action.
- `Ctrl+K` opens Command Deck.
- `F2` returns to Stream Workbench.
- `Q` exits Workbench Mode.

## Command Deck

Command Deck is opened with `Ctrl+K` in Workbench Mode. It is a searchable command surface for common actions.

It should include:

- Mode switching.
- Settings edits.
- Permission actions.
- Tool and plugin views.
- Setup Center actions.
- Evidence search.
- Approval queue actions.

Line Mode equivalent: `/deck`.

## Commands

New commands:

- `/workspace`: enter Stream Workbench.
- `/dashboard`: enter Control Dashboard.
- `/exit-workspace`: exit full-screen workbench and return to Line Mode.
- `/setup`: open Setup Wizard or Setup Center.
- `/deck`: open the command deck or print command deck actions in Line Mode.
- `/evidence [id|last]`: view evidence item details.
- `/approvals`: view pending approval queue.
- `/approve <id|all>`: approve queued tool requests.
- `/deny <id|all>`: deny queued tool requests.
- `/preset safe|balanced|autonomous`: apply a permission preset.

Existing commands remain supported.

## Tool Calls, Permissions, and Evidence

Tool calls move through a structured runtime pipeline:

1. The model requests a tool call.
2. Corvus creates a tool run record.
3. Permission policy decides allow, ask, or deny.
4. Allowed tools execute immediately.
5. Ask decisions enter the approval queue.
6. Denied decisions create evidence items and return denial to the agent.
7. Tool outputs become evidence items.
8. Compact badges are rendered in Stream Workbench.
9. Detailed evidence remains available in the inspector dock and through `/evidence`.

### Permission UI

Permission prompts support:

- Allow once.
- Always allow.
- Deny once.
- Never allow.
- View policy diff before writing a permanent rule.

Permanent decisions update the permission policy only after explicit confirmation.

### Approval Queue

Approval queue entries include:

- Id.
- Tool name.
- Capability.
- Arguments summary.
- Risk level.
- Requested timestamp.
- Suggested action.

Queue operations:

- Approve selected.
- Deny selected.
- Approve all matching safe reads.
- Deny all shell commands.
- Convert decision to permanent rule.

### Evidence Items

Evidence items include:

- Id.
- Source type: tool result, permission denial, model warning, setup check, plugin error.
- Title.
- Summary.
- Full content or structured payload.
- Related message id.
- Timestamp.

Evidence is runtime state, not persisted in `.corvus/config.json`.

## Setup Wizard

Setup Wizard starts automatically when first-run checks indicate setup is needed.

Setup Wizard steps:

1. Provider and endpoint.
   - Default OpenAI endpoint.
   - Custom OpenAI-compatible endpoint.
   - HTTP and HTTPS URL validation.

2. Model.
   - Default model option.
   - Manual model entry.
   - Continue with current value.

3. API key env.
   - Store environment variable name only.
   - Check whether the variable is present.
   - Do not store API key secrets.

4. Permission preset.
   - Safe.
   - Balanced.
   - Autonomous.

5. Plugins.
   - Scan configured plugin directory.
   - Show loaded and failed plugins.
   - Allow plugin error inspection.

6. Review mode.
   - Enable or disable default review behavior.
   - Configure review checklist text.

Completion writes persistent configuration to `.corvus/config.json` and enters Stream Workbench.

## Setup Center

Setup Center is available after first run through `/setup` and the Dashboard section navigation.

Setup Center shows health checks:

- Config file exists.
- Endpoint URL is valid.
- Model is configured.
- API key env name is valid.
- API key env value is present.
- Plugin directory exists.
- Plugins load successfully.
- Permission policy is recognized.
- Review mode is configured.

Each failing check has a focused fix action that opens the corresponding setup step or settings panel.

## Runtime State

Add a runtime state model separate from persistent config.

Runtime state fields:

- `mode`: `line | stream | dashboard | setup`
- `dashboardSection`
- `messages`
- `toolRuns`
- `approvalQueue`
- `evidenceItems`
- `recentDecisions`
- `setupStatus`
- `warnings`
- `commandDeckOpen`
- `focusedPane`
- `selectedItemId`

Persistent config remains responsible for:

- Model.
- Endpoint.
- API key env name.
- Plugin directory.
- Permission policy.
- Review settings.
- Max tool rounds.
- System prompt.
- Goal.

This split prevents transient UI state from polluting `.corvus/config.json`.

## Error Handling

- Missing API key env:
  - Show warning in status bar and Setup Center.
  - Do not crash on startup.
  - Block model requests with an actionable message.

- Invalid endpoint:
  - Reject setting change.
  - Setup Center marks endpoint check failed.
  - Model requests are blocked until fixed.

- Failed plugin:
  - Do not block startup.
  - Dashboard Plugins section shows failed state and error.
  - Status summary shows warning count.

- Permission denied:
  - Record evidence item.
  - Return structured denial to agent.
  - Allow agent to choose an alternative path.

- Tool execution failure:
  - Record evidence item.
  - Show compact failure badge.
  - Preserve full stderr or error payload in evidence.

- Resize or unsupported terminal:
  - Fall back to compact layout.
  - Preserve Line Mode compatibility.

## Testing Strategy

### Command Tests

Cover:

- `/workspace` switches runtime mode to stream.
- `/dashboard` switches runtime mode to dashboard.
- `/setup` switches runtime mode to setup.
- `/exit-workspace` returns to line mode.
- `/deck` exposes command deck actions.
- `/approvals` lists pending approvals.
- `/approve` updates approval queue.
- `/deny` updates approval queue and evidence.
- `/preset` applies expected permission rules.

### Runtime State Tests

Cover:

- Runtime state initializes from config.
- Runtime state does not persist transient UI fields.
- Tool calls produce tool run records.
- Ask decisions produce approval queue entries.
- Tool results produce evidence items.
- Denials produce evidence items.

### Renderer Tests

Cover:

- Stream Workbench renders top hotkey bar.
- Stream Workbench renders conversation stream and inspector dock.
- Dashboard renders section navigation and runtime summary.
- Setup Wizard renders step content and actions.
- Compact terminal fallback renders without overlapping text.

### Setup Tests

Cover:

- Missing config triggers setup requirement.
- Missing API key env generates warning.
- Invalid endpoint fails validation.
- Plugin load failure appears in setup status.
- Completed wizard writes expected persistent config.

### Integration Smoke Tests

Cover:

- Existing Line Mode commands continue working.
- `/workspace` renders Stream Workbench shell.
- `/dashboard` renders Control Dashboard shell.
- `/setup` renders Setup Wizard or Setup Center.
- Tool permission flow can pause for approval and resume after approval.

## Implementation Boundaries

The implementation should be incremental:

1. Add runtime state and setup status models.
2. Add command support for new modes and queues.
3. Add renderer functions for Stream, Dashboard, Setup, and Command Deck.
4. Add full-screen input loop and keyboard handling.
5. Connect agent tool calls to tool runs, approvals, and evidence.
6. Add Setup Wizard and Setup Center.
7. Preserve and verify Line Mode behavior.

The initial implementation can render text-based panels first. Rich keyboard navigation and polished panel drawing can be refined after behavior is covered by tests.

## Acceptance Criteria

- Existing tests continue passing.
- New mode commands are tested.
- Setup Wizard and Setup Center are tested.
- Stream Workbench and Control Dashboard have renderer tests.
- Tool calls create visible runtime records.
- Permission ask decisions enter approval queue.
- Evidence is inspectable.
- Line Mode remains usable.
- The UI clearly displays `F2`, `F3`, `Ctrl+K`, `Esc`, and `Q` shortcuts.
- No API keys are written to config.
- `.corvus/config.json` contains persistent configuration only.
