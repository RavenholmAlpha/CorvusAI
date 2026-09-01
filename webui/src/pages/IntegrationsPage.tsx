import React, { useState } from "react";
import { Card, Modal, toast } from "../components";
import { postJson } from "../api";
import type { McpServerConfig } from "../types";
import type { PageProps } from "./shared";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "integrations.connectionFailed": { en: "Connection failed", "zh-CN": "连接失败" },
  "integrations.testSuccess": { en: "MCP connection succeeded ({count} tools).", "zh-CN": "MCP 连接成功（{count} 个工具）。" },
  "integrations.saved": { en: "MCP server saved.", "zh-CN": "MCP 服务器已保存。" },
  "integrations.actionError": { en: "MCP {action} failed: {error}", "zh-CN": "MCP {action} 失败：{error}" },
  "integrations.testAction": { en: "test", "zh-CN": "测试" },
  "integrations.saveAction": { en: "save", "zh-CN": "保存" },
  "integrations.configure": { en: "Configure MCP Server", "zh-CN": "配置 MCP 服务器" },
  "integrations.serverName": { en: "SERVER NAME", "zh-CN": "服务器名称" },
  "integrations.command": { en: "COMMAND", "zh-CN": "命令" },
  "integrations.url": { en: "URL", "zh-CN": "URL" },
  "integrations.arguments": { en: "ARGUMENTS", "zh-CN": "参数" },
  "integrations.onePerLine": { en: "one argument per line", "zh-CN": "每行一个参数" },
  "integrations.environment": { en: "ENVIRONMENT", "zh-CN": "环境变量" },
  "integrations.envHelp": { en: "KEY=value, one per line", "zh-CN": "KEY=value，每行一项" },
  "integrations.testing": { en: "TESTING…", "zh-CN": "测试中……" },
  "integrations.test": { en: "TEST CONNECTION", "zh-CN": "测试连接" },
  "integrations.saving": { en: "SAVING…", "zh-CN": "保存中……" },
  "integrations.save": { en: "SAVE SERVER", "zh-CN": "保存服务器" },
  "integrations.serverFallback": { en: "MCP Server #{number}", "zh-CN": "MCP 服务器 #{number}" },
  "integrations.failed": { en: "FAILED", "zh-CN": "失败" },
  "integrations.connected": { en: "CONNECTED", "zh-CN": "已连接" },
  "integrations.localProcess": { en: "Local process", "zh-CN": "本地进程" },
  "integrations.hideRaw": { en: "HIDE RAW", "zh-CN": "隐藏原始配置" },
  "integrations.viewRaw": { en: "VIEW RAW CONFIG", "zh-CN": "查看原始配置" },
  "integrations.imported": { en: "Imported MCP servers from {source}.", "zh-CN": "已从 {source} 导入 MCP 服务器。" },
  "integrations.importError": { en: "Import from {source} failed: {error}", "zh-CN": "从 {source} 导入失败：{error}" },
  "integrations.oneClick": { en: "ONE-CLICK IMPORT", "zh-CN": "一键导入" },
  "integrations.import": { en: "IMPORT {source}", "zh-CN": "导入 {source}" },
  "integrations.configureButton": { en: "＋ CONFIGURE MCP SERVER", "zh-CN": "＋ 配置 MCP 服务器" },
  "integrations.plugins": { en: "Active Plugins ({count})", "zh-CN": "活动插件（{count}）" },
  "integrations.pluginFallback": { en: "Plugin #{number}", "zh-CN": "插件 #{number}" },
  "integrations.dynamicCapability": { en: "Dynamic capability extension", "zh-CN": "动态能力扩展" },
  "integrations.noPlugins": { en: "No dynamic plugins active.", "zh-CN": "没有活动的动态插件。" },
  "integrations.servers": { en: "Model Context Protocol Servers ({count})", "zh-CN": "模型上下文协议服务器（{count}）" },
  "integrations.noServers": { en: "No MCP external tool servers connected.", "zh-CN": "未连接 MCP 外部工具服务器。" },
  "integrations.namePlaceholder": { en: "my-mcp-server", "zh-CN": "my-mcp-server" },
  "integrations.commandPlaceholder": { en: "npx", "zh-CN": "npx" },
  "integrations.urlPlaceholder": { en: "https://…/sse", "zh-CN": "https://…/sse" },
  "integrations.envPlaceholder": { en: "API_KEY=", "zh-CN": "API_KEY=" },
  "integrations.templateGitHub": { en: "GitHub", "zh-CN": "GitHub" },
  "integrations.templatePostgreSQL": { en: "PostgreSQL", "zh-CN": "PostgreSQL" },
  "integrations.templateSQLite": { en: "SQLite", "zh-CN": "SQLite" },
  "integrations.templatePuppeteer": { en: "Puppeteer", "zh-CN": "Puppeteer" },
  "integrations.templateFetch": { en: "Fetch", "zh-CN": "网页获取" },
  "integrations.templateFilesystem": { en: "Filesystem", "zh-CN": "文件系统" },
  "integrations.templateMemory": { en: "Memory", "zh-CN": "记忆" },
  "integrations.templateBraveSearch": { en: "Brave Search", "zh-CN": "Brave 搜索" },
});

