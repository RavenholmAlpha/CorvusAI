# Corvus Web Control Plane

Start the authenticated local Agent platform:

```powershell
corvus --web
```

Run the control plane without opening the terminal UI:

```powershell
corvus --web-only
```

Corvus prints a one-time URL containing a random session token. The server binds to `127.0.0.1` by default.

## Product surfaces

- **Overview** — project/task/approval/memory metrics and configuration health.
- **Chat** — project conversations, session CRUD, token streaming, run activity, and stop control.
- **Projects** — register and activate project Agent runtimes.
- **Agents** — Global Orchestrator → Project Agents → Role child-task graph.
- **Tasks** — inspect and cancel durable subagent tasks.
- **Approvals** — inspect tool arguments, allow once, or deny.
- **Memory** — filter, add, obsolete, and link project memories as a graph.
- **Timeline** — searchable/filterable events, artifacts, and audit export.
- **Skills** — global and project skill registry.
- **Automations** — interval/event jobs and scheduler status.
- **Channels** — authenticated webhook ingress and outbound delivery queue.
- **Routing** — cross-project keyword routing rules.
- **Browser** — manage a configured Chrome DevTools Protocol endpoint, pages, navigation, screenshots.
- **Nodes** — local, SSH, and Docker execution node health/commands.
- **Settings** — full Provider and Role policy forms, browser/node settings, diagnostics, backup.

## Real-time protocol

`POST /api/sessions/:id/messages` returns an operation ID immediately. Subscribe to `/api/operations/:operationId/events` for `delta`, `activity`, `complete`, `failed`, and `canceled` events. Global durable events stream from `/api/events`.

## Security

- Random Web session token required for every `/api/*` request.
- Same-origin validation for browser requests.
- Content Security Policy and nosniff headers.
- Provider secrets redacted from Web state.
- `apiKeyRef: env:VARIABLE` supported.
- Webhook channels may require their own Bearer token.

## Operations

- Backup: Web Settings → Create database backup.
- Restore before startup: `corvus --restore-db <backup.db>`.
- Audit export: Timeline → Export audit.
- Select startup project: `corvus --project <name-or-id>`.
- Custom port: `corvus --web --web-port 3085`.