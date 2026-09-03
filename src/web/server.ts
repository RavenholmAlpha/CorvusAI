import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CorvusConfig } from "../config.js";
import type { RunStore } from "../harness/run-store.js";
import type { ApprovalService } from "../harness/approval-service.js";
import type { EventLog } from "../harness/event-log.js";
import type { EvidenceStore } from "../harness/evidence-store.js";
import type { CorvusDatabase } from "../db/connection.js";
import { getConfigRoot, getGlobalSkillsRoot } from "../config.js";
import { join } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { createManagedSkill, deleteManagedSkill, loadSkills } from "../skills.js";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { BrowserRuntime } from "../browser-runtime.js";
import type { ExecutionNodeManager } from "../execution-nodes.js";
import type { ChannelDeliveryManager } from "../channels.js";
import { ProtocolChatClient, discoverProviderModels } from "../provider-client.js";
import { validateConfig } from "../config-schema.js";
import { mergePreservingSecrets, redactSecrets, resolveSecret } from "../secrets.js";
import { applyPermissionPreset, BUNDLES, type BundleId, type PermissionPreset } from "../bundles.js";
import type { BundleService } from "../bundle-service.js";
import { normalizeWebhookMessage } from "../channel-events.js";
import { ChannelInboundRegistry, SlackInboundAdapter, TelegramInboundAdapter } from "../channel-inbound.js";
import { deleteStoredSecret, listStoredSecrets, setStoredSecret } from "../secret-store.js";
import { metrics } from "../metrics.js";
import { buildAgentHierarchy } from "../agent-hierarchy.js";
import type { PluginManagementService } from "../plugin-management.js";
import type { McpServerConfig } from "../mcp/client.js";
import { discoverMcpConfigs, mergeDiscoveredMcpServers } from "../mcp/importer.js";

export interface WebControlPlaneOptions {
  config: CorvusConfig;
  runs: RunStore;
  approvals: ApprovalService;
  getToolCall?: (toolCallId: string) => unknown;
  events?: EventLog;
  evidence?: EvidenceStore;
  db?: CorvusDatabase;
  plugins?: unknown[];
  listMcp?: () => unknown[];
  reloadMcp?: () => Promise<unknown[]>;
  testMcp?: (name: string, config: McpServerConfig) => Promise<unknown>;
  saveConfig: () => Promise<void>;
  host?: string;
  port?: number;
  auth?: boolean;
  activeProjectId?: () => string;
  selectProject?: (projectId: string) => Promise<boolean>;
  dispatchProjectMessage?: (projectId: string, prompt: string, roleId?: string) => Promise<{ runId?: string; content: string; pendingApprovals?: number }>;
  resolveApproval?: (approvalId: string, decision: "allow" | "deny", scope: "once" | "always" | "never") => Promise<{ resumed: boolean; runId: string; sessionId: string | null }>;
  orchestrate?: (prompt: string) => Promise<unknown>;
  automationStates?: () => unknown[];
  cancelTask?: (taskId: string) => Promise<void>;
  cancelRun?: (runId: string) => Promise<void>;
  resumeRun?: (runId: string) => Promise<void>;
  browser?: BrowserRuntime;
  nodes?: ExecutionNodeManager;
  channelDeliveries?: ChannelDeliveryManager;
  sendSessionMessage?: (sessionId: string, prompt: string, onChunk?: (text: string) => void, signal?: AbortSignal) => Promise<unknown>;
  getContextUsage?: (sessionId?: string, projectId?: string) => unknown;
  pluginManagement?: PluginManagementService;
  reloadAutomations?: () => void;
  runAutomation?: (id: string) => Promise<void>;
  bundles?: BundleService;
  indexMemory?: (memory: import("../harness/types.js").ProjectMemoryRow) => Promise<void>;
  dispatchSessionMessage?: (sessionId: string, prompt: string, roleId?: string) => Promise<unknown>;
  switchSessionModel?: (sessionId: string, providerId: string, model: string) => Promise<unknown> | unknown;
  spawnSessionTask?: (sessionId: string, prompt: string, description?: string, roleId?: string) => Promise<unknown>;
}

const SECURITY_HEADERS = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "permissions-policy": "camera=(), microphone=(), geolocation=()", "cache-control": "no-store" };
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0; const maxBytes = 1024 * 1024;
  for await (const chunk of req) { const value=Buffer.from(chunk); size += value.length; if(size>maxBytes) throw Object.assign(new Error("Request body exceeds 1 MiB"),{code:"PAYLOAD_TOO_LARGE"}); chunks.push(value); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : {};
}