const templates: Array<{ label: string; config: McpServerConfig }> = [
  { label: "integrations.templateGitHub", config: { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" } } },
  { label: "integrations.templatePostgreSQL", config: { name: "postgresql", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/postgres"], env: {} } },
  { label: "integrations.templateSQLite", config: { name: "sqlite", command: "uvx", args: ["mcp-server-sqlite", "--db-path", "./data.db"], env: {} } },
  { label: "integrations.templatePuppeteer", config: { name: "puppeteer", command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"], env: {} } },
  { label: "integrations.templateFetch", config: { name: "fetch", command: "uvx", args: ["mcp-server-fetch"], env: {} } },
  { label: "integrations.templateFilesystem", config: { name: "filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."], env: {} } },
  { label: "integrations.templateMemory", config: { name: "memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: {} } },
  { label: "integrations.templateBraveSearch", config: { name: "brave-search", command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], env: { BRAVE_API_KEY: "" } } },
];
const blank: McpServerConfig = { name: "", command: "", url: "", args: [], env: {} };

function ConfigureMcp({ onClose, reload }: { onClose: () => void; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<McpServerConfig>(blank);
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | "">("");
  const apply = (next: McpServerConfig) => { setConfig({ ...next }); setArgs(next.args.join("\n")); setEnv(Object.entries(next.env).map(([k,v]) => k + "=" + v).join("\n")); };
  const payload = (): McpServerConfig => ({ ...config, args: args.split("\n").map(v=>v.trim()).filter(Boolean), env: Object.fromEntries(env.split("\n").map(v=>v.trim()).filter(Boolean).map(line => { const i=line.indexOf("="); return i < 0 ? [line, ""] : [line.slice(0,i), line.slice(i+1)]; })) });
  const act = async (kind: "test" | "save") => { setBusy(kind); try { const value = payload(); const result:any = await postJson(kind === "test" ? "/api/mcp/test" : "/api/mcp/config", { id: value.name, config: { command: value.command || undefined, url: value.url || undefined, args: value.args, env: value.env } }); if (kind === "test" && result?.status === "failed") throw new Error(result.error || t("integrations.connectionFailed")); toast.success(kind === "test" ? t("integrations.testSuccess", { count: result?.toolCount ?? 0 }) : t("integrations.saved")); if(kind === "save") { await reload(); onClose(); } } catch(e) { toast.error(t("integrations.actionError", { action: t(kind === "test" ? "integrations.testAction" : "integrations.saveAction"), error: String(e) })); } finally { setBusy(""); } };
  return <Modal title={t("integrations.configure")} onClose={onClose}><div className="template-grid">{templates.map(template=><button type="button" key={template.label} onClick={()=>apply(template.config)}>{t(template.label)}</button>)}</div><form onSubmit={e=>{e.preventDefault();void act("save")}}>
    <label>{t("integrations.serverName")}<input required value={config.name} onChange={e=>setConfig(v=>({...v,name:e.target.value}))} placeholder={t("integrations.namePlaceholder")} /></label>
    <div className="form-columns"><label>{t("integrations.command")}<input value={config.command || ""} onChange={e=>setConfig(v=>({...v,command:e.target.value}))} placeholder={t("integrations.commandPlaceholder")} /></label><label>{t("integrations.url")}<input value={config.url || ""} onChange={e=>setConfig(v=>({...v,url:e.target.value}))} placeholder={t("integrations.urlPlaceholder")} /></label></div>
    <label>{t("integrations.arguments")} <small>{t("integrations.onePerLine")}</small><textarea rows={5} value={args} onChange={e=>setArgs(e.target.value)} /></label>
    <label>{t("integrations.environment")} <small>{t("integrations.envHelp")}</small><textarea rows={5} value={env} onChange={e=>setEnv(e.target.value)} placeholder={t("integrations.envPlaceholder")} /></label>
    <div className="form-actions"><button type="button" disabled={!!busy} onClick={()=>void act("test")}>{busy === "test" ? t("integrations.testing") : t("integrations.test")}</button><button className="primary" disabled={!!busy}>{busy === "save" ? t("integrations.saving") : t("integrations.save")}</button></div>
  </form></Modal>;
}

function Server({ server, index }: { server:any; index:number }) { const { t } = useI18n(); const [raw,setRaw]=useState(false); const name=server.name||server.id||t("integrations.serverFallback", { number: index + 1 }); return <div className="integration-card"><div className="integration-card-header"><span className="integration-card-title"><span style={{color:"var(--vfd-cyan)"}}>⚡</span><b>{name}</b><span className="scope-badge">{(server.transport||server.type||(server.url?"HTTP/SSE":"STDIO")).toUpperCase()}</span></span><span className={"tool-box-badge " + (server.status === "failed" ? "error" : "ok")}>{server.status === "failed" ? t("integrations.failed") : t("integrations.connected")}</span></div><code className="config-target">{server.command ? server.command+" "+(server.args||[]).join(" ") : server.url||t("integrations.localProcess")}</code>{server.tools?.length>0&&<div className="tool-tag-list">{server.tools.map((t:any,i:number)=><span className="tool-tag" key={i}>⚙️ {typeof t==="string"?t:t.name}</span>)}</div>}<button className="raw-toggle" onClick={()=>setRaw(v=>!v)}>{raw?t("integrations.hideRaw"):t("integrations.viewRaw")}</button>{raw&&<pre className="tool-box-code">{JSON.stringify(server,null,2)}</pre>}</div> }

export function IntegrationsPage({state,reload}:PageProps) { const { t } = useI18n(); const [open,setOpen]=useState(false); const importFrom=async(source:string)=>{try{await postJson("/api/mcp/import",{source});await reload();toast.success(t("integrations.imported", { source }))}catch(e){toast.error(t("integrations.importError", { source, error: String(e) }))}}; return <><div className="page-toolbar"><div className="import-actions"><span>{t("integrations.oneClick")}</span>{["claude","cursor","codex"].map(x=><button key={x} onClick={()=>void importFrom(x)}>{t("integrations.import", { source: x.toUpperCase() })}</button>)}</div><button className="primary" onClick={()=>setOpen(true)}>{t("integrations.configureButton")}</button></div><div className="grid"><Card title={t("integrations.plugins", { count: state.plugins.length })}>{state.plugins.length?state.plugins.map((p:any,i)=><div className="integration-card" key={p.name||i}><b>🔌 {p.name||p.id||t("integrations.pluginFallback", { number: i + 1 })}</b><p>{p.description||t("integrations.dynamicCapability")}</p></div>):<p className="empty-state">{t("integrations.noPlugins")}</p>}</Card><Card title={t("integrations.servers", { count: state.mcp.length })}>{state.mcp.length?state.mcp.map((s:any,i)=><Server key={s.id||s.name||i} server={s} index={i}/>):<p className="empty-state">{t("integrations.noServers")}</p>}</Card></div>{open&&<ConfigureMcp onClose={()=>setOpen(false)} reload={reload}/>}</> }
