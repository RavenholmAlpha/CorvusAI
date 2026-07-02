# Corvus Plugin Authoring

Plugins live under `plugins/<plugin-name>/` and need two files:

- `corvus.plugin.json`
- an ESM entry module, usually `index.mjs`

## Manifest

```json
{
  "name": "echo-plugin",
  "version": "1.0.0",
  "entry": "index.mjs"
}
```

## Entry Module

```js
export default function activate(api) {
  api.registerTool({
    name: "echo_plugin",
    description: "Echo text through a plugin.",
    capability: "local",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to echo." }
      },
      required: ["text"],
      additionalProperties: false
    },
    execute: async ({ text }) => ({ text })
  });
}
```

Tool names must use letters, numbers, `_`, or `-`. Tool execution is still governed by Corvus permissions.
