# Multi-model task profiles

Corvus keeps the main agent on the global model in `.corvus/config.json`. Delegated `task` and `parallel_tasks` calls may select a specialist profile by ID.

## Configuration

Add only the profiles you use. API keys are local secrets; never commit the config file.

```json
{
  "endpoint": "https://api.example.com/v1",
  "model": "main-planner-model",
  "apiKey": "MAIN_KEY",
  "modelProfiles": {
    "gpt-architect": {
      "id": "gpt-architect",
      "label": "Architecture and review",
      "endpoint": "https://api.openai.com/v1",
      "model": "gpt-5",
      "apiKey": "GPT_KEY",
      "temperature": 0.2,
      "roles": ["planner", "architect", "reviewer"]
    },
    "gemini-frontend": {
      "id": "gemini-frontend",
      "label": "Frontend and interaction design",
      "endpoint": "https://generativelanguage.googleapis.com/v1beta/openai",
      "model": "gemini-2.5-pro",
      "apiKey": "GEMINI_KEY",
      "temperature": 0.4,
      "roles": ["frontend", "ui"]
    },
    "deepseek-copy": {
      "id": "deepseek-copy",
      "label": "Chinese copy and concise summaries",
      "endpoint": "https://api.deepseek.com/v1",
      "model": "deepseek-chat",
      "apiKey": "DEEPSEEK_KEY",
      "temperature": 0.5,
      "roles": ["copywriter", "summarizer"]
    }
  }
}
```

## Delegation

Use an explicit profile when a task has a specialist owner:

```json
{
  "prompt": "Design a keyboard-navigable settings page",
  "description": "Settings UI",
  "profile": "gemini-frontend"
}
```

`parallel_tasks` accepts `profile` on each item. Tasks without a profile inherit the main agent model. Each task persists its selected profile in the durable task record and TUI Task Detail view.

## Safety

- The profile controls only the child model connection; it does not bypass Corvus approvals, tool policy, child session isolation, or task cancellation.
- Unknown profile IDs fail clearly instead of silently falling back.
- Before allowing parallel agents to write overlapping files, add collaboration scope leases (planned next).