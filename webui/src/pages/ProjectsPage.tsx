import React, { useCallback, useEffect, useState } from "react";
import { Modal, SimpleForm, toast } from "../components";
import { deleteJson, getJson, postJson } from "../api";
import type { ProjectSummary } from "../types";
import type { PageProps } from "./shared";

export function ProjectsPage({ state, reload }: PageProps) {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [dispatchProject, setDispatchProject] = useState<{ id: string; name: string } | null>(null);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [unloadingId, setUnloadingId] = useState<string | null>(null);

  const loadSummary = useCallback(async (projectId: string, notify = false) => {
    setSyncingId(projectId);
    try {
      const summary = await getJson<ProjectSummary>(
        `/api/projects/${encodeURIComponent(projectId)}/summary`,
      );
      setSummaries((current) => ({ ...current, [projectId]: summary }));
      if (notify) toast.success("Branch status synchronized.");
    } catch (error) {
      if (notify) toast.error("Failed to sync branch status: " + String(error));
    } finally {
      setSyncingId((current) => current === projectId ? null : current);
    }
  }, []);

  useEffect(() => {
    for (const project of state.projects) void loadSummary(project.id);
  }, [state.projects, loadSummary]);

  const activate = async (projectId: string) => {
    try {
      await postJson("/api/projects/active", { projectId });
      await reload();
      toast.success("Active project workspace switched.");
    } catch (error) {
      toast.error("Failed to switch workspace: " + String(error));
    }
  };

  const unload = async (projectId: string) => {
    if (!window.confirm("Unload this workspace? Files on disk will not be deleted.")) return;
    setUnloadingId(projectId);
    try {
      await deleteJson(`/api/projects/${encodeURIComponent(projectId)}`);
      setSummaries((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      await reload();
      toast.success("Workspace unloaded.");
    } catch (error) {
      toast.error("Failed to unload workspace: " + String(error));
    } finally {
      setUnloadingId(null);
    }
  };

  return (
    <>
      <div className="page-toolbar">
        <button className="primary" onClick={() => setRegisterOpen(true)}>
          ＋ REGISTER NEW WORKSPACE
        </button>
      </div>

      <div className="list">
        {state.projects.map((project) => {
          const active = project.id === state.activeProjectId;
          const summary = summaries[project.id];
          const syncing = syncingId === project.id;
          const unloading = unloadingId === project.id;

          return (
            <article className={active ? "selected" : ""} key={project.id}>
              <div className="project-info">
                <b>{active ? "● [ACTIVE WORKSPACE] " : "○ "}{project.name}</b>
                <p>PATH: {project.path}</p>
                <small>ID: {project.id}</small>
                <div className="project-summary" aria-label={`${project.name} branch summary`}>
                  {summary ? (
                    <>
                      <span>BRANCH <b>{summary.branch || "unknown"}</b></span>
                      <span className={summary.clean === false ? "warning" : "ok"}>
                        {summary.clean === false ? `${summary.changedFiles ?? "?"} CHANGED` : "CLEAN"}
                      </span>
                      {(summary.ahead !== undefined || summary.behind !== undefined) && (
                        <span>↑{summary.ahead || 0} ↓{summary.behind || 0}</span>
                      )}
                      {summary.summary && <span>{summary.summary}</span>}
                    </>
                  ) : (
                    <span>{syncing ? "SYNCING BRANCH STATUS…" : "SUMMARY UNAVAILABLE"}</span>
                  )}
                </div>
              </div>

              <div className="project-actions">
                <button onClick={() => setDispatchProject({ id: project.id, name: project.name })}>
                  DISPATCH TASK
                </button>
                <button disabled={syncing} onClick={() => void loadSummary(project.id, true)}>
                  {syncing ? "SYNCING…" : "SYNC BRANCH STATUS"}
                </button>
                <button className={active ? "primary" : ""} disabled={active} onClick={() => void activate(project.id)}>
                  {active ? "CURRENT ACTIVE" : "ACTIVATE"}
                </button>
                <button className="danger" disabled={unloading} onClick={() => void unload(project.id)}>
                  {unloading ? "UNLOADING…" : "UNLOAD WORKSPACE"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {dispatchProject && (
        <Modal title={`Dispatch to ${dispatchProject.name} Project Agent`} onClose={() => setDispatchProject(null)}>
          <SimpleForm
            fields={[
              { name: "description", label: "Task Description" },
              { name: "prompt", label: "Detailed Prompt" },
              { name: "roleId", label: "Role ID (optional)" },
            ]}
            onSubmit={async (value) => {
              await postJson("/api/v1/dispatches", { target: { kind: "project", id: dispatchProject.id }, ...value });
              setDispatchProject(null);
              await reload();
              toast.success("Task dispatched.");
            }}
          />
        </Modal>
      )}

      {registerOpen && (
        <Modal title="Register Local Project Workspace" onClose={() => setRegisterOpen(false)}>
          <SimpleForm
            fields={[
              { name: "name", label: "Project Workspace Name" },
              { name: "path", label: "Absolute Filesystem Path" },
            ]}
            onSubmit={async (value) => {
              await postJson("/api/projects", value);
              setRegisterOpen(false);
              await reload();
              toast.success("Workspace registered.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
