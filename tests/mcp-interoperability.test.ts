import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { mergeDiscoveredMcpServers, parseCodexMcpConfig, parseJsonMcpConfig } from "../src/mcp/importer.js";
import { serveCorvusMcp } from "../src/mcp/server.js";

describe("MCP interoperability", () => {
  it("parses Claude and Cursor JSON", () => { expect(parseJsonMcpConfig(JSON.stringify({ mcpServers: { git: { command: "npx", args: ["server"], env: { TOKEN: "env:GITHUB_TOKEN" } } } }))).toEqual({ git: { command: "npx", args: ["server"], env: { TOKEN: "env:GITHUB_TOKEN" } } }); });
  it("parses Codex TOML", () => { expect(parseCodexMcpConfig('[mcp_servers.git]\ncommand = "npx"\nargs = ["-y", "server"]\n[mcp_servers.git.env]\nTOKEN = "env:GITHUB_TOKEN"')).toEqual({ git: { command: "npx", args: ["-y", "server"], env: { TOKEN: "env:GITHUB_TOKEN" } } }); });
  it("keeps existing servers during idempotent merge", () => { const result = mergeDiscoveredMcpServers([{ source: "codex", path: "x", servers: { git: { command: "new" }, db: { command: "db" } } }], { git: { command: "old" } }); expect(result.servers.git.command).toBe("old"); expect(result.imported).toEqual(["db"]); expect(result.skipped).toEqual(["git"]); });
  it("serves initialize and tools/list over stdio", async () => {
    const input = new PassThrough(); const output = new PassThrough(); let text = ""; output.on("data", chunk => { text += chunk.toString(); });
    const serving = serveCorvusMcp(input, output);
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n"); input.end(); await serving;
    const responses = text.trim().split("\n").map(line => JSON.parse(line)); expect(responses[0].result.serverInfo.name).toBe("corvus"); expect(responses[1].result.tools[0].name).toBe("corvus_chat");
  });
});
