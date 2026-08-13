# Corvus Unified Command Experience Design

**Date:** 2026-08-13

## Goal

Make Corvus feel like one coherent terminal product: interactive users can discover and execute commands the moment they type `/`, switch between Console, Chat, Control, and Setup with unambiguous navigation, and never have a slash command accidentally treated as chat text.

## Product Direction

This work borrows interaction patterns from Pi only:

- one focused composer at a time;
- searchable command discovery at the point of input;
- predictable keyboard behavior;
- dense, readable terminal information.

It does **not** copy Pi's visual system. Corvus retains its cassette-futurist identity: a dark instrument-panel surface, cyan as the primary active signal, amber for attention, magenta for tool activity, concise machine-status copy, and visibly segmented controls.

## Scope

Included:

- immediate slash-command discovery in interactive Console and Workbench;
- a shared command palette and composer behavior;
- one command execution path for Console and Workbench;
- clear primary-mode navigation and keyboard rules;
- focus ownership, error recovery, and compact-terminal layout rules;
- automated tests for command filtering, completion, command dispatch, and non-TTY compatibility.

Excluded:

- changes to tool permissions, sandboxing, secret storage, or other security work;
- redesigning durable-run storage or tool execution semantics;
- implementing currently placeholder Dashboard management panels beyond making their navigation truthful;
- mouse-first interaction.

## User Problems Being Fixed

1. `readline` Line Mode sees input only after Enter, so it cannot react when a user types `/`.
2. Workbench sends slash-prefixed text directly to the model instead of `CommandRegistry`.
3. The current Command Deck contains only four static navigation actions and cannot search or run commands.
4. Mode affordances are weak and inconsistent: `/menu`, `/deck`, `/setting`, `Q`, and F-keys do not communicate one coherent mental model.
5. Global keyboard handlers conflict with text editing, including a bare `q` that can leave the workspace while composing a message.

## Chosen Interaction Model

### Primary modes

Corvus has four named top-level surfaces:

| Surface | Purpose | Entry |
|---|---|---|
| **Console** | Compact, single-column terminal collaboration | `F1`, `/console` |
| **Chat** | Main conversation surface with inspector context | `F2`, `/workspace` |
| **Control** | Settings, runs, tools, plugins, diagnostics | `F3`, `/dashboard` |
| **Setup** | Guided first-run configuration | `F4`, `/setup` |

The top bar renders these surfaces as a segmented navigation rail. The active surface receives an inverse cyan treatment and an `ACTIVE` marker. Inactive surfaces retain their key hint but do not compete with the active state. `Ctrl+K` remains visible as the command-panel shortcut.

`Setup` is a temporary guided flow. `Setup Center` is a Control section called **Configuration Overview** so the UI no longer uses the same name for two different destinations.

There is no global bare-letter exit shortcut. `/exit` remains the explicit quit command; `Ctrl+C` continues to be owned by the terminal. Normal letters, including `q`, always remain editable in a composer.

### One composer and one command palette

Console and Chat use the same `CommandComposer` behavior. The difference is presentation only: Console is a compact one-column transcript; Chat retains the conversation-plus-inspector layout.

The composer owns text input whenever the palette is closed. The palette owns navigation keys whenever it is open. No parent or sibling component may consume the same keystroke while either control is focused.

| User action | Result |
|---|---|
| Type the first `/` into an empty composer | Open the command palette below the composer and keep `/` as the query. |
| Type more command text | Filter command items by command name, usage, summary, and category. |
| `Up` / `Down` | Move only the palette highlight. |
| `Tab` | Replace the command-name portion with the highlighted command usage prefix; preserve any typed arguments. |
| `Enter` on an exact command line | Execute it through `CommandRegistry`. |
| `Enter` on a partial command | Complete the highlighted command name and return focus to the composer. |
| `Enter` on a command that needs arguments but has none | Insert its usage prefix and keep focus in the composer. |
| `Esc` | Close the palette and preserve the draft. |
| Backspace from an empty `/` query | Close the palette and return to an empty composer. |
| `Ctrl+K` | Open the complete palette from any non-editing context; from a composer it opens without inserting a character. |

Slash-prefixed submissions always use `CommandRegistry.execute()`. Non-slash submissions alone may call `agent.send()`. This rule applies to Console, Chat, and any future input surface.

### Palette content and ranking

The palette has one dynamic source of truth: `CommandRegistry.list()`. Every command row shows:

- the slash command name;
- usage;
- short summary;
- category;
- an optional mode badge for navigation commands.

Rows rank in this order:

1. exact command-name match;
2. command-name prefix match;
3. command-name word-boundary match;
4. usage or summary substring match.

The palette adds only four local navigation actions—Console, Chat, Control, Setup—because these are UI actions rather than `CommandRegistry` commands. They use the same row treatment but carry a `SURFACE` badge. No duplicate static catalog of regular commands is maintained.

### Focus and errors

The palette must set the composer to unfocused while open. Selecting, typing, arrows, Tab, Enter, and Escape are handled by exactly one focused component.

When a command fails, its message appears as an amber system entry directly above the composer; the command draft stays available for correction. When chat submission fails, the composer restores the unsent text and displays the same amber system entry. During a model response the composer shows a compact `LINK ACTIVE` state and disables submission; it never silently discards an error.

## Runtime Architecture

### Interactive versus non-interactive input

