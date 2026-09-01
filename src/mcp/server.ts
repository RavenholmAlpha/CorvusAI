import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

interface RpcRequest { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown>; }
interface ExposedTool { name: string; description: string; inputSchema: Record<string, unknown>; call: (args: Record<string, unknown>) => Promise<unknown>; }

function runCorvus(prompt: string, project?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const executable = realpathSync(process.argv[1]);
    const args = [executable, "--print", prompt];
    if (project) args.push("--project", project);
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(stderr.trim() || `Corvus exited with code ` + code)));
  });
}

export function createCorvusMcpTools(): ExposedTool[] {
  return [{
    name: "corvus_chat",
    description: "Delegate a task to Corvus, including its multi-agent, memory and workspace tools.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Task for Corvus" }, project: { type: "string", description: "Optional Corvus project ID or name" } }, required: ["prompt"] },
    call: async (args) => {
      if (typeof args.prompt !== "string" || !args.prompt.trim()) throw new Error("prompt is required");
      return runCorvus(args.prompt, typeof args.project === "string" ? args.project : undefined);
    },
  }];
}

export async function serveCorvusMcp(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Promise<void> {
  const tools = createCorvusMcpTools();
  const send = (message: unknown) => output.write(JSON.stringify(message) + "\n");
  let buffer = "";
  const handle = async (request: RpcRequest) => {
    if (request.id === undefined) return;
    try {
      let result: unknown;
      if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "corvus", version: "0.2.1" } };
      else if (request.method === "tools/list") result = { tools: tools.map(({ call: _call, ...tool }) => tool) };
      else if (request.method === "tools/call") {
        const name = String(request.params?.name ?? "");
        const tool = tools.find((item) => item.name === name);
        if (!tool) throw new Error("Unknown tool: " + name);
        const value = await tool.call((request.params?.arguments ?? {}) as Record<string, unknown>);
        result = { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] };
      } else if (request.method === "ping") result = {};
      else throw Object.assign(new Error("Method not found: " + request.method), { code: -32601 });
      send({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      send({ jsonrpc: "2.0", id: request.id, error: { code: Number((error as { code?: number }).code ?? -32000), message: (error as Error).message } });
    }
  };
  for await (const chunk of input as AsyncIterable<Buffer | string>) {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) {
      try { await handle(JSON.parse(line) as RpcRequest); }
      catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
    }
  }
}