const html = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><title>Corvus Control Plane</title>
<style>body{font:14px system-ui;background:#101114;color:#e7e7e7;margin:0}header{padding:16px 24px;border-bottom:1px solid #333;display:flex;justify-content:space-between}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:16px}.card{border:1px solid #333;background:#18191d;border-radius:8px;padding:12px}h2{margin:0 0 8px;color:#ffaf00;font-size:16px}button{background:#ffaf00;border:0;border-radius:4px;padding:7px 10px;margin:4px;cursor:pointer}.item{border-top:1px solid #2b2c31;padding:8px 0;white-space:pre-wrap}.muted{color:#aaa}form{display:grid;gap:6px;margin-top:8px}input,select,textarea{background:#101114;color:#eee;border:1px solid #444;border-radius:4px;padding:7px}textarea{min-height:64px}summary{cursor:pointer;color:#ffaf00;margin-top:8px}</style></head>
<body><header><b>CORVUS · LOCAL CONTROL PLANE</b><span id="status">Loading…</span><button onclick="orchestrate()">◆ Global Orchestrator</button><button onclick="dispatchTask()">▶ Dispatch to active project</button><button onclick="backup()">Backup</button><button onclick="location.href='/api/audit/export'">Export audit</button></header>
<main><section class="card"><h2>Projects</h2><div id="projects"></div><button onclick="addProject()">＋ Register project</button></section><section class="card"><h2>Conversations</h2><div id="sessions"></div><button onclick="addSession()">＋ New conversation</button></section><section class="card"><h2>Conversation Detail</h2><div id="messages"></div><button onclick="sendConversation()">▶ Send message</button></section>
<section class="card"><h2>Providers</h2><div id="providers"></div><details><summary>Add provider</summary><form id="providerForm"><input name="id" placeholder="ID" required><input name="label" placeholder="Label"><select name="protocol"><option>openai-chat</option><option>openai-responses</option><option>anthropic-messages</option></select><input name="endpoint" placeholder="Endpoint" required><input name="model" placeholder="Default model" required><input name="apiKey" type="password" placeholder="API key"><button>Add provider</button></form></details></section><section class="card"><h2>Roles</h2><div id="roles"></div><details><summary>Add role</summary><form id="roleForm"><input name="id" placeholder="Role ID" required><input name="label" placeholder="Label"><input name="providerId" placeholder="Provider ID" required><input name="model" placeholder="Model override"><textarea name="systemPrompt" placeholder="System prompt"></textarea><button>Add role</button></form></details></section>
<section class="card"><h2>Channels / Webhooks</h2><div id="channels"></div><details><summary>Add webhook</summary><form id="channelForm"><input name="id" placeholder="Channel ID" required><input name="projectId" placeholder="Project ID (optional with orchestrator)"><input name="roleId" placeholder="Role ID"><input name="tokenRef" placeholder="Secret ref e.g. env:CORVUS_WEBHOOK_TOKEN"><select name="useOrchestrator"><option value="false">Direct project</option><option value="true">Global orchestrator</option></select><button>Add channel</button></form></details></section><section class="card"><h2>Routing Rules</h2><div id="routing"></div><details><summary>Add routing rule</summary><form id="routingForm"><input name="id" placeholder="Rule ID" required><input name="keywords" placeholder="Keywords, comma separated"><input name="projectIds" placeholder="Project IDs, comma separated"><input name="roleId" placeholder="Role ID"><input name="priority" type="number" value="0"><button>Add route</button></form></details></section><section class="card"><h2>Automations</h2><div id="automations"></div><details><summary>Add automation</summary><form id="automationForm"><input name="id" placeholder="Automation ID" required><input name="projectId" placeholder="Project ID" required><input name="roleId" placeholder="Role ID (optional)"><input name="everySeconds" type="number" value="3600"><textarea name="prompt" placeholder="Task prompt" required></textarea><button>Add automation</button></form></details></section><section class="card"><h2>Configuration Diagnostics</h2><div id="diagnostics"></div></section><section class="card"><h2>Timeline</h2><div id="timeline"></div></section><section class="card"><h2>Artifacts / Evidence</h2><div id="artifacts"></div></section><section class="card"><h2>Tasks</h2><div id="tasks"></div></section><section class="card"><h2>Approvals</h2><div id="approvals"></div></section><section class="card"><h2>Project Memory</h2><div id="memories"></div></section></main>
<script>
let selectedProjectId="";let selectedSessionId="";const esc = value => String(value ?? "").replace(/[&<>]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;"})[char]);
const list = (id, items, render) => document.getElementById(id).innerHTML = items.map(render).join("") || "<span class=muted>None</span>";
async function refresh(){ const data = await fetch("/api/state").then(r=>r.json()); document.getElementById("status").textContent = "Projects " + data.projects.length + " · approvals " + data.approvals.length;
if(!selectedProjectId)selectedProjectId=data.activeProjectId||data.projects[0]?.id||"";list("projects", data.projects, p => "<div class=item><button onclick=\"selectProject('"+p.id+"')\">"+(p.id===selectedProjectId?"● ":"  ")+esc(p.name)+"</button><br><span class=muted>"+esc(p.path)+"</span></div>");
list("providers", Object.values(data.providers), p => "<div class=item><b>"+esc(p.label||p.id)+"</b><br>"+esc(p.protocol)+" · "+esc(p.defaultModel||(p.models||[])[0]||"no model")+(p.id===data.mainProviderId?" · MAIN":"")+"</div>");
list("roles", Object.values(data.roles), r => "<div class=item><b>"+esc(r.label||r.id)+"</b><br>"+esc(r.providerId)+(r.model?" / "+esc(r.model):"")+"</div>");
list("timeline", data.timeline, e => "<div class=item><b>"+esc(e.type)+"</b><br><span class=muted>"+esc(e.createdAt)+" · "+esc(e.runId||"")+"</span></div>");list("artifacts", data.artifacts, a => "<div class=item><b>"+esc(a.title)+"</b><br>"+esc(a.summary)+"</div>");list("channels", Object.values(data.channels), c => "<div class=item><b>"+esc(c.id)+"</b><br>POST /api/webhooks/"+esc(c.id)+" · "+(c.useOrchestrator?"orchestrator":esc(c.projectId||"no project"))+"</div>");list("routing", Object.values(data.routingRules), r => "<div class=item><b>"+esc(r.id)+"</b><br>"+esc((r.keywords||[]).join(", "))+" → "+esc((r.projectIds||[]).join(", "))+"</div>");list("automations", Object.values(data.automations), a => "<div class=item><b>"+esc(a.enabled?"● ":"○ ")+esc(a.label||a.id)+"</b><br>"+esc(a.projectId)+" · "+esc(a.trigger.type)+"</div>");list("diagnostics", data.diagnostics, d => "<div class=item><b>["+esc(d.level)+"] "+esc(d.path)+"</b><br>"+esc(d.message)+"</div>");list("tasks", data.tasks, t => "<div class=item><b>["+esc(t.status)+"] "+esc(t.description||t.prompt||"")+"</b><br><span class=muted>"+esc(t.modelProfile||"default")+" · depth "+t.depth+"</span>"+(t.status==="running"?"<br><button onclick=\"cancelTask(\'"+t.id+"\')\">Cancel</button>":"")+"</div>");
list("approvals", data.approvals, a => "<div class=item><b>"+esc(a.toolName||"tool")+"</b><br><span class=muted>run "+esc(a.runId)+"</span><br><button onclick=\"resolveApproval('"+a.id+"','allow')\">Allow once</button><button onclick=\"resolveApproval('"+a.id+"','deny')\">Deny</button></div>");
list("memories", data.memories, m => "<div class=item><b>"+esc(m.title)+"</b><br>"+esc((m.content||"").slice(0,300))+"<br><button onclick=\"obsoleteMemory('"+m.id+"')\">Mark obsolete</button></div>"); if(selectedProjectId){const sessions=await fetch("/api/projects/"+selectedProjectId+"/sessions").then(r=>r.json());list("sessions",sessions,s=>"<div class=item><button onclick=\"selectSession('"+s.id+"')\">"+(s.id===selectedSessionId?"● ":"  ")+esc(s.name||s.preview||s.id)+"</button><br><span class=muted>"+s.messageCount+" messages</span></div>");if(selectedSessionId){const messages=await fetch("/api/sessions/"+selectedSessionId+"/messages").then(r=>r.json());list("messages",messages,m=>"<div class=item><b>"+esc(m.role)+"</b><br>"+esc(m.content||"")+"</div>")}} }
async function api(path,body){return fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body||{})}).then(r=>r.json())}async function selectProject(id){selectedProjectId=id;selectedSessionId="";await api("/api/projects/active",{projectId:id});refresh()}async function selectSession(id){selectedSessionId=id;refresh()}async function addSession(){if(selectedProjectId){const name=prompt("Conversation name");await api("/api/projects/"+selectedProjectId+"/sessions",{name:name||undefined});refresh()}}async function getState(){return fetch("/api/state").then(r=>r.json())}async function obsoleteMemory(id){await api("/api/memories/"+id+"/obsolete",{});refresh()}async function cancelTask(id){await api("/api/tasks/"+id+"/cancel",{});refresh()}async function sendConversation(){if(!selectedSessionId)return;const text=prompt("Message for this conversation");if(text){const result=await api("/api/sessions/"+selectedSessionId+"/send",{prompt:text});alert(result.content||result.error);refresh();}}async function resolveApproval(id,decision){const result=await api("/api/approvals/"+id,{decision:decision});if(result.error)alert(result.error);refresh()}async function backup(){const result=await api("/api/backup",{});alert(result.path||result.error)}async function addAutomation(){const state=await getState();const id=prompt("Automation ID");const projectId=prompt("Project ID",state.activeProjectId||"");const promptText=prompt("Task prompt");const seconds=Number(prompt("Interval seconds","3600"));if(id&&projectId&&promptText){await api("/api/automations",{id:id,projectId:projectId,prompt:promptText,everySeconds:seconds||3600});refresh();}}async function addProject(){const name=prompt("Project name");const path=prompt("Project path");if(name&&path){await api("/api/projects",{name:name,path:path});refresh();}}async function orchestrate(){const promptText=prompt("Cross-project objective");if(promptText){const result=await api("/api/orchestrate",{prompt:promptText});alert(JSON.stringify(result,null,2));refresh();}}async function dispatchTask(){const state=await getState();const projectId=state.activeProjectId||state.projects[0]?.id;const prompt=prompt("Message for project main agent");if(projectId&&prompt){const result=await api("/api/dispatch",{projectId:projectId,prompt:prompt});alert(result.content||result.error);refresh();}}async function addProvider(){const id=prompt("Provider ID");const endpoint=prompt("Endpoint","https://api.openai.com/v1");const model=prompt("Default model","gpt-4.1-mini");const apiKey=prompt("API key");if(id&&endpoint&&model){await api("/api/providers",{id:id,label:id,protocol:"openai-chat",endpoint:endpoint,model:model,apiKey:apiKey||""});refresh();}}async function addRole(){const state=await getState();const providerId=prompt("Provider ID",state.mainProviderId||"");const id=prompt("Role ID");if(id&&providerId){await api("/api/roles",{id:id,label:id,providerId:providerId});refresh();}}
function formData(form){return Object.fromEntries(new FormData(form).entries())}document.getElementById("providerForm").onsubmit=async e=>{e.preventDefault();await api("/api/providers",formData(e.target));e.target.reset();refresh()};document.getElementById("roleForm").onsubmit=async e=>{e.preventDefault();await api("/api/roles",formData(e.target));e.target.reset();refresh()};document.getElementById("channelForm").onsubmit=async e=>{e.preventDefault();await api("/api/channels",formData(e.target));e.target.reset();refresh()};document.getElementById("routingForm").onsubmit=async e=>{e.preventDefault();await api("/api/routing",formData(e.target));e.target.reset();refresh()};document.getElementById("automationForm").onsubmit=async e=>{e.preventDefault();await api("/api/automations",formData(e.target));e.target.reset();refresh()};refresh();setInterval(refresh,1500);const events=new EventSource("/api/events");events.addEventListener("timeline",()=>refresh());
</script></body></html>`;

const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "webui");
const webDistDev = resolve(process.cwd(), "dist", "webui");
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

function routeFeature(pathname: string): string | undefined {
  if (pathname.startsWith("/api/mcp")) return "mcp-client";
  if (pathname.startsWith("/api/browser")) return "browser";
  if (pathname.startsWith("/api/nodes")) return "execution-nodes";
  if (pathname.startsWith("/api/automations")) return "scheduler";
  if (pathname.startsWith("/api/channels") || pathname.startsWith("/api/webhooks")) return "channels";
  if (pathname.startsWith("/api/orchestrate") || pathname.startsWith("/api/routing")) return "workspaces";
  if (pathname.startsWith("/api/memories") || pathname.startsWith("/api/memory-links")) return "memory";
  return undefined;
}

function capabilityPages(features: string[]): Array<{ id: string; enabled: boolean; feature?: string }> {
  const required: Record<string,string> = { agents: "delegation", tasks: "delegation", memory: "memory", skills: "skills", automations: "scheduler", channels: "channels", routing: "workspaces", browser: "browser", nodes: "execution-nodes", integrations: "mcp-client" };
  return ["overview","chat","projects","agents","tasks","approvals","memory","timeline","skills","automations","channels","routing","browser","nodes","integrations","installation","secrets","settings"].map((id)=>({id,enabled:!required[id]||features.includes(required[id]),...(required[id]?{feature:required[id]}:{})}));
}

export function startWebControlPlane(options: WebControlPlaneOptions): Promise<{ url: string; accessUrl: string; close: () => Promise<void> }> {
  const accessToken = randomUUID().replace(/-/g, "");
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3081;
  const operationListeners = new Map<string, Set<ServerResponse>>();
  const operationHistory = new Map<string, Array<{ event: string; data: unknown }>>();
  const operationRunIds = new Map<string, string>();
  const operationSessionIds = new Map<string, string>();
  const operationControllers = new Map<string, AbortController>();
  const webhookNonces = new Map<string, number>();
  const rateLimits = new Map<string,{window:number,count:number}>();
  const inboundAdapters=new ChannelInboundRegistry();inboundAdapters.register(new TelegramInboundAdapter());inboundAdapters.register(new SlackInboundAdapter());
  const emitOperation = (id: string, event: string, data: unknown) => {
    const item = { event, data };
    const history = operationHistory.get(id) ?? []; history.push(item); operationHistory.set(id, history.slice(-500));
    for (const response of operationListeners.get(id) ?? []) response.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
  };
  const unsubscribeRuntimeEvents = options.events?.onEvent((event) => {
    for (const [operationId, sessionId] of operationSessionIds) {
      if (event.type === "run.created" && event.payload.sessionId === sessionId && event.runId) operationRunIds.set(operationId, event.runId);
      if (event.runId && operationRunIds.get(operationId) === event.runId) emitOperation(operationId, "activity", event);
    }
  });
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://" + host);
      const requestStarted=Date.now();metrics.inc("corvus_http_requests_total",{method:req.method??"GET",route:requestUrl.pathname});res.once("finish",()=>{metrics.inc("corvus_http_responses_total",{method:req.method??"GET",route:requestUrl.pathname,status:res.statusCode});metrics.set("corvus_http_last_duration_ms",Date.now()-requestStarted,{route:requestUrl.pathname})});
      const requiredFeature = routeFeature(requestUrl.pathname);
      if (requiredFeature && !(options.config.installation?.features ?? []).includes(requiredFeature)) { send(res, 404, { error: { code: "CAPABILITY_DISABLED", feature: requiredFeature, message: requiredFeature + " is not enabled in the current bundle" } }); return; }
      if (requestUrl.pathname.startsWith("/api/")) {
        const key = req.socket.remoteAddress ?? "unknown", now = Date.now(), current = rateLimits.get(key);
        const isLoopback = key === "127.0.0.1" || key === "::1" || key === "::ffff:127.0.0.1" || key === "localhost" || key === "unknown";
        const limit = isLoopback ? 5000 : 600;
        if (!current || now - current.window >= 60_000) rateLimits.set(key, { window: now, count: 1 });
        else {
          current.count++;
          if (current.count > limit) {
            send(res, 429, { error: "Rate limit exceeded" });
            return;
          }
        }
      }
      if (options.auth !== false && requestUrl.pathname.startsWith("/api/")) {
        const supplied = req.headers["x-corvus-token"] ?? requestUrl.searchParams.get("token");
        if (supplied !== accessToken) { send(res, 401, { error: "Unauthorized" }); return; }
        const origin = req.headers.origin;
        if (origin && origin !== "http://" + host + ":" + (server.address() as any)?.port) { send(res, 403, { error: "Origin rejected" }); return; }
      }
      if (requestUrl.pathname === "/" || requestUrl.pathname.startsWith("/assets/")) {
        const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
        const assetPath = resolve(webDist, relativePath);
        try {
          if (!assetPath.startsWith(webDist)) throw new Error("Invalid asset path");
          let content: Buffer;
          try { content = await readFile(assetPath); } catch { content = await readFile(resolve(webDistDev, relativePath)); }
          res.writeHead(200, { "content-type": mime[extname(assetPath)] ?? "application/octet-stream", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
          res.end(content);
        } catch {
          if (requestUrl.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); }
          else send(res, 404, { error: "Asset not found" });
        }
        return;
      }
      if (requestUrl.pathname === "/api/mcp/config" && req.method === "GET") { send(res, 200, { servers: redactSecrets(options.config.mcpServers ?? {}), runtime: options.listMcp?.() ?? [] }); return; }
      if (requestUrl.pathname === "/api/mcp/config" && req.method === "POST") {
        const body = await readJson(req); const id = String(body.id ?? "").trim(); const serverConfig = body.config as McpServerConfig;
        if (!/^[a-zA-Z0-9_-]+$/.test(id) || !serverConfig || typeof serverConfig !== "object" || (Boolean(serverConfig.command) === Boolean(serverConfig.url))) { send(res, 400, { error: "Valid MCP id and exactly one of command or url are required" }); return; }
        if (options.config.mcpServers?.[id]) { send(res, 409, { error: "MCP server already exists: " + id }); return; }
        options.config.mcpServers = { ...(options.config.mcpServers ?? {}), [id]: serverConfig }; await options.saveConfig(); const runtime = await options.reloadMcp?.(); send(res, 201, { id, config: redactSecrets(serverConfig), runtime }); return;
      }
      const mcpConfigMatch = requestUrl.pathname.match(/^\/api\/mcp\/config\/([^/]+)$/);
      if (mcpConfigMatch && (req.method === "PUT" || req.method === "DELETE")) {
        const id = decodeURIComponent(mcpConfigMatch[1]); if (!/^[a-zA-Z0-9_-]+$/.test(id)) { send(res, 400, { error: "Invalid MCP id" }); return; }
        const servers = { ...(options.config.mcpServers ?? {}) };
        if (req.method === "PUT") { const body = await readJson(req); const serverConfig = (body.config ?? body) as McpServerConfig; servers[id] = serverConfig; } else delete servers[id];
        options.config.mcpServers = servers; await options.saveConfig(); const runtime = await options.reloadMcp?.(); send(res, 200, { id, removed: req.method === "DELETE", runtime }); return;
      }
      if (requestUrl.pathname === "/api/mcp/test" && req.method === "POST") { const body = await readJson(req); const id = String(body.id ?? "test"); const serverConfig = (body.config ?? options.config.mcpServers?.[id]) as McpServerConfig | undefined; if (!serverConfig || (Boolean(serverConfig.command) === Boolean(serverConfig.url))) { send(res, 400, { error: "MCP test requires exactly one of command or url" }); return; } const result = await options.testMcp?.(id, serverConfig) ?? { status: "failed", error: "MCP test unavailable" }; send(res, (result as {status?:string}).status === "failed" ? 502 : 200, result); return; }
      if (requestUrl.pathname === "/api/mcp/reload" && req.method === "POST") { send(res, 200, { runtime: await options.reloadMcp?.() ?? [] }); return; }
      if (requestUrl.pathname === "/api/mcp/import" && (req.method === "GET" || req.method === "POST")) {
        const allDiscovered = await discoverMcpConfigs(process.cwd()); const requestedSource = req.method === "POST" ? String((await readJson(req)).source ?? "all") : "all"; const discovered = requestedSource === "all" ? allDiscovered : allDiscovered.filter(item => requestedSource === "claude" ? item.source === "claude-desktop" : requestedSource === "cursor" ? item.source.startsWith("cursor-") : item.source === requestedSource); const merged = mergeDiscoveredMcpServers(discovered, options.config.mcpServers);
        if (req.method === "GET") { send(res, 200, { discovered, ...merged }); return; }
        const dryRun = false; if (!dryRun && merged.imported.length) { options.config.mcpServers = merged.servers; await options.saveConfig(); await options.reloadMcp?.(); }
        send(res, 200, { discovered, ...merged, dryRun, runtime: options.listMcp?.() ?? [] }); return;
      }
      if (requestUrl.pathname === "/api/v1/metrics" && req.method === "GET") { res.writeHead(200,{"content-type":"text/plain; version=0.0.4",...SECURITY_HEADERS});res.end(metrics.render());return; }
      if (requestUrl.pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write("event: ready\ndata: {}\n\n");
        const unsubscribe = options.events?.onEvent((event) => res.write("event: timeline\ndata: " + JSON.stringify(event) + "\n\n"));
        const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
        req.on("close", () => { clearInterval(heartbeat); unsubscribe?.(); res.end(); });
        return;
      }
      if (requestUrl.pathname === "/api/v1/runtime/capabilities" && req.method === "GET") {
        send(res, 200, { serverVersion: "0.2.1", bundle: options.config.installation, features: options.config.installation?.features ?? [], pages: capabilityPages(options.config.installation?.features ?? []) }); return;
      }
      if (requestUrl.pathname === "/api/v1/bundles/catalog" && req.method === "GET") { send(res, 200, options.bundles?.catalog() ?? { schemaVersion: 1, presets: Object.values(BUNDLES) }); return; }
      if (requestUrl.pathname === "/api/v1/bundles/current" && req.method === "GET") { send(res, 200, options.bundles ? await options.bundles.current() : options.config.installation); return; }
      if (requestUrl.pathname === "/api/v1/bundles/plan" && req.method === "POST") { if(!options.bundles)throw new Error("Bundle service unavailable");const body=await readJson(req);send(res,200,await options.bundles.plan(String(body.preset) as BundleId,Array.isArray(body.components)?body.components.map(String):undefined));return; }
      if (requestUrl.pathname === "/api/v1/bundles/apply" && req.method === "POST") { if(!options.bundles)throw new Error("Bundle service unavailable");const body=await readJson(req);const state=await options.bundles.apply(String(body.planId),Number(body.expectedRevision),"webui");send(res,202,{state,restartRequired:true});return; }
      if (requestUrl.pathname === "/api/v1/secrets" && req.method === "GET") { send(res,200,(await listStoredSecrets()).map(name=>({name,configured:true})));return; }
      if (requestUrl.pathname === "/api/v1/secrets" && req.method === "POST") { const body=await readJson(req);const name=String(body.name??""),value=String(body.value??"");if(!name||!value)throw new Error("Secret name and value are required");await setStoredSecret(name,value);send(res,201,{name,configured:true});return; }
      const secretDelete=requestUrl.pathname.match(/^\/api\/v1\/secrets\/([^/]+)$/);if(secretDelete&&req.method==="DELETE"){await deleteStoredSecret(decodeURIComponent(secretDelete[1]));send(res,200,{ok:true});return;}
      if (requestUrl.pathname === "/api/v1/plugins" && req.method === "GET") { send(res,200,await options.pluginManagement?.list()??[]); return; }
      const pluginAction=requestUrl.pathname.match(/^\/api\/v1\/plugins\/([^/]+)\/(enable|disable|grant|revoke|configure)$/);
      if(pluginAction&&req.method==="POST"){if(!options.pluginManagement)throw new Error("Plugin management unavailable");const body=await readJson(req);const id=decodeURIComponent(pluginAction[1]);if(pluginAction[2]==="enable")await options.pluginManagement.enable(id);else if(pluginAction[2]==="disable")await options.pluginManagement.disable(id);else if(pluginAction[2]==="grant")await options.pluginManagement.grant(id,(body.capabilities as string[])??[]);else if(pluginAction[2]==="revoke")await options.pluginManagement.revoke(id,(body.capabilities as string[])??[]);else await options.pluginManagement.configure(id,body.config??{});send(res,200,{ok:true,restartRequired:true});return;}
      if (requestUrl.pathname === "/api/v1/agents/tree" && req.method === "GET") { send(res,200,buildAgentHierarchy(options.runs));return; }
      if (requestUrl.pathname === "/api/v1/dispatches" && req.method === "POST") { const body=await readJson(req);const target=body.target as Record<string,unknown>|undefined;const kind=String(target?.kind??""),id=target?.id?String(target.id):undefined,prompt=String(body.prompt??"").trim(),description=body.description?String(body.description):undefined,roleId=body.roleId?String(body.roleId):undefined,mode=String(body.mode??"message");if(!prompt)throw new Error("Dispatch prompt is required");let result:unknown;if(kind==="global"){if(!options.orchestrate)throw new Error("Global orchestrator unavailable");result=await options.orchestrate(prompt);}else if(kind==="project"&&id){if(!options.dispatchProjectMessage)throw new Error("Project dispatch unavailable");result=await options.dispatchProjectMessage(id,prompt,roleId);}else if(kind==="session"&&id){if(mode==="spawn"){if(!options.spawnSessionTask)throw new Error("Session task spawning unavailable");result=await options.spawnSessionTask(id,prompt,description,roleId);}else{if(!options.dispatchSessionMessage)throw new Error("Session dispatch unavailable");result=await options.dispatchSessionMessage(id,prompt,roleId);}}else throw new Error("Dispatch target must be global, project or session");options.events?.append("dispatch.accepted",{kind,id,prompt,description,roleId,mode});send(res,202,result);return; }
      if (requestUrl.pathname === "/api/state" && req.method === "GET") {
        const projects = options.runs.listProjects();
        const activeProjectId = options.activeProjectId?.() ?? projects[0]?.id;
        const active = activeProjectId ? options.runs.getProject(activeProjectId) : undefined;
        const skills = [...(await loadSkills(getGlobalSkillsRoot(), active?.path)).values()].map((skill) => ({ id: skill.id, name: skill.name, title: skill.title, description: skill.description, triggers: skill.triggers, toolsRequired: skill.toolsRequired, tier: skill.tier, isBuiltin: skill.isBuiltin, source: skill.source }));
        const usageEvents = options.events?.listRecent(1000).filter((event) => event.type === "model.usage") ?? [];
        const usage = usageEvents.reduce((total, event) => ({ promptTokens: total.promptTokens + Number(event.payload.promptTokens ?? 0), completionTokens: total.completionTokens + Number(event.payload.completionTokens ?? 0), requests: total.requests + 1 }), { promptTokens: 0, completionTokens: 0, requests: 0 });
        const masterSessions = options.runs.listMasterSessions();
        const masterSessionId = options.runs.getLatestMasterSession()?.id ?? null;
        const activeOperations: Record<string, string> = {};
        for (const [opId, sId] of operationSessionIds) {
          if (operationControllers.has(opId)) activeOperations[sId] = opId;
        }
        send(res, 200, { activeOperations, activeConnection: options.config.mainProviderId && options.config.providers?.[options.config.mainProviderId] ? { providerId: options.config.mainProviderId, label: options.config.providers[options.config.mainProviderId].label ?? options.config.mainProviderId, protocol: options.config.providers[options.config.mainProviderId].protocol, endpoint: options.config.providers[options.config.mainProviderId].endpoint, model: options.config.providers[options.config.mainProviderId].defaultModel ?? options.config.providers[options.config.mainProviderId].models[0] } : { providerId: null, label: "Legacy global", protocol: "openai-chat", endpoint: options.config.endpoint, model: options.config.model }, plugins: options.plugins ?? [], mcp: Object.entries(options.config.mcpServers ?? {}).map(([name, server]) => ({ name, ...redactSecrets(server), ...(options.listMcp?.().find((item: any) => item.name === name) as object ?? {}) })), usage, webLocale: options.config.webLocale ?? "en", maxToolRounds: options.config.maxToolRounds, contextOverflowMode: options.config.contextOverflowMode, permissionPreset: options.config.installation?.permissionPreset ?? "balanced", maxConsecutiveIdenticalToolCalls: options.config.maxConsecutiveIdenticalToolCalls ?? 0, loopProtection: Boolean(options.config.loopProtection), browser: options.config.browser ?? {}, executionNodes: options.config.executionNodes ?? {}, deliveries: options.channelDeliveries?.list(50) ?? [], skills, timeline: options.events?.listRecent(50) ?? [], artifacts: options.evidence?.listRecent(50) ?? [], diagnostics: validateConfig(options.config), automations: options.config.automations ?? {}, automationStates: options.automationStates?.() ?? [], routingRules: options.config.routingRules ?? {}, channels: redactSecrets(options.config.channels ?? {}), activeProjectId, projects, providers: redactSecrets(options.config.providers ?? {}), roles: options.config.agentRoles ?? {}, mainProviderId: options.config.mainProviderId, tasks: options.runs.listSubagentTasks(), allSessions: options.runs.listSessions(), masterSessions, masterSessionId, approvals: options.approvals.listPending().map((approval) => ({ ...approval, sessionId: options.runs.getRun(approval.runId)?.sessionId ?? null, toolCall: options.getToolCall?.(approval.toolCallId) })), sessions: active ? options.runs.listSessions(active.id) : [], memories: options.runs.listProjectMemories(undefined, 500), memoryLinks: options.runs.listProjectMemoryLinks(undefined) });
        return;
      }
      if (requestUrl.pathname === "/api/projects" && req.method === "POST") {
        const body = await readJson(req);
        send(res, 201, options.runs.createProject(String(body.name), String(body.path)));
        return;
      }
      if (requestUrl.pathname === "/api/skills" && req.method === "POST") {
        const body = await readJson(req); const id = String(body.id ?? ""); if (body.scope !== "global" && body.scope !== "project") { send(res, 400, { error: "Skill scope must be global or project" }); return; } const tier = body.scope === "project" ? "workspace" : "global"; const active = options.activeProjectId?.(); const requestedProject = body.projectId ? options.runs.getProject(String(body.projectId)) : active ? options.runs.getProject(active) : undefined; if (tier === "workspace" && !requestedProject) { send(res, 400, { error: "A valid projectId is required for project skills" }); return; } const workspace = requestedProject?.path;
        const name = String(body.name ?? body.title ?? id); const triggers = Array.isArray(body.triggers) ? body.triggers.map(String) : []; const toolsRequired = Array.isArray(body.toolsRequired) ? body.toolsRequired.map(String) : []; const content = "---\nname: " + name + "\ntriggers: [" + triggers.join(", ") + "]\ntools_required: [" + toolsRequired.join(", ") + "]\n---\n" + String(body.body ?? "# " + name);
        send(res, 201, await createManagedSkill({ id, content, tier, globalRoot: getGlobalSkillsRoot(), workspace })); return;
      }
      const skillDelete = requestUrl.pathname.match(/^\/api\/skills\/([^/]+)$/);
      if (skillDelete && req.method === "DELETE") { const id = decodeURIComponent(skillDelete[1]); const active = options.activeProjectId?.(); const workspace = active ? options.runs.getProject(active)?.path : undefined; const loaded = (await loadSkills(getGlobalSkillsRoot(), workspace)).get(id); if (!loaded || loaded.tier === "builtin") { send(res, 404, { error: "Deletable skill not found" }); return; } send(res, 200, await deleteManagedSkill({ id, tier: loaded.tier === "workspace" ? "workspace" : "global", globalRoot: getGlobalSkillsRoot(), workspace })); return; }
      const projectSummary = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/summary$/);
      if (projectSummary && req.method === "GET") { const target = options.runs.getProject(decodeURIComponent(projectSummary[1])); if (!target) { send(res, 404, { error: "Project not found" }); return; } let branch = "unknown", status = "", gitAvailable = false; try { const git = await import("node:child_process"); const util = await import("node:util"); const exec = util.promisify(git.execFile); const values = await Promise.all([exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: target.path }), exec("git", ["status", "--short"], { cwd: target.path })]); branch = values[0].stdout.trim(); status = values[1].stdout.trim(); gitAvailable = true; } catch {} const architecture = options.runs.listProjectMemories(target.id, 100).find(item => item.kind === "architecture"); const pending = options.runs.listSubagentTasks().filter(task => task.projectId === target.id && !["succeeded","failed","canceled"].includes(task.status)); send(res, 200, { branch, gitAvailable, clean: gitAvailable ? !status : null, changedFiles: status ? status.split(/\r?\n/).length : 0, ahead: 0, behind: 0, summary: pending.length + " pending task(s)", tasks: pending, architecture }); return; }
      const projectManage = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectManage && req.method === "POST") { const id = decodeURIComponent(projectManage[1]); const target = options.runs.getProject(id); if (!target) { send(res, 404, { error: "Project not found" }); return; } send(res, 200, { ok: true, project: target }); return; }
      if (projectManage && req.method === "DELETE") { const id = decodeURIComponent(projectManage[1]); if (id === options.activeProjectId?.()) { send(res, 409, { error: "Cannot unregister the active workspace" }); return; } const target = options.runs.getProject(id); if (!target) { send(res, 404, { error: "Project not found" }); return; } options.runs.deleteProject(id); send(res, 200, { ok: true, removed: target }); return; }
      if (requestUrl.pathname === "/api/master/sessions" && req.method === "GET") {
        send(res, 200, options.runs.listMasterSessions());
        return;
      }
      if (requestUrl.pathname === "/api/master/sessions" && req.method === "POST") {
        const body = await readJson(req);
        send(res, 201, options.runs.createSession(null, body.name ? String(body.name) : "Master Central Conversation"));
        return;
      }
      const sessionMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/sessions$/);
      if (sessionMatch && req.method === "GET") {
        send(res, 200, options.runs.listSessions(sessionMatch[1]));
        return;
      }
      if (sessionMatch && req.method === "POST") {
        const body = await readJson(req);
        send(res, 201, options.runs.createSession(sessionMatch[1], body.name ? String(body.name) : undefined));
        return;
      }
      const sessionModel = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/model$/);
      if (sessionModel && req.method === "POST") {
        const sessionId = decodeURIComponent(sessionModel[1]);
        if (!options.runs.getSession(sessionId)) { send(res, 404, { error: "Session not found" }); return; }
        const body = await readJson(req);
        const providerId = String(body.providerId ?? "").trim();
        const model = String(body.model ?? "").trim();
        if (!providerId && !model) { const session = options.runs.setSessionModel(sessionId, null, null, null); send(res, 200, session); return; }
        if (!providerId || !model) { send(res, 400, { error: "providerId and model must both be set or both be empty" }); return; }
        const provider = options.config.providers?.[providerId];
        if (!provider) { send(res, 400, { error: "Provider not found: " + providerId }); return; }
        if (!provider.models.includes(model) && !provider.modelSettings?.[model]) { send(res, 400, { error: "Model is not configured for provider" }); return; }
        const result = await options.switchSessionModel?.(sessionId, providerId, model);
        if (!options.switchSessionModel) { send(res, 503, { error: "Session model switching unavailable" }); return; }
        send(res, 200, result);
        return;
      }
      const sessionExport = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/export$/);
      if (sessionExport && req.method === "GET") { const messages = options.runs.listSessionMessages(sessionExport[1]); const format = requestUrl.searchParams.get("format") ?? "markdown"; if (format === "json") { res.writeHead(200, { "content-type": "application/json", "content-disposition": "attachment; filename=session.json" }); res.end(JSON.stringify(messages, null, 2)); } else { const markdown = messages.map((message) => "## " + message.role + "\n\n" + (message.content ?? "")).join("\n\n---\n\n"); res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "content-disposition": "attachment; filename=session.md" }); res.end(markdown); } return; }
      const sessionAction = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/(rename|archive|delete|cancel)$/);
      if (sessionAction && req.method === "POST") {
        const sessionId = sessionAction[1];
        if (sessionAction[2] === "cancel") {
          let canceledOps = 0;
          for (const [opId, sId] of operationSessionIds) {
            if (sId === sessionId && operationControllers.has(opId)) {
              operationControllers.get(opId)?.abort();
              operationControllers.delete(opId);
              const runId = operationRunIds.get(opId);
              if (runId && options.cancelRun) await options.cancelRun(runId);
              emitOperation(opId, "canceled", { runId });
              canceledOps++;
            }
          }
          const activeRuns = options.runs.listRuns().filter((r) => r.sessionId === sessionId && (r.status === "running" || r.status === "waiting_for_approval"));
          for (const r of activeRuns) {
            if (options.cancelRun) await options.cancelRun(r.id);
          }
          send(res, 200, { ok: true, canceledCount: canceledOps + activeRuns.length });
          return;
        }
        const body = await readJson(req);
        if (sessionAction[2] === "rename") send(res, 200, options.runs.renameSession(sessionId, String(body.name ?? "Untitled")));
        else if (sessionAction[2] === "archive") send(res, 200, options.runs.archiveSession(sessionId));
        else { options.runs.deleteSession(sessionId); send(res, 200, { ok: true }); }
        return;
      }
      const messagesMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (messagesMatch && req.method === "GET") {
        send(res, 200, options.runs.listSessionMessages(messagesMatch[1]));
        return;
      }

      const sessionContext = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/context$/);
      if (sessionContext && req.method === "GET") {
        const sessionId = sessionContext[1];
        const targetSession = options.runs.listSessions().find((s) => s.id === sessionId);
        const projectId = targetSession?.projectId ?? options.activeProjectId?.();
        const project = projectId ? options.runs.getProject(projectId) : undefined;
        const task = options.runs.listSubagentTasks().find((t) => t.childSessionId === sessionId);
        const childTasks = options.runs.listSubagentTasks().filter((t) => t.parentSessionId === sessionId);
        const messages = options.runs.listSessionMessages(sessionId);
        let contextUsage = options.getContextUsage ? await options.getContextUsage(sessionId, projectId) : undefined;
        if (!contextUsage) {
          const sysTokens = 500;
          const userMessages = messages.filter((m) => m.role === "user");
          const asstMessages = messages.filter((m) => m.role === "assistant");
          const toolMessages = messages.filter((m) => m.role === "tool");
          const userTokens = Math.ceil(JSON.stringify(userMessages).length / 4);
          const asstTokens = Math.ceil(JSON.stringify(asstMessages).length / 4);
          const toolTokens = Math.ceil(JSON.stringify(toolMessages).length / 4);
          const estTokens = sysTokens + userTokens + asstTokens + toolTokens;
          const windowTokens = options.config.contextWindowTokens ?? 128000;
          contextUsage = {
            messageCount: messages.length,
            estimatedTokens: estTokens,
            lastRequestTokens: estTokens,
            memoryBreakdown: { system: sysTokens, user: userTokens, assistant: asstTokens, tool: toolTokens },
            lastRequestBreakdown: { system: sysTokens, user: userTokens, assistant: asstTokens, tool: toolTokens },
            threshold: options.config.compactionThreshold ?? 8000,
            contextWindow: windowTokens,
            hasSummary: false,
            summaryTokens: 0,
            isCompacting: false,
            state: "global",
            totalPromptTokens: userTokens,
            totalCompletionTokens: asstTokens,
            totalRequests: userMessages.length,
          };
        }
        const isMaster = targetSession ? targetSession.projectId === null : false;
        let activeOperationId: string | null = null;
        for (const [opId, sId] of operationSessionIds) {
          if (sId === sessionId && operationControllers.has(opId)) {
            activeOperationId = opId;
            break;
          }
        }
        send(res, 200, {
          sessionId,
          isMaster,
          project: project ? { id: project.id, name: project.name, path: project.path } : null,
          isDispatched: Boolean(task),
          task: task ?? null,
          childTasks,
          contextUsage,
          activeOperationId,
          connection: options.config.mainProviderId && options.config.providers?.[options.config.mainProviderId]
            ? {
                providerId: options.config.mainProviderId,
                label: options.config.providers[options.config.mainProviderId].label ?? options.config.mainProviderId,
                protocol: options.config.providers[options.config.mainProviderId].protocol,
                endpoint: options.config.providers[options.config.mainProviderId].endpoint,
                model: options.config.providers[options.config.mainProviderId].defaultModel ?? options.config.providers[options.config.mainProviderId].models[0],
              }
            : {
                providerId: null,
                label: "Legacy global",
                protocol: "openai-chat",
                endpoint: options.config.endpoint,
                model: options.config.model,
              },
        });
        return;
      }

      const activeOpMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/active-operation$/);
      if (activeOpMatch && req.method === "GET") {
        const sessionId = activeOpMatch[1];
        let activeOpId: string | null = null;
        for (const [opId, sId] of operationSessionIds) {
          if (sId === sessionId && operationControllers.has(opId)) {
            activeOpId = opId;
            break;
          }
        }
        const activeRun = options.runs.listRuns().find((r) => r.sessionId === sessionId && (r.status === "running" || r.status === "waiting_for_approval"));
        send(res, 200, {
          active: Boolean(activeOpId || activeRun),
          operationId: activeOpId,
          runId: activeRun?.id ?? null,
          status: activeRun?.status ?? (activeOpId ? "running" : "idle"),
        });
        return;
      }

      if (requestUrl.pathname === "/api/projects/active" && req.method === "POST") {
        const body = await readJson(req);
        const projectId = String(body.projectId);
        if (!options.selectProject || !(await options.selectProject(projectId))) throw new Error("Project not found or cannot be activated: " + projectId);
        send(res, 200, { ok: true, activeProjectId: projectId });
        return;
      }
      if (requestUrl.pathname === "/api/browser/pages" && req.method === "GET") { if (!options.browser) throw new Error("Browser runtime unavailable"); send(res, 200, await options.browser.listPages()); return; }
      if (requestUrl.pathname === "/api/browser/pages" && req.method === "POST") { const body=await readJson(req); if(!options.browser)throw new Error("Browser runtime unavailable");send(res,201,await options.browser.newPage(String(body.url??"about:blank")));return; }
      const browserAction=requestUrl.pathname.match(/^\/api\/browser\/pages\/([^/]+)\/(navigate|screenshot)$/);
      if(browserAction&&req.method==="POST"){const body=await readJson(req);if(!options.browser)throw new Error("Browser runtime unavailable");if(browserAction[2]==="navigate"){await options.browser.navigate(browserAction[1],String(body.url));send(res,200,{ok:true});}else send(res,200,{data:await options.browser.screenshot(browserAction[1])});return;}
      if(requestUrl.pathname==="/api/nodes"&&req.method==="GET"){send(res,200,options.nodes?.list()??[]);return;}
      const nodeAction=requestUrl.pathname.match(/^\/api\/nodes\/([^/]+)\/(test|execute)$/);
      if(nodeAction&&req.method==="POST"){if(!options.nodes)throw new Error("Execution nodes unavailable");const body=await readJson(req);if(nodeAction[2]==="execute"&&body.confirm!==nodeAction[1])throw new Error("Execution confirmation must equal node ID");send(res,200,nodeAction[2]==="test"?await options.nodes.test(nodeAction[1]):await options.nodes.execute(nodeAction[1],String(body.command)));return;}

      if (requestUrl.pathname === "/api/audit/export" && req.method === "GET") {
        const audit = { exportedAt: new Date().toISOString(), events: options.events?.listRecent(1000) ?? [], tasks: options.runs.listSubagentTasks(), approvals: options.approvals.listPending(), memories: options.runs.listProjects().flatMap((project) => options.runs.listProjectMemories(project.id, 100)) };
        res.writeHead(200, { "content-type": "application/json", "content-disposition": "attachment; filename=corvus-audit.json" }); res.end(JSON.stringify(audit, null, 2)); return;
      }
      if (requestUrl.pathname === "/api/backup" && req.method === "POST") {
        if (!options.db) throw new Error("Database backup unavailable");
        const dir = join(getConfigRoot(), "backups"); await mkdir(dir, { recursive: true });
        const path = join(dir, "corvus-" + new Date().toISOString().replace(/[:.]/g, "-") + ".db");
        await options.db.backup(path); send(res, 201, { path }); return;
      }
      const nativeInbound=requestUrl.pathname.match(/^\/api\/channels\/([^/]+)\/inbound$/);if(nativeInbound&&req.method==="POST"){const channel=options.config.channels?.[nativeInbound[1]];if(!channel?.enabled)throw new Error("Channel unavailable");const expected=resolveSecret(channel.tokenRef,"");if(expected&&req.headers.authorization!=="Bearer "+expected){send(res,401,{error:"Unauthorized"});return}const body=await readJson(req);const inbound=inboundAdapters.normalize(channel.type,channel.id,body);if(channel.allowedUsers?.length&&!channel.allowedUsers.includes(inbound.userId)){send(res,403,{error:"Inbound user is not allowed"});return}try{options.db?.prepare("insert into channel_inbound_messages (channel_id,message_id,user_id,conversation_id,thread_id,received_at) values (?,?,?,?,?,?)").run(channel.id,inbound.messageId,inbound.userId,inbound.conversationId,inbound.threadId??null,inbound.timestamp)}catch(error){if((error as Error).message.includes("UNIQUE constraint")){send(res,409,{error:"Duplicate inbound message rejected"});return}throw error}let result:unknown;const bound=options.runs.resolveChannelSession(channel.id,inbound.conversationId,inbound.threadId);if(bound&&options.dispatchSessionMessage)result=await options.dispatchSessionMessage(bound.id,inbound.text,channel.roleId);else if(channel.projectId&&options.dispatchProjectMessage){result=await options.dispatchProjectMessage(channel.projectId,inbound.text,channel.roleId);const session=options.runs.getLatestSession(channel.projectId)??options.runs.createSession(channel.projectId,channel.type+" channel conversation");options.runs.bindChannelSession(channel.id,inbound.conversationId,inbound.threadId,session.id)}else throw new Error("Channel project dispatch unavailable");send(res,202,result);return;}
      const webhookMatch = requestUrl.pathname.match(/^\/api\/webhooks\/([^/]+)$/);
      if (webhookMatch && req.method === "POST") {
        const channel = options.config.channels?.[webhookMatch[1]];
        if (!channel?.enabled) throw new Error("Webhook channel not found or disabled");
        const expected = resolveSecret(channel.tokenRef, "");
        if (expected && req.headers.authorization !== "Bearer " + expected) { send(res, 401, { error: "Unauthorized" }); return; }
        const nonce = String(req.headers["x-corvus-nonce"] ?? "");
        const timestamp = Number(req.headers["x-corvus-timestamp"] ?? 0);
        if (expected) { if (!nonce || !timestamp || Math.abs(Date.now() - timestamp) > 5 * 60_000) { send(res, 401, { error: "Webhook nonce and fresh timestamp are required" }); return; } const key = channel.id + ":" + nonce; if (webhookNonces.has(key)) { send(res, 409, { error: "Webhook replay rejected" }); return; } webhookNonces.set(key, Date.now()); for (const [item, at] of webhookNonces) if (Date.now() - at > 10 * 60_000) webhookNonces.delete(item); }
        const body = await readJson(req);
        const inbound = normalizeWebhookMessage(channel.id, body);
        if (channel.allowedUsers?.length && !channel.allowedUsers.includes(inbound.userId)) { send(res, 403, { error: "Inbound user is not allowed" }); return; }
        if (channel.allowedTenants?.length && (!inbound.tenantId || !channel.allowedTenants.includes(inbound.tenantId))) { send(res, 403, { error: "Inbound tenant is not allowed" }); return; }
        if (options.db) { try { options.db.prepare("insert into channel_inbound_messages (channel_id,message_id,user_id,conversation_id,thread_id,received_at) values (?,?,?,?,?,?)").run(channel.id,inbound.messageId,inbound.userId,inbound.conversationId,inbound.threadId??null,inbound.timestamp); } catch (error) { if ((error as Error).message.includes("UNIQUE constraint")) { send(res,409,{error:"Duplicate inbound message rejected"});return; } throw error; } }
        const prompt = inbound.text;
        options.events?.append("channel.message_received", { channelId: channel.id, platform: inbound.platform, userId: inbound.userId, conversationId: inbound.conversationId, threadId: inbound.threadId, messageId: inbound.messageId, attachmentCount: inbound.attachments.length });
        let result: unknown;
        const boundSession=options.runs.resolveChannelSession(channel.id,inbound.conversationId,inbound.threadId);
        if(boundSession&&options.dispatchSessionMessage)result=await options.dispatchSessionMessage(boundSession.id,prompt,channel.roleId);
        else if (channel.useOrchestrator) { if (!options.orchestrate) throw new Error("Orchestrator unavailable"); result = await options.orchestrate(prompt); }
        else { if (!options.dispatchProjectMessage || !channel.projectId) throw new Error("Project dispatch unavailable"); result = await options.dispatchProjectMessage(channel.projectId, prompt, channel.roleId); if(channel.projectId){const session=options.runs.getLatestSession(channel.projectId)??options.runs.createSession(channel.projectId,channel.type+" channel conversation");options.runs.bindChannelSession(channel.id,inbound.conversationId,inbound.threadId,session.id);} }
        if (channel.outboundUrl && options.channelDeliveries) await options.channelDeliveries.enqueue(channel.id, channel as unknown as Record<string, unknown>, result);
        send(res, 202, result);
        return;
      }
      const taskAction = requestUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/(cancel)$/);
      if (taskAction && req.method === "POST") { if (!options.cancelTask) throw new Error("Task cancellation unavailable"); await options.cancelTask(taskAction[1]); send(res, 200, { ok: true }); return; }
      const runAction = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/(cancel|resume)$/);
      if (runAction && req.method === "POST") { if (runAction[2] === "cancel") { if (!options.cancelRun) throw new Error("Run cancellation unavailable"); await options.cancelRun(runAction[1]); } else { if (!options.resumeRun) throw new Error("Run resume unavailable"); await options.resumeRun(runAction[1]); } send(res, 200, { ok: true }); return; }
      const operationCancel = requestUrl.pathname.match(/^\/api\/operations\/([^/]+)\/cancel$/);
      if (operationCancel && req.method === "POST") {
        const operationId = operationCancel[1];
        operationControllers.get(operationId)?.abort();
        operationControllers.delete(operationId);
        const runId = operationRunIds.get(operationId);
        if (runId && options.cancelRun) await options.cancelRun(runId);
        emitOperation(operationId, "canceled", { runId });
        send(res, 200, { ok: true });
        return;
      }
      const operationEvents = requestUrl.pathname.match(/^\/api\/operations\/([^/]+)\/events$/);
      if (operationEvents && req.method === "GET") {
        const id = operationEvents[1];
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        for (const item of operationHistory.get(id) ?? []) res.write("event: " + item.event + "\ndata: " + JSON.stringify(item.data) + "\n\n");
        const listeners = operationListeners.get(id) ?? new Set<ServerResponse>(); listeners.add(res); operationListeners.set(id, listeners);
        req.on("close", () => { listeners.delete(res); if (listeners.size === 0) operationListeners.delete(id); });
        return;
      }
      const asyncSessionSend = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (asyncSessionSend && req.method === "POST") {
        const body = await readJson(req); if (!options.sendSessionMessage) throw new Error("Session dispatch unavailable");
        const operationId = "op_" + randomUUID().replace(/-/g, "");
        operationSessionIds.set(operationId, asyncSessionSend[1]);
        const controller = new AbortController(); operationControllers.set(operationId, controller);
        send(res, 202, { operationId });
        void options.sendSessionMessage(asyncSessionSend[1], String(body.prompt ?? ""), (text) => emitOperation(operationId, "delta", { text }), controller.signal).then((result) => emitOperation(operationId, "complete", result)).catch((error) => emitOperation(operationId, controller.signal.aborted ? "canceled" : "failed", { error: (error as Error).message })).finally(() => {
          operationControllers.delete(operationId);
          if (operationSessionIds.size > 200) {
            const staleKeys = [...operationSessionIds.keys()].slice(0, 50);
            for (const k of staleKeys) {
              if (!operationControllers.has(k)) {
                operationSessionIds.delete(k);
                operationRunIds.delete(k);
              }
            }
          }
        });
        return;
      }
      const sessionSend = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/send$/);
      if (sessionSend && req.method === "POST") { const body = await readJson(req); if (!options.sendSessionMessage) throw new Error("Session dispatch unavailable"); send(res, 202, await options.sendSessionMessage(sessionSend[1], String(body.prompt ?? ""))); return; }
      if (requestUrl.pathname === "/api/memory-links" && req.method === "POST") { const body = await readJson(req); options.runs.linkProjectMemories(String(body.memoryId), String(body.relatedMemoryId), body.relation as any ?? "related_to"); send(res, 201, { ok: true }); return; }
      if (requestUrl.pathname === "/api/memories" && req.method === "POST") { const body = await readJson(req); const memory=options.runs.createProjectMemory({ projectId: String(body.projectId), taskId: body.taskId ? String(body.taskId) : null, kind: body.kind as any ?? "handoff", title: String(body.title), content: String(body.content), confidence: Number(body.confidence ?? 0.8), scope: body.scope as any ?? "project", sourceType: "manual", sourceId: body.sourceId ? String(body.sourceId) : null, verified: body.verified === true, sensitivity: body.sensitivity === "sensitive" ? "sensitive" : "normal" }); await options.indexMemory?.(memory); send(res,201,memory); return; }
      const memoryAction = requestUrl.pathname.match(/^\/api\/memories\/([^/]+)\/(obsolete|activate)$/);
      if (memoryAction && req.method === "POST") { send(res, 200, options.runs.updateProjectMemoryStatus(memoryAction[1], memoryAction[2] === "obsolete" ? "obsolete" : "active")); return; }

      if (requestUrl.pathname === "/api/orchestrate" && req.method === "POST") {
        const body = await readJson(req);
        if (!options.orchestrate) throw new Error("Global orchestrator unavailable");
        send(res, 202, await options.orchestrate(String(body.prompt ?? "")));
        return;
      }
      if (requestUrl.pathname === "/api/dispatch" && req.method === "POST") {
        const body = await readJson(req);
        const projectId = String(body.projectId ?? options.activeProjectId?.() ?? "");
        const prompt = String(body.prompt ?? "").trim();
        if (!options.dispatchProjectMessage || !projectId || !prompt) throw new Error("projectId and prompt are required");
        send(res, 202, await options.dispatchProjectMessage(projectId, prompt));
        return;
      }
      if (requestUrl.pathname.startsWith("/api/approvals/") && req.method === "POST") {
        const approvalId = requestUrl.pathname.split("/")[3];
        const body = await readJson(req);
        const decision = body.decision === "deny" ? "deny" : "allow";
        const requestedScope = String(body.scope ?? "once");
        const scope = decision === "deny" ? (requestedScope === "never" ? "never" : "once") : (requestedScope === "always" ? "always" : "once");
        if (!options.resolveApproval) throw new Error("Approval control unavailable");
        const result = await options.resolveApproval(approvalId, decision, scope);
        send(res, 200, { ok: true, ...result });
        return;
      }

      if (requestUrl.pathname === "/api/channels" && req.method === "POST") {
        const body = await readJson(req); const id = String(body.id); if (!id) throw new Error("Channel id required");
        options.config.channels = { ...(options.config.channels ?? {}), [id]: { id, type: (["webhook", "telegram", "slack", "discord"].includes(String(body.type)) ? String(body.type) : "webhook") as any, enabled: body.enabled !== false, projectId: body.projectId ? String(body.projectId) : undefined, roleId: body.roleId ? String(body.roleId) : undefined, tokenRef: body.tokenRef ? String(body.tokenRef) : undefined, useOrchestrator: body.useOrchestrator === true || body.useOrchestrator === "true", outboundUrl: body.outboundUrl ? String(body.outboundUrl) : undefined, credentialRef: body.credentialRef ? String(body.credentialRef) : undefined, targetId: body.targetId ? String(body.targetId) : undefined, allowedUsers: body.allowedUsers ? String(body.allowedUsers).split(",").map(item=>item.trim()).filter(Boolean) : undefined, allowedTenants: body.allowedTenants ? String(body.allowedTenants).split(",").map(item=>item.trim()).filter(Boolean) : undefined } };
        await options.saveConfig(); send(res, 201, redactSecrets(options.config.channels[id])); return;
      }
      if (requestUrl.pathname === "/api/routing" && req.method === "POST") {
        const body = await readJson(req);
        const id = String(body.id);
        if (!id) throw new Error("Routing rule id required");
        options.config.routingRules = { ...(options.config.routingRules ?? {}), [id]: { id, keywords: String(body.keywords ?? "").split(",").map((item) => item.trim()).filter(Boolean), projectIds: String(body.projectIds ?? "").split(",").map((item) => item.trim()).filter(Boolean), roleId: body.roleId ? String(body.roleId) : undefined, priority: Number(body.priority ?? 0) } };
        await options.saveConfig();
        send(res, 201, options.config.routingRules[id]);
        return;
      }
      if (requestUrl.pathname === "/api/automations" && req.method === "POST") {
        const body = await readJson(req);
        const id = String(body.id || `auto_${Date.now()}`);
        if (!body.projectId || !body.prompt) throw new Error("projectId and prompt are required");
        options.config.automations = { ...(options.config.automations ?? {}), [id]: { id, label: String(body.label || body.name || id), enabled: body.enabled !== false, projectId: String(body.projectId), roleId: body.roleId ? String(body.roleId) : undefined, prompt: String(body.prompt), trigger: body.event ? { type: "event", event: String(body.event) } : { type: "interval", everySeconds: Number(body.everySeconds ?? 3600) } } };
        await options.saveConfig();
        options.reloadAutomations?.();
        send(res, 201, options.config.automations[id]);
        return;
      }
      const automationActionMatch = requestUrl.pathname.match(/^\/api\/automations\/([^/]+)(?:\/(toggle|run))?$/);
      if (automationActionMatch) {
        const autoId = decodeURIComponent(automationActionMatch[1]);
        const subAction = automationActionMatch[2];
        if (req.method === "DELETE") {
          if (options.config.automations && options.config.automations[autoId]) {
            delete options.config.automations[autoId];
            await options.saveConfig();
            options.reloadAutomations?.();
            send(res, 200, { ok: true, removed: autoId });
            return;
          }
          send(res, 404, { error: "Automation not found" });
          return;
        }
        if (req.method === "POST" && subAction === "toggle") {
          const auto = options.config.automations?.[autoId];
          if (!auto) { send(res, 404, { error: "Automation not found" }); return; }
          auto.enabled = auto.enabled === false ? true : false;
          await options.saveConfig();
          options.reloadAutomations?.();
          send(res, 200, { ok: true, enabled: auto.enabled });
          return;
        }
        if (req.method === "POST" && subAction === "run") {
          const auto = options.config.automations?.[autoId];
          if (!auto) { send(res, 404, { error: "Automation not found" }); return; }
          if (options.runAutomation) {
            await options.runAutomation(autoId);
            send(res, 200, { ok: true, message: "Automation triggered" });
            return;
          }
          send(res, 200, { ok: true, message: "Trigger dispatched" });
          return;
        }
      }
      if (requestUrl.pathname === "/api/providers" && req.method === "POST") {
        const body = await readJson(req);
        const id = String(body.id);
        if (!id) throw new Error("Provider id is required");
        options.config.providers = { ...(options.config.providers ?? {}), [id]: { id, label: String(body.label ?? id), protocol: body.protocol as any ?? "openai-chat", endpoint: String(body.endpoint), apiKey: String(body.apiKey ?? options.config.providers?.[id]?.apiKey ?? ""), apiKeyRef: body.apiKeyRef ? String(body.apiKeyRef) : undefined, models: String(body.models ?? body.model ?? "").split(",").map((item) => item.trim()).filter(Boolean), defaultModel: String(body.defaultModel ?? body.model), temperature: Number(body.temperature ?? options.config.temperature), timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined, maxRetries: body.maxRetries === undefined ? undefined : Number(body.maxRetries), fallbackProviderIds: body.fallbackProviderIds ? String(body.fallbackProviderIds).split(",").map((item) => item.trim()).filter(Boolean) : undefined, modelSettings: body.modelSettings && typeof body.modelSettings === "object" ? body.modelSettings as any : options.config.providers?.[id]?.modelSettings, capabilities: { tools: body.tools !== "false", streaming: body.streaming !== "false", vision: body.vision === "true" } } };
        await options.saveConfig();
        send(res, 201, options.config.providers[id]);
        return;
      }
      if (requestUrl.pathname === "/api/providers/discover-models" && req.method === "POST") {
        const body = await readJson(req);
        const endpoint = String(body.endpoint || "").trim();
        const rawApiKey = String(body.apiKey || "").trim();
        const apiKeyRef = body.apiKeyRef ? String(body.apiKeyRef) : undefined;
        const apiKey = resolveSecret(apiKeyRef, rawApiKey || options.config.apiKey);
        const protocol = body.protocol as any;
        if (!endpoint) throw new Error("Endpoint URL is required");
        const started = Date.now();
        const models = await discoverProviderModels({ endpoint, apiKey, protocol, timeoutMs: 15000 });
        send(res, 200, { ok: true, models, latencyMs: Date.now() - started });
        return;
      }
      if (requestUrl.pathname.startsWith("/api/providers/") && req.method === "DELETE") {
        const id = requestUrl.pathname.split("/")[3];
        if (!id) throw new Error("Provider id is required");
        if (options.config.providers && options.config.providers[id]) {
          delete options.config.providers[id];
          if (options.config.mainProviderId === id) {
            options.config.mainProviderId = Object.keys(options.config.providers)[0] || "";
          }
          await options.saveConfig();
        }
        send(res, 200, { ok: true, deleted: id });
        return;
      }
      if (requestUrl.pathname.startsWith("/api/providers/") && requestUrl.pathname.endsWith("/test") && req.method === "POST") {
        const id = requestUrl.pathname.split("/")[3]; const provider = options.config.providers?.[id]; if (!provider) throw new Error("Provider not found: " + id);
        const started = Date.now(); const client = new ProtocolChatClient({ endpoint: provider.endpoint, apiKey: resolveSecret(provider.apiKeyRef, provider.apiKey || options.config.apiKey), model: provider.defaultModel ?? provider.models[0], temperature: provider.temperature, protocol: provider.protocol, timeoutMs: provider.timeoutMs ?? 30000, maxRetries: 0 });
        const response = await client.createChatCompletion({ messages: [{ role: "user", content: "Reply with OK only." }], tools: [], tool_choice: "none" });
        send(res, 200, { ok: true, latencyMs: Date.now() - started, model: response.model ?? provider.defaultModel, content: response.choices[0]?.message.content }); return;
      }
      if (requestUrl.pathname.startsWith("/api/providers/") && requestUrl.pathname.endsWith("/main") && req.method === "POST") {
        const id = requestUrl.pathname.split("/")[3];
        if (!options.config.providers?.[id]) throw new Error("Provider not found: " + id);
        options.config.mainProviderId = id;
        await options.saveConfig();
        send(res, 200, { ok: true, mainProviderId: id });
        return;
      }
      if (requestUrl.pathname === "/api/roles" && req.method === "POST") {
        const body = await readJson(req);
        const id = String(body.id);
        const providerId = String(body.providerId);
        if (!id || !providerId || !options.config.providers?.[providerId]) throw new Error("Role id and an existing providerId are required");
        options.config.agentRoles = { ...(options.config.agentRoles ?? {}), [id]: { id, label: String(body.label ?? id), providerId, model: body.model ? String(body.model) : undefined, temperature: body.temperature === undefined ? undefined : Number(body.temperature), systemPrompt: body.systemPrompt ? String(body.systemPrompt) : undefined, allowedTools: body.allowedTools ? String(body.allowedTools).split(",").map((item) => item.trim()).filter(Boolean) : undefined, deniedTools: body.deniedTools ? String(body.deniedTools).split(",").map((item) => item.trim()).filter(Boolean) : undefined, allowedScopes: body.allowedScopes ? String(body.allowedScopes).split(",").map((item) => item.trim()).filter(Boolean) : undefined, skills: body.skills ? String(body.skills).split(",").map((item) => item.trim()).filter(Boolean) : undefined, maxConcurrent: body.maxConcurrent ? Number(body.maxConcurrent) : undefined, maxChildDepth: body.maxChildDepth ? Number(body.maxChildDepth) : undefined, timeoutSeconds: body.timeoutSeconds ? Number(body.timeoutSeconds) : undefined, maxToolRounds: body.maxToolRounds ? Number(body.maxToolRounds) : undefined, maxContextTokens: body.maxContextTokens ? Number(body.maxContextTokens) : undefined, maxRequests: body.maxRequests ? Number(body.maxRequests) : undefined, maxPromptTokens: body.maxPromptTokens ? Number(body.maxPromptTokens) : undefined, maxCompletionTokens: body.maxCompletionTokens ? Number(body.maxCompletionTokens) : undefined, requireStructuredHandoff: body.requireStructuredHandoff === true || body.requireStructuredHandoff === "true" } };
        await options.saveConfig();
        send(res, 201, options.config.agentRoles[id]);
        return;
      }
      if (requestUrl.pathname === "/api/config" && req.method === "GET") { send(res, 200, redactSecrets(options.config)); return; }
      if (requestUrl.pathname === "/api/permissions/preset" && req.method === "POST") {
        const body = await readJson(req);
        const preset = String(body.preset) as PermissionPreset;
        if (preset !== "balanced" && preset !== "autonomous") throw new Error("Permission preset must be balanced or autonomous");
        applyPermissionPreset(options.config, preset);
        await options.saveConfig();
        send(res, 200, { ok: true, permissionPreset: preset });
        return;
      }
      if (requestUrl.pathname === "/api/config" && (req.method === "PUT" || req.method === "POST")) {
        const body = await readJson(req);
        const merged = mergePreservingSecrets(options.config, body);
        const errors = validateConfig(merged).filter((item) => item.level === "error");
        if (errors.length) throw new Error("Invalid config: " + errors.map((item) => item.path + ": " + item.message).join("; "));
        Object.assign(options.config, merged);
        await options.saveConfig();
        send(res, 200, { ok: true });
        return;
      }
      send(res, 404, { error: "Not found" });
    } catch (error) { const code=(error as {code?:string}).code;send(res,code==="REVISION_CONFLICT"?409:code==="PAYLOAD_TOO_LARGE"?413:400,{error:(error as Error).message,...(code?{code}:{})}); }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        url: "http://" + host + ":" + actualPort + "/",
        accessUrl: "http://" + host + ":" + actualPort + "/?token=" + accessToken,
        close: () => new Promise((done, fail) => { unsubscribeRuntimeEvents?.(); server.closeAllConnections(); server.close((error) => error ? fail(error) : done()); }),
      });
    });
  });
}