Interactive TTY sessions use one long-lived Ink application for every surface, including Console. This grants Console the same per-keystroke behavior as Chat and Control.

Non-TTY input—piped commands, redirected input, and automated text streams—continues to use the existing readline flow. It remains line-oriented by design and does not render a command palette. It still sends slash commands to `CommandRegistry` and ordinary text to the agent.

### Shared command bridge

`CorvusTui` creates a single command-context factory with the current config, registry, tools, harness, plugins, runtime state, and persistence callback. It passes this bridge to the Ink app.

The Ink app exposes this interface to both Console and Chat:

```ts
interface InteractiveSubmitter {
  submitCommand(input: string): Promise<CommandResult>;
  submitChat(input: string, onChunk: (chunk: string) => void): Promise<SendResult>;
}
```

`submitCommand()` creates the normal `CommandContext`, passes through the existing persistence callback so the registry remains its single owner, collects command output as system entries, and lets mode-changing commands update `RuntimeStateManager`. `submitChat()` delegates to `CorvusAgent.send()`.

`CommandComposer` receives `InteractiveSubmitter`, command metadata, and callbacks for transient transcript entries. It never imports the database, tools, or TUI directly.

### Components

| Component | Responsibility |
|---|---|
| `App` | Owns the surface state, top navigation, shortcut routing outside text editing, and one shared submitter. |
| `LineConsole` | Renders compact transcript and shared composer for Console mode. |
| `StreamWorkbench` | Renders conversation, inspector, and shared composer for Chat mode. |
| `CommandComposer` | Manages draft text, opens the palette on `/`, routes Enter between chat and command submission, and restores drafts after errors. |
| `CommandPalette` | Renders filtered commands, owns palette focus, completion, selection, and dismissal. |
| `command-palette.ts` | Pure filtering, ranking, completion, and selection helpers. |
| `RuntimeStateManager` | Adds explicit `setCommandDeckOpen(open: boolean)` and keeps surface changes deterministic. |

The old `CommandDeck` becomes the visual shell for `CommandPalette` rather than a separate static action list.

## Visual Composition

### Top rail

The header is a thin equipment rail rather than a generic tab bar:

```text
 CORVUS // LOCAL HARNESS        [ F1 CONSOLE ] [ F2 CHAT ] [ F3 CONTROL ] [ F4 SETUP ]     CTRL+K COMMANDS
                                  └──── ACTIVE ────┘
```

It uses a dark graphite base, restrained separators, and cyan only for the active segment. Amber is reserved for warnings and attention. The rail always remains at the top of the terminal.

### Command palette

The palette opens from the composer, not as a disconnected centered modal. It has a cassette-label header (`COMMAND INDEX`), a thin cyan left registration mark, and dense rows. The highlighted row uses inverse cyan; category and key hints use dim amber. This makes the relationship between typed `/` and available actions obvious.

### Responsive behavior

- At a narrow terminal width, Chat hides the inspector and shows a compact `Inspector: N approvals · N evidence` line above the composer.
- Control hides the right runtime summary first, then collapses to a single-column navigation-and-panel sequence.
- The command palette uses the available composer width and never overlays the top rail.

## Command Semantics Cleanup

- `/menu` becomes an alias for opening the command palette in interactive mode and printing the categorized command index in non-TTY mode.
- `/deck` becomes an alias for `/menu`.
- `/console` switches to Console.
- `/workspace`, `/dashboard`, and `/setup` remain navigation commands and use the mode names shown in the top rail.
- `/setting` is handled by the registry consistently; it no longer has a TUI-only interception path.
- UI claims that a panel, health check, or control is actionable only when that action is implemented. Placeholder panels are clearly labeled `VIEW ONLY` rather than inviting an unavailable Enter action.

## Test Strategy

The behavior is tested without live models or filesystem tools.

1. **Pure palette tests** (`tests/command-palette.test.ts`)
   - `/` returns every registered command;
   - `/set` ranks `/setting` first;
   - Tab completes only the command-name segment and preserves arguments;
   - Escape and empty-query Backspace preserve or clear drafts as specified;
   - exact versus partial Enter actions resolve correctly.

2. **Command bridge tests** (`tests/interactive-submit.test.ts`)
   - slash input invokes the registry and never calls the agent;
   - ordinary input invokes the agent and never the registry;
   - command output is captured as a system entry;
   - persistent command results invoke the supplied save callback exactly once.

3. **Ink component tests** (`tests/workbench-input.test.tsx`)
   - opening the palette disables composer focus;
   - palette Enter and arrows do not submit chat;
   - inputting `q` inside a composer preserves `q` and does not change surface;
   - active top-rail state changes with mode commands;
   - narrow width hides the correct secondary panel.

4. **Non-TTY regression tests** (`tests/tui.test.ts`)
   - piped `/help` and `/exit` retain their current line-mode behavior;
   - no full-screen Ink rendering occurs for a non-TTY input stream.

## Acceptance Criteria

- Typing `/` immediately shows relevant commands in interactive Console and Chat.
- Slash commands execute locally in all interactive surfaces and are never sent as chat content.
- Console, Chat, Control, and Setup have a single, visible, accurately labeled navigation model.
- Normal text editing is never hijacked by bare-letter global shortcuts.
- Palette filtering, completion, dismissal, command dispatch, non-TTY fallback, and narrow layouts have automated coverage.
- The Corvus visual language remains cassette-futurist while Pi is used only as a behavioral reference.
