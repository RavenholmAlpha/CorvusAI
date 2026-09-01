import React, { useCallback, useEffect, useState } from "react";
import { Modal, SimpleForm, toast } from "../components";
import { deleteJson, getJson, postJson } from "../api";
import type { ProjectSummary } from "../types";
import type { PageProps } from "./shared";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "projects.branchSynced": { en: "Branch status synchronized.", "zh-CN": "分支状态已同步。" },
  "projects.syncFailed": { en: "Failed to sync branch status: {error}", "zh-CN": "同步分支状态失败：{error}" },
  "projects.switched": { en: "Active project workspace switched.", "zh-CN": "已切换活动项目工作区。" },
  "projects.switchFailed": { en: "Failed to switch workspace: {error}", "zh-CN": "切换工作区失败：{error}" },
  "projects.unloadConfirm": { en: "Unload this workspace? Files on disk will not be deleted.", "zh-CN": "卸载此工作区？磁盘上的文件不会被删除。" },
  "projects.unloaded": { en: "Workspace unloaded.", "zh-CN": "工作区已卸载。" },
  "projects.unloadFailed": { en: "Failed to unload workspace: {error}", "zh-CN": "卸载工作区失败：{error}" },
  "projects.registerNew": { en: "＋ REGISTER NEW WORKSPACE", "zh-CN": "＋ 注册新工作区" },
  "projects.activeWorkspace": { en: "● [ACTIVE WORKSPACE] ", "zh-CN": "● [活动工作区] " },
  "projects.path": { en: "PATH", "zh-CN": "路径" },
  "projects.id": { en: "ID", "zh-CN": "ID" },
  "projects.branchSummary": { en: "{name} branch summary", "zh-CN": "{name} 的分支摘要" },
  "projects.branch": { en: "BRANCH", "zh-CN": "分支" },
  "projects.unknown": { en: "unknown", "zh-CN": "未知" },
  "projects.changed": { en: "{count} CHANGED", "zh-CN": "{count} 个更改" },
  "projects.clean": { en: "CLEAN", "zh-CN": "干净" },
  "projects.syncingStatus": { en: "SYNCING BRANCH STATUS…", "zh-CN": "正在同步分支状态…" },
  "projects.summaryUnavailable": { en: "SUMMARY UNAVAILABLE", "zh-CN": "摘要不可用" },
  "projects.dispatchTask": { en: "DISPATCH TASK", "zh-CN": "派发任务" },
  "projects.syncing": { en: "SYNCING…", "zh-CN": "同步中…" },
  "projects.syncBranch": { en: "SYNC BRANCH STATUS", "zh-CN": "同步分支状态" },
  "projects.currentActive": { en: "CURRENT ACTIVE", "zh-CN": "当前活动" },
  "projects.activate": { en: "ACTIVATE", "zh-CN": "激活" },
  "projects.unloading": { en: "UNLOADING…", "zh-CN": "卸载中…" },
  "projects.unload": { en: "UNLOAD WORKSPACE", "zh-CN": "卸载工作区" },
  "projects.dispatchTitle": { en: "Dispatch to {name} Project Agent", "zh-CN": "派发给 {name} 项目智能体" },
  "projects.taskDescription": { en: "Task Description", "zh-CN": "任务描述" },
  "projects.detailedPrompt": { en: "Detailed Prompt", "zh-CN": "详细提示词" },
  "projects.roleOptional": { en: "Role ID (optional)", "zh-CN": "角色 ID（可选）" },
  "projects.dispatched": { en: "Task dispatched.", "zh-CN": "任务已派发。" },
  "projects.registerTitle": { en: "Register Local Project Workspace", "zh-CN": "注册本地项目工作区" },
  "projects.workspaceName": { en: "Project Workspace Name", "zh-CN": "项目工作区名称" },
  "projects.absolutePath": { en: "Absolute Filesystem Path", "zh-CN": "绝对文件系统路径" },
  "projects.registered": { en: "Workspace registered.", "zh-CN": "工作区已注册。" },
});

