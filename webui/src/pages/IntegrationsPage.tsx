import React, { useState } from "react";
import { Card, Modal, toast } from "../components";
import { postJson } from "../api";
import type { McpServerConfig } from "../types";
import type { PageProps } from "./shared";

const templates: Array<{ label: string; config: McpServerConfig }> = [
  { label: "GitHub", config: { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" } } },
  { label: "PostgreSQL", config: { name: "postgresql", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/postgres"], env: {} } },
  { label: "SQLite", config: { name: "sqlite", command: "uvx", args: ["mcp-server-sqlite", "--db-path", "./data.db"], env: {} } },
  { label: "Puppeteer", config: { name: "puppeteer", command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"], env: {} } },
  { label: "Fetch", config: { name: "fetch", command: "uvx", args: ["mcp-server-fetch"], env: {} } },
  { label: "Filesystem", config: { name: "filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."], env: {} } },
  { label: "Memory", config: { name: "memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: {} } },
  { label: "Brave Search", config: { name: "brave-search", command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], env: { BRAVE_API_KEY: "" } } },
];
const blank: McpServerConfig = { name: "", command: "", url: "", args: [], env: {} };

function ConfigureMcp({ onClose, reload }: { onClose: () => void; reload: () => Promise<void> }) {
  const [config, setConfig] = useState<McpServerConfig>(blank);
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | "">("");
  const apply = (next: McpServerConfig) => { setConfig({ ...next }); setArgs(next.args.join("\n")); setEnv(Object.entries(next.env).map(([k,v]) => k + "=" + v).join("\n")); };
  const payload = (): McpServerConfig => ({ ...config, args: args.split("\n").map(v=>v.trim()).filter(Boolean), env: Object.fromEntries(env.split("\n").map(v=>v.trim()).filter(Boolean).map(line => { const i=line.indexOf("="); return i < 0 ? [line, ""] : [line.slice(0,i), line.slice(i+1)]; })) });
  const act = async (kind: "test" | "save") => { setBusy(kind); try { const value = payload(); const result:any = await postJson(kind === "test" ? "/api/mcp/test" : "/api/mcp/config", { id: value.name, config: { command: value.command || undefined, url: value.url || undefined, args: value.args, env: value.env } }); if (kind === "test" && result?.status === "failed") throw new Error(result.error || "Connection failed"); toast.success(kind === "test" ? `MCP connection succeeded (${result?.toolCount ?? 0} tools).` : "MCP server saved."); if(kind === "save") { await reload(); onClose(); } } catch(e) { toast.error("MCP " + kind + " failed: " + String(e)); } finally { setBusy(""); } };
  return <Modal title="Configure MCP Server" onClose={onClose}><div className="template-grid">{templates.map(t=><button type="button" key={t.label} onClick={()=>apply(t.config)}>{t.label}</button>)}</div><form onSubmit={e=>{e.preventDefault();void act("save")}}>
    <label>SERVER NAME<input required value={config.name} onChange={e=>setConfig(v=>({...v,name:e.target.value}))} placeholder="my-mcp-server" /></label>
    <div className="form-columns"><label>COMMAND<input value={config.command || ""} onChange={e=>setConfig(v=>({...v,command:e.target.value}))} placeholder="npx" /></label><label>URL<input value={config.url || ""} onChange={e=>setConfig(v=>({...v,url:e.target.value}))} placeholder="https://…/sse" /></label></div>
    <label>ARGUMENTS <small>one argument per line</small><textarea rows={5} value={args} onChange={e=>setArgs(e.target.value)} /></label>
    <label>ENVIRONMENT <small>KEY=value, one per line</small><textarea rows={5} value={env} onChange={e=>setEnv(e.target.value)} placeholder="API_KEY=" /></label>
    <div className="form-actions"><button type="button" disabled={!!busy} onClick={()=>void act("test")}>{busy === "test" ? "TESTING…" : "TEST CONNECTION"}</button><button className="primary" disabled={!!busy}>{busy === "save" ? "SAVING…" : "SAVE SERVER"}</button></div>
  </form></Modal>;
}

function Server({ server, index }: { server:any; index:number }) { const [raw,setRaw]=useState(false); const name=server.name||server.id||`MCP Server #${index+1}`; return <div className="integration-card"><div className="integration-card-header"><span className="integration-card-title"><span style={{color:"var(--vfd-cyan)"}}>⚡</span><b>{name}</b><span className="scope-badge">{(server.transport||server.type||(server.url?"HTTP/SSE":"STDIO")).toUpperCase()}</span></span><span className={"tool-box-badge " + (server.status === "failed" ? "error" : "ok")}>{server.status === "failed" ? "FAILED" : "CONNECTED"}</span></div><code className="config-target">{server.command ? server.command+" "+(server.args||[]).join(" ") : server.url||"Local process"}</code>{server.tools?.length>0&&<div className="tool-tag-list">{server.tools.map((t:any,i:number)=><span className="tool-tag" key={i}>⚙️ {typeof t==="string"?t:t.name}</span>)}</div>}<button className="raw-toggle" onClick={()=>setRaw(v=>!v)}>{raw?"HIDE RAW":"VIEW RAW CONFIG"}</button>{raw&&<pre className="tool-box-code">{JSON.stringify(server,null,2)}</pre>}</div> }

export function IntegrationsPage({state,reload}:PageProps) { const [open,setOpen]=useState(false); const importFrom=async(source:string)=>{try{await postJson("/api/mcp/import",{source});await reload();toast.success(`Imported MCP servers from ${source}.`)}catch(e){toast.error(`Import from ${source} failed: ${String(e)}`)}}; return <><div className="page-toolbar"><div className="import-actions"><span>ONE-CLICK IMPORT</span>{["claude","cursor","codex"].map(x=><button key={x} onClick={()=>void importFrom(x)}>IMPORT {x.toUpperCase()}</button>)}</div><button className="primary" onClick={()=>setOpen(true)}>＋ CONFIGURE MCP SERVER</button></div><div className="grid"><Card title={`Active Plugins (${state.plugins.length})`}>{state.plugins.length?state.plugins.map((p:any,i)=><div className="integration-card" key={p.name||i}><b>🔌 {p.name||p.id||`Plugin #${i+1}`}</b><p>{p.description||"Dynamic capability extension"}</p></div>):<p className="empty-state">No dynamic plugins active.</p>}</Card><Card title={`Model Context Protocol Servers (${state.mcp.length})`}>{state.mcp.length?state.mcp.map((s:any,i)=><Server key={s.id||s.name||i} server={s} index={i}/>):<p className="empty-state">No MCP external tool servers connected.</p>}</Card></div>{open&&<ConfigureMcp onClose={()=>setOpen(false)} reload={reload}/>}</> }
