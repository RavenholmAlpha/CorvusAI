import React, { useState } from "react";
import { Card, Modal, toast } from "../components";
import { deleteJson, postJson } from "../api";
import type { PageProps } from "./shared";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "skills.created": { en: "Skill created.", "zh-CN": "技能已创建。" },
  "skills.createError": { en: "Failed to create skill: {error}", "zh-CN": "创建技能失败：{error}" },
  "skills.deleteConfirm": { en: "Delete user skill “{id}”?", "zh-CN": "删除用户技能“{id}”？" },
  "skills.deleted": { en: "Skill deleted.", "zh-CN": "技能已删除。" },
  "skills.deleteError": { en: "Failed to delete skill: {error}", "zh-CN": "删除技能失败：{error}" },
  "skills.create": { en: "＋ CREATE SKILL", "zh-CN": "＋ 创建技能" },
  "skills.installed": { en: "Installed Agent Skills ({count})", "zh-CN": "已安装的智能体技能（{count}）" },
  "skills.builtin": { en: "BUILT-IN SYSTEM", "zh-CN": "系统内置" },
  "skills.project": { en: "CURRENT PROJECT", "zh-CN": "当前项目" },
  "skills.global": { en: "GLOBAL USER", "zh-CN": "全局用户" },
  "skills.id": { en: "ID: {id}", "zh-CN": "ID：{id}" },
  "skills.triggersMeta": { en: "TRIGGERS: {value}", "zh-CN": "触发词：{value}" },
  "skills.toolsMeta": { en: "TOOLS: {value}", "zh-CN": "工具：{value}" },
  "skills.empty": { en: "No skills found in workspace or global directory.", "zh-CN": "工作区或全局目录中未找到技能。" },
  "skills.modalTitle": { en: "Create Agent Skill", "zh-CN": "创建智能体技能" },
  "skills.skillId": { en: "SKILL ID", "zh-CN": "技能 ID" },
  "skills.displayName": { en: "DISPLAY NAME", "zh-CN": "显示名称" },
  "skills.triggers": { en: "TRIGGERS", "zh-CN": "触发词" },
  "skills.tools": { en: "TOOLS", "zh-CN": "工具" },
  "skills.commaSeparated": { en: "comma-separated", "zh-CN": "使用逗号分隔" },
  "skills.scope": { en: "SCOPE", "zh-CN": "作用域" },
  "skills.globalUser": { en: "Global user", "zh-CN": "全局用户" },
  "skills.currentProject": { en: "Current project", "zh-CN": "当前项目" },
  "skills.markdown": { en: "SKILL MARKDOWN", "zh-CN": "技能 MARKDOWN" },
  "skills.creating": { en: "CREATING…", "zh-CN": "创建中……" },
  "skills.createAction": { en: "CREATE SKILL", "zh-CN": "创建技能" },
  "skills.defaultBody": { en: "# Instructions\n", "zh-CN": "# 指令\n" },
  "skills.idPlaceholder": { en: "code-review", "zh-CN": "code-review" },
  "skills.namePlaceholder": { en: "Code Review", "zh-CN": "代码审查" },
  "skills.triggersPlaceholder": { en: "review, audit", "zh-CN": "审查, 审计" },
  "skills.toolsPlaceholder": { en: "read, grep", "zh-CN": "read, grep" },
});

export function SkillsPage({ state, reload }: PageProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", triggers: "", tools: "", body: t("skills.defaultBody"), scope: "global" });
  const create = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await postJson("/api/skills", { id: form.id, name: form.name, title: form.name, triggers: form.triggers.split(",").map(v => v.trim()).filter(Boolean), toolsRequired: form.tools.split(",").map(v => v.trim()).filter(Boolean), body: form.body, scope: form.scope, projectId: form.scope === "project" ? state.activeProjectId : undefined }); setOpen(false); await reload(); toast.success(t("skills.created")); } catch (err) { toast.error(t("skills.createError", { error: String(err) })); } finally { setBusy(false); } };
  const remove = async (id: string) => { if (!window.confirm(t("skills.deleteConfirm", { id }))) return; try { await deleteJson("/api/skills/" + encodeURIComponent(id)); await reload(); toast.success(t("skills.deleted")); } catch (err) { toast.error(t("skills.deleteError", { error: String(err) })); } };
  return <><div className="page-toolbar"><button className="primary" onClick={() => setOpen(true)}>{t("skills.create")}</button></div><div className="grid"><Card title={t("skills.installed", { count: state.skills.length })}>{state.skills.length ? state.skills.map(skill => { const builtin = skill.tier === "builtin" || skill.isBuiltin; return <article className="skill-card" key={skill.id}><div><div className="skill-title"><b>📜 {skill.title || skill.name}</b><span className="scope-badge">{builtin ? t("skills.builtin") : skill.tier === "workspace" ? t("skills.project") : t("skills.global")}</span></div>{skill.description && <p>{skill.description}</p>}<code>{t("skills.id", { id: skill.id })}</code>{skill.triggers?.length > 0 && <p className="skill-meta">{t("skills.triggersMeta", { value: skill.triggers.join(", ") })}</p>}{skill.toolsRequired?.length > 0 && <p className="skill-meta">{t("skills.toolsMeta", { value: skill.toolsRequired.join(", ") })}</p>}</div>{!builtin && <button className="danger" onClick={() => void remove(skill.id)}>{t("common.delete")}</button>}</article>; }) : <p className="empty-state">{t("skills.empty")}</p>}</Card></div>{open && <Modal title={t("skills.modalTitle")} onClose={() => setOpen(false)}><form onSubmit={create}><div className="form-columns"><label>{t("skills.skillId")}<input required pattern="[a-z0-9][a-z0-9-]*" value={form.id} onChange={e => setForm(v => ({ ...v, id: e.target.value }))} placeholder={t("skills.idPlaceholder")} /></label><label>{t("skills.displayName")}<input required value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder={t("skills.namePlaceholder")} /></label></div><div className="form-columns"><label>{t("skills.triggers")} <small>{t("skills.commaSeparated")}</small><input value={form.triggers} onChange={e => setForm(v => ({ ...v, triggers: e.target.value }))} placeholder={t("skills.triggersPlaceholder")} /></label><label>{t("skills.tools")} <small>{t("skills.commaSeparated")}</small><input value={form.tools} onChange={e => setForm(v => ({ ...v, tools: e.target.value }))} placeholder={t("skills.toolsPlaceholder")} /></label></div><label>{t("skills.scope")}<select value={form.scope} onChange={e => setForm(v => ({ ...v, scope: e.target.value }))}><option value="global">{t("skills.globalUser")}</option><option value="project">{t("skills.currentProject")}</option></select></label><label>{t("skills.markdown")}<textarea required rows={14} value={form.body} onChange={e => setForm(v => ({ ...v, body: e.target.value }))} /></label><div className="form-actions"><button type="button" onClick={() => setOpen(false)}>{t("common.cancel")}</button><button className="primary" disabled={busy}>{busy ? t("skills.creating") : t("skills.createAction")}</button></div></form></Modal>}</>;
}
