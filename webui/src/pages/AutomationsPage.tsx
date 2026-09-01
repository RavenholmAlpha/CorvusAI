import React, { useState } from "react";
import { Card, Modal, SimpleForm, toast } from "../components";
import { postJson } from "../api";
import { defineTranslations, useI18n } from "../i18n";
import type { PageProps } from "./shared";

defineTranslations({
  "automations.title": { en: "Scheduled Automations & Triggers", "zh-CN": "定时自动化与触发器" },
  "automations.add": { en: "＋ ADD AUTOMATION", "zh-CN": "＋ 添加自动化" },
  "automations.every": { en: "EVERY {seconds}s", "zh-CN": "每 {seconds} 秒" },
  "automations.workspace": { en: "Workspace: {id}", "zh-CN": "工作区：{id}" },
  "automations.role": { en: " · Role: {id}", "zh-CN": " · 角色：{id}" },
  "automations.status": { en: "Status: {status}", "zh-CN": "状态：{status}" },
  "automations.empty": { en: "No automated recurring tasks scheduled.", "zh-CN": "尚未安排自动重复任务。" },
  "automations.modal": { en: "Schedule Automation Task", "zh-CN": "安排自动化任务" },
  "automations.id": { en: "Automation Identifier", "zh-CN": "自动化标识符" },
  "automations.project": { en: "Project Workspace ID", "zh-CN": "项目工作区 ID" },
  "automations.roleField": { en: "Agent Role ID (Optional)", "zh-CN": "代理角色 ID（可选）" },
  "automations.interval": { en: "Interval in Seconds", "zh-CN": "间隔秒数" },
  "automations.prompt": { en: "Prompt / Instructions for Task", "zh-CN": "任务提示词 / 指令" },
  "automations.promptPlaceholder": { en: "Run audit and report diagnostics", "zh-CN": "运行审计并报告诊断结果" },
  "automations.created": { en: "Automation scheduled.", "zh-CN": "自动化任务已安排。" },
  "automations.failed": { en: "Failed to add automation: {error}", "zh-CN": "添加自动化失败：{error}" },
});

export function AutomationsPage({ state, reload }: PageProps) {
  const [open, setOpen] = useState(false); const { t } = useI18n();
  return <><div className="grid"><Card title={t("automations.title")} action={<button className="primary" onClick={() => setOpen(true)}>{t("automations.add")}</button>}>
    {Object.values(state.automations).length ? Object.values(state.automations).map((a:any)=><article key={a.id} style={{display:"flex",flexDirection:"column",alignItems:"stretch",gap:"8px",marginBottom:"8px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><b style={{color:a.enabled!==false?"var(--amber)":"var(--text-dim)",fontFamily:"var(--font-mono)"}}>{a.enabled!==false?"● ":"○ "}{a.label||a.id}</b><span style={{fontSize:"11px",fontFamily:"var(--font-mono)",color:"var(--vfd-cyan)"}}>{a.trigger?.type==="interval"?t("automations.every",{seconds:a.trigger.everySeconds}):a.trigger?.type||"interval"}</span></div><p style={{margin:0,fontSize:"12px",fontFamily:"var(--font-mono)",color:"var(--text-muted)"}}>{t("automations.workspace",{id:a.projectId})}{a.roleId&&t("automations.role",{id:a.roleId})}</p><pre style={{margin:0,fontSize:"12px",background:"#0a0b0d"}}>{a.prompt}</pre><small style={{color:"var(--text-dim)",fontFamily:"var(--font-mono)"}}>{t("automations.status",{status:JSON.stringify(state.automationStates.find(s=>s.id===a.id)??{})})}</small></article>):<p style={{color:"var(--text-muted)",margin:0}}>{t("automations.empty")}</p>}</Card></div>
    {open&&<Modal title={t("automations.modal")} onClose={()=>setOpen(false)}><SimpleForm fields={[{name:"id",label:t("automations.id"),placeholder:"e.g. daily-code-health"},{name:"projectId",label:t("automations.project"),placeholder:state.activeProjectId||""},{name:"roleId",label:t("automations.roleField"),placeholder:"reviewer"},{name:"everySeconds",label:t("automations.interval"),placeholder:"3600"},{name:"prompt",label:t("automations.prompt"),placeholder:t("automations.promptPlaceholder")}]} onSubmit={async v=>{try{await postJson("/api/automations",v);setOpen(false);await reload();toast.success(t("automations.created"))}catch(e){toast.error(t("automations.failed",{error:String(e)}))}}}/></Modal>}</>;
}
