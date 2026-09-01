# Corvus Agent OS

Corvus now provides a local multi-project agent control plane inspired by mature gateway/orchestrator projects.

## Runtime hierarchy

```text
Global Orchestrator
  ├─ Project Agent Runtime (one per registered project)
  │    ├─ durable main session
  │    ├─ project memory
  │    ├─ scope leases
  │    └─ role-based child agents
  └─ Cross-project routing plan
```

## Configuration domains

- Versioned configuration (`schemaVersion: 2`) with migration and diagnostics.
- Providers: Chat Completions, OpenAI Responses, Anthropic Messages; timeout, retry, fallback chain, capability metadata.
- Roles: provider/model/system prompt, skills, tools allow/deny, scope allowlist, concurrency, context/tool-round/request/token budgets.
- Projects: durable registry, sessions, runs, tasks, memories and leases.
- Routing rules: keyword-to-project/role cross-project plans.
- Automations: interval and event trigger definitions.
- Channels: authenticated local webhook ingress using `env:` secret references.
- Secrets: `apiKeyRef: env:VARIABLE`; WebUI state is redacted.

## Local Web control plane

```powershell
corvus --web
```

Features: projects and conversations, project main-agent dispatch, global orchestrator, Providers/Roles forms, tasks and approvals, memory curation, routing, automation, webhook channels, timeline over SSE, artifacts/evidence, database backup and audit export.

## Project activation

```powershell
corvus --project CorvusAI
```

The runtime maintains independent main agents/runners per project for WebUI dispatch, automation and orchestration. TUI switching loads the selected project latest session into the foreground workspace.

## Skills

- Global: `<Corvus root>/skills/<id>/SKILL.md`
- Project override: `<project>/.corvus/skills/<id>/SKILL.md`
- Bind skill IDs in `agentRoles.<id>.skills`.

## Webhook channel

```json
{
  "channels": {
    "build-hook": {
      "id": "build-hook",
      "type": "webhook",
      "enabled": true,
      "projectId": "proj_xxx",
      "roleId": "test-reviewer",
      "tokenRef": "env:CORVUS_WEBHOOK_TOKEN"
    }
  }
}
```

Send:

```bash
curl -X POST http://127.0.0.1:3081/api/webhooks/build-hook -H "Authorization: Bearer $CORVUS_WEBHOOK_TOKEN" -H "Content-Type: application/json" -d "{\"prompt\":\"Review the failing build\"}"
```

## Backup and restore

- WebUI **Backup** creates `.corvus/backups/corvus-<timestamp>.db`.
- Restore before startup: `corvus --restore-db <backup.db>`.
- WebUI **Export audit** downloads recent events, tasks, approvals and project memories.