export default function activate(api) {
  api.registerTool({
    name: "echo_plugin",
    description: "Echo text through the example Corvus plugin.",
    capability: "local",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to echo."
        }
      },
      required: ["text"],
      additionalProperties: false
    },
    execute: async ({ text }) => ({ text, source: "echo-plugin" })
  });
}
