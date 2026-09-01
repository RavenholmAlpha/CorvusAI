# Provider, Role, and TUI setup

## Mental model

- **Provider**: a connection to one AI service. It owns protocol, endpoint, API key, default model and temperature.
- **Role**: a reusable manual assignment. It references a provider and can override its model, temperature and system prompt. Multiple roles can share the same provider.
- **Main provider**: the provider used by the main Corvus agent.
- **Task profile**: legacy compatibility path for existing `task(profile)` configurations. Prefer `task(role)` for new setups.

## TUI-first workflow

1. Start `corvus`.
2. In the persistent **CONTROL** sidebar choose **SETTINGS**, then press `Enter`.
3. Settings is a visible `SelectInput` menu. Choose **Providers & protocols**.
4. Providers is also a visible menu. Choose **Add provider**. It works even when the provider list is empty.
5. In **PROVIDER EDITOR**, use `Up/Down` for fields, `Left/Right` for protocol, `Ctrl+S` save, `Esc` cancel.
6. Return automatically to Providers. Select the visible **Set main** item for the provider you want the main agent to use.
7. Return with the visible **Back to Settings** item, `Esc`, or `Left`.
8. From Settings choose **Agent roles** to create reusable assignments that reference the configured provider.

## Provider protocols

| Protocol | Path | Typical use |
|---|---|---|
| `openai-chat` | `/chat/completions` | DeepSeek, OpenAI-compatible gateways, Gemini compatibility endpoints |
| `openai-responses` | `/responses` | OpenAI Responses API |
| `anthropic-messages` | `/messages` | Anthropic Claude Messages API |

## Role example

```json
{
  "agentRoles": {
    "frontend-designer": {
      "id": "frontend-designer",
      "label": "Frontend design",
      "providerId": "gemini",
      "model": "gemini-2.5-pro",
      "temperature": 0.4,
      "systemPrompt": "Focus on frontend UX, visual hierarchy, and interaction details."
    },
    "architecture-reviewer": {
      "id": "architecture-reviewer",
      "label": "Architecture review",
      "providerId": "openai",
      "model": "gpt-5",
      "temperature": 0.2,
      "systemPrompt": "Review architecture, risks, interfaces, and acceptance criteria."
    },
    "copy-editor": {
      "id": "copy-editor",
      "label": "Chinese product copy",
      "providerId": "deepseek",
      "model": "deepseek-chat",
      "temperature": 0.5,
      "systemPrompt": "Improve concise, natural Chinese copy while preserving technical accuracy."
    }
  }
}
```

## Delegation

```json
{
  "prompt": "Design the Settings user experience",
  "description": "Settings UX",
  "role": "frontend-designer"
}
```

`parallel_tasks` accepts `role` on each task. Provider API keys remain stored only in `.corvus/config.json`; do not commit that file with real secrets.