export function ProjectsPage({ state, reload }: PageProps) {
  const { t } = useI18n();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [dispatchProject, setDispatchProject] = useState<{ id: string; name: string } | null>(null);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [unloadingId, setUnloadingId] = useState<string | null>(null);
  const loadSummary = useCallback(async (projectId: string, notify = false) => { setSyncingId(projectId); try { const summary = await getJson<ProjectSummary>(`/api/projects/${encodeURIComponent(projectId)}/summary`); setSummaries(c => ({...c,[projectId]:summary})); if(notify) toast.success(t("projects.branchSynced")); } catch(error) { if(notify) toast.error(t("projects.syncFailed",{error:String(error)})); } finally { setSyncingId(c=>c===projectId?null:c); } }, [t]);
  useEffect(()=>{for(const project of state.projects) void loadSummary(project.id)},[state.projects,loadSummary]);
  const activate=async(projectId:string)=>{try{await postJson("/api/projects/active",{projectId});await reload();toast.success(t("projects.switched"))}catch(error){toast.error(t("projects.switchFailed",{error:String(error)}))}};
  const unload=async(projectId:string)=>{if(!window.confirm(t("projects.unloadConfirm")))return;setUnloadingId(projectId);try{await deleteJson(`/api/projects/${encodeURIComponent(projectId)}`);setSummaries(c=>{const n={...c};delete n[projectId];return n});await reload();toast.success(t("projects.unloaded"))}catch(error){toast.error(t("projects.unloadFailed",{error:String(error)}))}finally{setUnloadingId(null)}};
  return <><div className="page-toolbar"><button className="primary" onClick={()=>setRegisterOpen(true)}>{t("projects.registerNew")}</button></div><div className="list">{state.projects.map(project=>{const active=project.id===state.activeProjectId,summary=summaries[project.id],syncing=syncingId===project.id,unloading=unloadingId===project.id;return <article className={active?"selected":""} key={project.id}><div className="project-info"><b>{active?t("projects.activeWorkspace"):"○ "}{project.name}</b><p>{t("projects.path")}: {project.path}</p><small>{t("projects.id")}: {project.id}</small><div className="project-summary" aria-label={t("projects.branchSummary",{name:project.name})}>{summary?<><span>{t("projects.branch")} <b>{summary.branch||t("projects.unknown")}</b></span><span className={summary.clean===false?"warning":"ok"}>{summary.clean===false?t("projects.changed",{count:summary.changedFiles??"?"}):t("projects.clean")}</span>{(summary.ahead!==undefined||summary.behind!==undefined)&&<span>↑{summary.ahead||0} ↓{summary.behind||0}</span>}{summary.summary&&<span>{summary.summary}</span>}</>:<span>{syncing?t("projects.syncingStatus"):t("projects.summaryUnavailable")}</span>}</div></div><div className="project-actions"><button onClick={()=>setDispatchProject({id:project.id,name:project.name})}>{t("projects.dispatchTask")}</button><button disabled={syncing} onClick={()=>void loadSummary(project.id,true)}>{syncing?t("projects.syncing"):t("projects.syncBranch")}</button><button className={active?"primary":""} disabled={active} onClick={()=>void activate(project.id)}>{active?t("projects.currentActive"):t("projects.activate")}</button><button className="danger" disabled={unloading} onClick={()=>void unload(project.id)}>{unloading?t("projects.unloading"):t("projects.unload")}</button></div></article>})}</div>{dispatchProject&&<Modal title={t("projects.dispatchTitle",{name:dispatchProject.name})} onClose={()=>setDispatchProject(null)}><SimpleForm fields={[{name:"description",label:t("projects.taskDescription")},{name:"prompt",label:t("projects.detailedPrompt")},{name:"roleId",label:t("projects.roleOptional")}]} onSubmit={async value=>{await postJson("/api/v1/dispatches",{target:{kind:"project",id:dispatchProject.id},...value});setDispatchProject(null);await reload();toast.success(t("projects.dispatched"))}}/></Modal>}{registerOpen&&<Modal title={t("projects.registerTitle")} onClose={()=>setRegisterOpen(false)}><SimpleForm fields={[{name:"name",label:t("projects.workspaceName")},{name:"path",label:t("projects.absolutePath")}]} onSubmit={async value=>{await postJson("/api/projects",value);setRegisterOpen(false);await reload();toast.success(t("projects.registered"))}}/></Modal>}</>;
}
