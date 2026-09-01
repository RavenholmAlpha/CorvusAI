import type { CorvusDatabase } from "../db/connection.js";
import { createHash } from "node:crypto";
import type { ChatRole } from "../types.js";
import type { EventLog } from "./event-log.js";
import {
  newId,
  type AgentRow,
  type ProjectRow,
  type SessionRow,
  nowIso,
  serializeDurableJson,
  serializeDurableJsonObject,
  type JsonObject,
  type JsonValue,
  type MessageRow,
  type RunRow,
  type RunStatus,
  type SnapshotRow,
  type StepKind,
  type StepRow,
  type StepStatus,
  type SubagentTaskRow,
  type SubagentTaskStatus,
  type ScopeLeaseRow,
  type ScopeLeaseStatus,
  type ProjectMemoryRow,
} from "./types.js";

export interface CreateRunInput {
  goal: string;
  model: string;
  endpoint: string;
  sessionId?: string;
}

export interface CreateStepInput {
  runId: string;
  kind: StepKind;
  status: StepStatus;
  title: string;
}

export interface AppendMessageInput {
  runId: string;
  role: ChatRole;
  content: string | null;
  toolCallId?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface SubagentTaskDbRow {
  id: string;
  parent_run_id: string | null;
  parent_session_id: string;
  child_session_id: string;
  prompt: string;
  description: string | null;
  model_profile: string | null;
  agent_scope: "project" | "global"; project_id: string | null; parent_task_id: string | null;
  depth: number;
  status: SubagentTaskStatus;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

function mapSubagentTaskRow(row: SubagentTaskDbRow): SubagentTaskRow {
  return {
    id: row.id, parentRunId: row.parent_run_id, parentSessionId: row.parent_session_id, childSessionId: row.child_session_id,
    prompt: row.prompt, description: row.description, modelProfile: row.model_profile, agentScope: row.agent_scope, projectId: row.project_id, parentTaskId: row.parent_task_id, depth: row.depth, status: row.status, error: row.error,
    createdAt: row.created_at, completedAt: row.completed_at,
  };
}

interface ScopeLeaseDbRow {
  id: string;
  task_id: string;
  scope: string;
  status: ScopeLeaseStatus;
  conflict_level: "none" | "hierarchical";
  created_at: string;
  heartbeat_at: string;
  expires_at: string;
  released_at: string | null;
}

function mapScopeLeaseRow(row: ScopeLeaseDbRow): ScopeLeaseRow {
  return { id: row.id, taskId: row.task_id, scope: row.scope, status: row.status, conflictLevel: row.conflict_level, createdAt: row.created_at, heartbeatAt: row.heartbeat_at, expiresAt: row.expires_at, releasedAt: row.released_at };
}

interface ProjectMemoryDbRow {
  id: string;
  project_id: string;
  task_id: string | null;
  kind: "handoff" | "pitfall" | "decision" | "open_issue";
  title: string;
  content: string;
  confidence: number;
  status: "active" | "obsolete";
  scope: "session" | "project" | "global"; source_type: ProjectMemoryRow["sourceType"]; source_id: string | null; content_hash: string | null; verified: number; sensitivity: ProjectMemoryRow["sensitivity"];
  created_at: string;
  updated_at: string;
}

function mapProjectMemoryRow(row: ProjectMemoryDbRow): ProjectMemoryRow {
  return { id: row.id, projectId: row.project_id, taskId: row.task_id, kind: row.kind, title: row.title, content: row.content, confidence: row.confidence, status: row.status, scope: row.scope, sourceType: row.source_type, sourceId: row.source_id, contentHash: row.content_hash, verified: Boolean(row.verified), sensitivity: row.sensitivity, createdAt: row.created_at, updatedAt: row.updated_at };
}

interface RunDbRow {
  id: string;
  status: RunStatus;
  goal: string;
  model: string;
  endpoint: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ProjectDbRow {
  id: string;
  name: string;
  path: string;
  config_json: string | null;
  last_session_id: string | null;
  main_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionDbRow {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  kind: SessionRow["kind"];
  parent_session_id: string | null;
  provider_id: string | null;
  model: string | null;
  context_window_tokens: number | null;
  name: string | null;
  preview: string | null;
  message_count: number;
  total_tokens: number;
  created_at: string;
  last_active_at: string;
  archived_at: string | null;
}

function mapProjectRow(row: ProjectDbRow): ProjectRow {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    config: row.config_json ? (JSON.parse(row.config_json) as JsonObject) : null,
    lastSessionId: row.last_session_id,
    mainAgentId: row.main_agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionRow(row: SessionDbRow): SessionRow {
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id,
    kind: row.kind,
    parentSessionId: row.parent_session_id,
    providerId: row.provider_id ?? null,
    model: row.model ?? null,
    contextWindowTokens: row.context_window_tokens ?? null,
    name: row.name,
    preview: row.preview,
    messageCount: row.message_count,
    totalTokens: row.total_tokens,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    archivedAt: row.archived_at,
  };
}

interface StepDbRow {
  id: string;
  run_id: string;
  index: number;
  kind: StepKind;
  status: StepStatus;
  title: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface MessageDbRow {
  id: string;
  run_id: string;
  role: ChatRole;
  content: string | null;
  tool_call_id: string | null;
  metadata_json: string | null;
  created_at: string;
}

interface SnapshotDbRow {
  id: string;
  run_id: string;
  snapshot_json: string;
  created_at: string;
}

const terminalRunStatuses = new Set<RunStatus>(["succeeded", "failed", "canceled", "interrupted"]);
const terminalStepStatuses = new Set<StepStatus>(["succeeded", "failed", "canceled", "interrupted"]);

export class RunStore {
  constructor(
    private readonly db: CorvusDatabase,
    private readonly events: EventLog,
  ) {}

  createRun(input: CreateRunInput): RunRow {
    return this.db.transaction(() => {
      const timestamp = nowIso();
      const run: RunRow = {
        id: newId("run"),
        status: "created",
        goal: input.goal,
        model: input.model,
        endpoint: input.endpoint,
        sessionId: input.sessionId ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      };

      this.db
        .prepare(
          `insert into runs (id, status, goal, model, endpoint, session_id, created_at, updated_at, completed_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(run.id, run.status, run.goal, run.model, run.endpoint, run.sessionId, run.createdAt, run.updatedAt, run.completedAt);
      this.events.append(
        "run.created",
        { runId: run.id, goal: run.goal, model: run.model, endpoint: run.endpoint, sessionId: run.sessionId },
        run.id,
      );
      return run;
    })();
  }

  getRun(id: string): RunRow | undefined {
    const row = this.db
      .prepare("select id, status, goal, model, endpoint, session_id, created_at, updated_at, completed_at from runs where id = ?")
      .get(id);
    return row ? mapRunRow(row as RunDbRow) : undefined;
  }

  ensureMasterAgent(): AgentRow { const existing=this.listAgents().find(agent=>agent.kind==="master");if(existing)return existing;return this.createAgent({kind:"master",projectId:null,parentAgentId:null,labelConfig:{label:"Corvus Master Agent"}}); }
  ensureProjectAgent(projectId:string,parentAgentId?:string):AgentRow { const existing=this.listAgents().find(agent=>agent.kind==="project"&&agent.projectId===projectId);if(existing)return existing;const masterId=parentAgentId??this.ensureMasterAgent().id;const agent=this.createAgent({kind:"project",projectId,parentAgentId:masterId,labelConfig:{label:(this.getProject(projectId)?.name??projectId)+" Project Agent"}});this.db.prepare("update projects set main_agent_id=? where id=?").run(agent.id,projectId);return agent; }
  createAgent(input:{kind:AgentRow["kind"];projectId:string|null;parentAgentId:string|null;roleId?:string|null;labelConfig?:JsonObject}):AgentRow { const now=nowIso(),row:AgentRow={id:newId("agent"),kind:input.kind,projectId:input.projectId,parentAgentId:input.parentAgentId,roleId:input.roleId??null,status:"active",config:input.labelConfig??null,createdAt:now,updatedAt:now};this.db.prepare("insert into agents (id,kind,project_id,parent_agent_id,role_id,status,config_json,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)").run(row.id,row.kind,row.projectId,row.parentAgentId,row.roleId,row.status,row.config?JSON.stringify(row.config):null,row.createdAt,row.updatedAt);return row; }
  listAgents():AgentRow[]{return(this.db.prepare("select id,kind,project_id,parent_agent_id,role_id,status,config_json,created_at,updated_at from agents order by created_at,id").all() as any[]).map(row=>({id:row.id,kind:row.kind,projectId:row.project_id,parentAgentId:row.parent_agent_id,roleId:row.role_id,status:row.status,config:row.config_json?JSON.parse(row.config_json):null,createdAt:row.created_at,updatedAt:row.updated_at}))}

  createProject(name: string, path: string, config?: JsonObject): ProjectRow {
    const timestamp = nowIso();
    const project: ProjectRow = {
      id: newId("proj"),
      name, path, config: config ?? null, lastSessionId: null, mainAgentId: null, createdAt: timestamp, updatedAt: timestamp,
    };
    this.db.prepare("insert into projects (id, name, path, config_json, last_session_id, main_agent_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(project.id, project.name, project.path, project.config ? JSON.stringify(project.config) : null, null, null, timestamp, timestamp);
    const agent=this.ensureProjectAgent(project.id);const session=this.createSession(project.id,project.name+" Project Main",{agentId:agent.id,kind:"project_main"});return this.getProject(project.id)!;
  }

  listProjects(): ProjectRow[] {
    return this.db.prepare("select id, name, path, config_json, last_session_id, main_agent_id, created_at, updated_at from projects order by updated_at desc, id")
      .all().map((row) => mapProjectRow(row as ProjectDbRow));
  }

  getProject(id: string): ProjectRow | undefined {
    const row = this.db.prepare("select id, name, path, config_json, last_session_id, main_agent_id, created_at, updated_at from projects where id = ?").get(id);
    return row ? mapProjectRow(row as ProjectDbRow) : undefined;
  }

  updateProjectConfig(id: string, config: JsonObject | null): ProjectRow | undefined {
    const updatedAt = nowIso();
    this.db.prepare("update projects set config_json = ?, updated_at = ? where id = ?")
      .run(config ? JSON.stringify(config) : null, updatedAt, id);
    return this.getProject(id);
  }

  renameProject(id: string, name: string): ProjectRow | undefined {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Project name cannot be empty");
    this.db.prepare("update projects set name = ?, updated_at = ? where id = ?").run(trimmed, nowIso(), id);
    return this.getProject(id);
  }

  assignSessionProject(sessionId: string, projectId: string): void {
    this.db.prepare("update sessions set project_id = ? where id = ?").run(projectId, sessionId);
  }

  assignSessionAgent(sessionId:string,agentId:string,kind:SessionRow["kind"],parentSessionId?:string|null):void{this.db.prepare("update sessions set agent_id=?,kind=?,parent_session_id=? where id=?").run(agentId,kind,parentSessionId??null,sessionId)}

  renameSession(sessionId: string, name: string): SessionRow | undefined {
    this.db.prepare("update sessions set name = ?, last_active_at = ? where id = ?").run(name, nowIso(), sessionId);
    return this.listSessions().find((session) => session.id === sessionId);
  }

  archiveSession(sessionId: string): SessionRow | undefined {
    this.db.prepare("update sessions set archived_at = ? where id = ?").run(nowIso(), sessionId);
    return this.listArchivedSessions().find((session) => session.id === sessionId);
  }

  restoreSession(sessionId: string): SessionRow | undefined {
    this.db.prepare("update sessions set archived_at = null where id = ?").run(sessionId);
    return this.listSessions().find((session) => session.id === sessionId);
  }

  getSession(sessionId: string): SessionRow | undefined {
    const row = this.db.prepare("select id, project_id, agent_id, kind, parent_session_id, provider_id, model, context_window_tokens, name, preview, message_count, total_tokens, created_at, last_active_at, archived_at from sessions where id = ?").get(sessionId);
    return row ? mapSessionRow(row as SessionDbRow) : undefined;
  }

  listArchivedSessions(projectId?: string | null): SessionRow[] {
    const columns = "id, project_id, agent_id, kind, parent_session_id, provider_id, model, context_window_tokens, name, preview, message_count, total_tokens, created_at, last_active_at, archived_at";
    const sql = projectId === undefined ? `select ${columns} from sessions where archived_at is not null order by archived_at desc` : `select ${columns} from sessions where project_id is ? and archived_at is not null order by archived_at desc`;
    const rows = projectId === undefined ? this.db.prepare(sql).all() : this.db.prepare(sql).all(projectId);
    return rows.map((row) => mapSessionRow(row as SessionDbRow));
  }

  deleteSession(sessionId: string): void {
    this.db.transaction(() => {
      this.db.prepare("delete from runs where session_id = ?").run(sessionId);
      this.db.prepare("delete from sessions where id = ?").run(sessionId);
    })();
  }

  deleteProject(projectId: string): void {
    this.db.transaction(() => {
      this.db.prepare("delete from runs where session_id in (select id from sessions where project_id = ?)").run(projectId);
      this.db.prepare("delete from projects where id = ?").run(projectId);
    })();
  }

  assignUnscopedSessions(projectId: string): void {
    this.db.prepare("update sessions set project_id = ? where project_id is null").run(projectId);
  }

  createSession(projectId: string | null, name?: string, identity: { agentId?: string | null; kind?: SessionRow["kind"]; parentSessionId?: string | null } = {}): SessionRow {
    const timestamp = nowIso();
    const session: SessionRow = {
      id: newId("sess"), projectId, agentId: identity.agentId ?? (projectId ? this.ensureProjectAgent(projectId).id : this.ensureMasterAgent().id), kind: identity.kind ?? (projectId === null ? "master" : "project_main"), parentSessionId: identity.parentSessionId ?? null, providerId: null, model: null, contextWindowTokens: null, name: name ?? null, preview: null, messageCount: 0, totalTokens: 0,
      createdAt: timestamp, lastActiveAt: timestamp, archivedAt: null,
    };
    this.db.prepare("insert into sessions (id, project_id, agent_id, kind, parent_session_id, provider_id, model, context_window_tokens, name, preview, message_count, total_tokens, created_at, last_active_at, archived_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(session.id, session.projectId, session.agentId, session.kind, session.parentSessionId, session.providerId, session.model, session.contextWindowTokens, session.name, session.preview, session.messageCount, session.totalTokens, session.createdAt, session.lastActiveAt, null);
    if (projectId) {
      this.db.prepare("update projects set last_session_id = ?, updated_at = ? where id = ?").run(session.id, timestamp, projectId);
    }
    return session;
  }

  setSessionModel(sessionId: string, providerId: string | null, model: string | null, contextWindowTokens: number | null): SessionRow | undefined {
    this.db.prepare("update sessions set provider_id = ?, model = ?, context_window_tokens = ?, last_active_at = ? where id = ?").run(providerId, model, contextWindowTokens, nowIso(), sessionId);
    return this.getSession(sessionId);
  }

  touchSession(sessionId: string): void {
    this.db.prepare("update sessions set last_active_at = ? where id = ?").run(nowIso(), sessionId);
  }

  listSessions(projectId?: string | null): SessionRow[] {
    const query = projectId === undefined
      ? `select s.id, s.project_id, s.agent_id, s.kind, s.parent_session_id, s.provider_id, s.model, s.context_window_tokens, s.name, s.archived_at,
           coalesce((select m.content from messages m join runs r on r.id = m.run_id where r.session_id = s.id and m.role = 'user' order by m.created_at desc limit 1), s.preview) as preview,
           (select count(*) from messages m join runs r on r.id = m.run_id where r.session_id = s.id) as message_count,
           s.total_tokens, s.created_at, s.last_active_at from sessions s where s.archived_at is null order by s.last_active_at desc, s.id`
      : `select s.id, s.project_id, s.agent_id, s.kind, s.parent_session_id, s.provider_id, s.model, s.context_window_tokens, s.name,
           coalesce((select m.content from messages m join runs r on r.id = m.run_id where r.session_id = s.id and m.role = 'user' order by m.created_at desc limit 1), s.preview) as preview,
           (select count(*) from messages m join runs r on r.id = m.run_id where r.session_id = s.id) as message_count,
           s.total_tokens, s.created_at, s.last_active_at from sessions s where s.project_id is ? and s.archived_at is null order by s.last_active_at desc, s.id`;
    const stmt = this.db.prepare(query);
    const rows = projectId === undefined ? stmt.all() : stmt.all(projectId);
    return rows.map((row) => mapSessionRow(row as SessionDbRow));
  }

  getLatestSession(projectId?: string | null): SessionRow | undefined {
    const query = projectId === undefined
      ? `select s.id, s.project_id, s.agent_id, s.kind, s.parent_session_id, s.provider_id, s.model, s.context_window_tokens, s.name,
           coalesce((select m.content from messages m join runs r on r.id = m.run_id where r.session_id = s.id and m.role = 'user' order by m.created_at desc limit 1), s.preview) as preview,
           (select count(*) from messages m join runs r on r.id = m.run_id where r.session_id = s.id) as message_count,
           s.total_tokens, s.created_at, s.last_active_at from sessions s order by s.last_active_at desc limit 1`
      : `select s.id, s.project_id, s.agent_id, s.kind, s.parent_session_id, s.provider_id, s.model, s.context_window_tokens, s.name,
           coalesce((select m.content from messages m join runs r on r.id = m.run_id where r.session_id = s.id and m.role = 'user' order by m.created_at desc limit 1), s.preview) as preview,
           (select count(*) from messages m join runs r on r.id = m.run_id where r.session_id = s.id) as message_count,
           s.total_tokens, s.created_at, s.last_active_at from sessions s where s.project_id is ? order by s.last_active_at desc limit 1`;
    const row = projectId === undefined ? this.db.prepare(query).get() : this.db.prepare(query).get(projectId);
    return row ? mapSessionRow(row as SessionDbRow) : undefined;
  }

  listMasterSessions(): SessionRow[] {
    return this.listSessions(null);
  }

  getLatestMasterSession(): SessionRow | undefined {
    return this.getLatestSession(null);
  }

  listSessionMessages(sessionId: string): MessageRow[] {
    return this.db
      .prepare(
        `select messages.id, messages.run_id, messages.role, messages.content, messages.tool_call_id, messages.metadata_json, messages.created_at
         from messages
         join runs on runs.id = messages.run_id
         where runs.session_id = ? and messages.role in ('user', 'assistant', 'tool')
         order by messages.created_at, messages.id`,
      )
      .all(sessionId)
      .map((row) => mapMessageRow(row as MessageDbRow));
  }

  createSubagentTask(input: { id: string; parentRunId?: string | null; parentSessionId: string; childSessionId: string; prompt: string; description?: string | null; modelProfile?: string | null; agentScope?: "project" | "global"; projectId?: string | null; parentTaskId?: string | null; depth: number }): SubagentTaskRow {
    const createdAt = nowIso();
    this.db.prepare("insert into subagent_tasks (id, parent_run_id, parent_session_id, child_session_id, prompt, description, model_profile, agent_scope, project_id, parent_task_id, depth, status, error, created_at, completed_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(input.id, input.parentRunId ?? null, input.parentSessionId, input.childSessionId, input.prompt, input.description ?? null, input.modelProfile ?? null, input.agentScope ?? (input.projectId ? "project" : "global"), input.projectId ?? null, input.parentTaskId ?? null, input.depth, "running", null, createdAt, null);
    const task = this.getSubagentTask(input.id);
    if (!task) throw new Error("Subagent task not found after create");
    return task;
  }

  getSubagentTask(id: string): SubagentTaskRow | undefined {
    const row = this.db.prepare("select id, parent_run_id, parent_session_id, child_session_id, prompt, description, model_profile, agent_scope, project_id, parent_task_id, depth, status, error, created_at, completed_at from subagent_tasks where id = ?").get(id);
    return row ? mapSubagentTaskRow(row as SubagentTaskDbRow) : undefined;
  }

  updateSubagentTask(id: string, status: SubagentTaskStatus, error?: string | null): SubagentTaskRow {
    const completedAt = status === "running" ? null : nowIso();
    this.db.prepare("update subagent_tasks set status = ?, error = ?, completed_at = ? where id = ?").run(status, error ?? null, completedAt, id);
    const task = this.getSubagentTask(id);
    if (!task) throw new Error("Subagent task not found after update");
    return task;
  }

  listSubagentTasks(parentSessionId?: string): SubagentTaskRow[] {
    const sql = parentSessionId
      ? "select id, parent_run_id, parent_session_id, child_session_id, prompt, description, model_profile, agent_scope, project_id, parent_task_id, depth, status, error, created_at, completed_at from subagent_tasks where parent_session_id = ? order by created_at desc"
      : "select id, parent_run_id, parent_session_id, child_session_id, prompt, description, model_profile, agent_scope, project_id, parent_task_id, depth, status, error, created_at, completed_at from subagent_tasks order by created_at desc";
    const rows = parentSessionId ? this.db.prepare(sql).all(parentSessionId) : this.db.prepare(sql).all();
    return rows.map((row) => mapSubagentTaskRow(row as SubagentTaskDbRow));
  }

  claimScopeLease(taskId: string, scope: string, ttlSeconds = 1800): ScopeLeaseRow {
    const now = nowIso();
    this.db.prepare("update scope_leases set status = 'released', released_at = ? where status = 'active' and expires_at <= ?").run(now, now);
    const activeRows = this.db.prepare("select id, task_id, scope, status, conflict_level, created_at, heartbeat_at, expires_at, released_at from scope_leases where status = 'active'").all() as ScopeLeaseDbRow[];
    const exact = activeRows.find((item) => item.scope === scope);
    if (exact) {
      if (exact.task_id === taskId) { this.heartbeatScopeLease(exact.id, ttlSeconds); return this.listScopeLeases(taskId).find((item) => item.id === exact.id)!; }
      throw new Error("SCOPE_CONFLICT: " + scope + " is leased by task " + exact.task_id);
    }
    const hierarchical = activeRows.some((item) => item.task_id !== taskId && (item.scope.startsWith(scope + "/") || scope.startsWith(item.scope + "/")));
    const expiresAt = new Date(Date.now() + Math.max(30, ttlSeconds) * 1000).toISOString();
    const row: ScopeLeaseRow = { id: newId("lease"), taskId, scope, status: "active", conflictLevel: hierarchical ? "hierarchical" : "none", createdAt: now, heartbeatAt: now, expiresAt, releasedAt: null };
    this.db.prepare("insert into scope_leases (id, task_id, scope, status, conflict_level, created_at, heartbeat_at, expires_at, released_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.taskId, row.scope, row.status, row.conflictLevel, row.createdAt, row.heartbeatAt, row.expiresAt, row.releasedAt);
    return row;
  }

  heartbeatScopeLease(leaseId: string, ttlSeconds = 1800): void {
    const now = nowIso();
    const expiresAt = new Date(Date.now() + Math.max(30, ttlSeconds) * 1000).toISOString();
    const result = this.db.prepare("update scope_leases set heartbeat_at = ?, expires_at = ? where id = ? and status = 'active'").run(now, expiresAt, leaseId);
    if (result.changes === 0) throw new Error("Scope lease is missing or inactive: " + leaseId);
  }

  releaseScopeLeases(taskId: string): void {
    this.db.prepare("update scope_leases set status = 'released', released_at = ? where task_id = ? and status = 'active'").run(nowIso(), taskId);
  }

  listScopeLeases(taskId?: string): ScopeLeaseRow[] {
    const columns = "id, task_id, scope, status, conflict_level, created_at, heartbeat_at, expires_at, released_at";
    const sql = taskId ? "select " + columns + " from scope_leases where task_id = ? order by created_at desc" : "select " + columns + " from scope_leases order by created_at desc";
    const rows = taskId ? this.db.prepare(sql).all(taskId) : this.db.prepare(sql).all();
    return rows.map((row) => mapScopeLeaseRow(row as ScopeLeaseDbRow));
  }

  createProjectMemory(input: { projectId: string; taskId?: string | null; kind: ProjectMemoryRow["kind"]; title: string; content: string; confidence?: number; scope?: ProjectMemoryRow["scope"]; sourceType?: ProjectMemoryRow["sourceType"]; sourceId?: string | null; verified?: boolean; sensitivity?: ProjectMemoryRow["sensitivity"] }): ProjectMemoryRow {
    const now = nowIso();
    const memory: ProjectMemoryRow = {
      id: newId("mem"), projectId: input.projectId, taskId: input.taskId ?? null, kind: input.kind, title: input.title, content: input.content,
      confidence: input.confidence ?? 0.8, status: "active", scope: input.scope ?? "project", sourceType: input.sourceType ?? (input.taskId ? "handoff" : "manual"), sourceId: input.sourceId ?? input.taskId ?? null, contentHash: createHash("sha256").update(input.content).digest("hex"), verified: input.verified ?? false, sensitivity: input.sensitivity ?? "normal", createdAt: now, updatedAt: now,
    };
    this.db.prepare("insert into project_memories (id, project_id, task_id, kind, title, content, confidence, status, scope, source_type, source_id, content_hash, verified, sensitivity, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(memory.id, memory.projectId, memory.taskId, memory.kind, memory.title, memory.content, memory.confidence, memory.status, memory.scope, memory.sourceType, memory.sourceId, memory.contentHash, memory.verified ? 1 : 0, memory.sensitivity, memory.createdAt, memory.updatedAt);
    return memory;
  }

  listProjectMemories(projectId: string, limit = 20): ProjectMemoryRow[] {
    return this.db.prepare("select id, project_id, task_id, kind, title, content, confidence, status, scope, source_type, source_id, content_hash, verified, sensitivity, created_at, updated_at from project_memories where project_id = ? and status = 'active' order by updated_at desc limit ?")
      .all(projectId, limit).map((row) => mapProjectMemoryRow(row as ProjectMemoryDbRow));
  }

  searchProjectMemories(query: string, projectId?: string, limit = 20, options: { includeSensitive?: boolean; scopes?: ProjectMemoryRow["scope"][] } = {}): ProjectMemoryRow[] {
    const tokens = query.normalize("NFKC").replace(/["'()*:^{}\[\]<>|~+\-]/g, " ").split(/\s+/).filter((token) => token.length > 1).slice(0, 12);
    if (tokens.length === 0) return projectId ? this.listProjectMemories(projectId, limit) : [];
    const match = tokens.map((token) => `"${token.replace(/"/g, "")}"`).join(" OR ");
    const projectFilter = projectId ? "and pm.project_id = ?" : "";
    const scopes = options.scopes ?? ["project"]; const placeholders = scopes.map(() => "?").join(",");
    const sensitiveFilter = options.includeSensitive ? "" : "and pm.sensitivity = 'normal'";
    const sql = `select pm.id, pm.project_id, pm.task_id, pm.kind, pm.title, pm.content, pm.confidence, pm.status, pm.scope, pm.source_type, pm.source_id, pm.content_hash, pm.verified, pm.sensitivity, pm.created_at, pm.updated_at
      from project_memories_fts f join project_memories pm on pm.id = f.memory_id
      where project_memories_fts match ? and pm.status = 'active' ${projectFilter} and pm.scope in (${placeholders}) ${sensitiveFilter}
      order by (bm25(project_memories_fts, 0, 0, 6, 2) / max(pm.confidence, 0.1)) asc, pm.updated_at desc limit ?`;
    const rows = projectId ? this.db.prepare(sql).all(match, projectId, ...scopes, limit) : this.db.prepare(sql).all(match, ...scopes, limit);
    return rows.map((row) => mapProjectMemoryRow(row as ProjectMemoryDbRow));
  }

  updateProjectMemoryStatus(id: string, status: ProjectMemoryRow["status"]): ProjectMemoryRow | undefined {
    this.db.prepare("update project_memories set status = ?, updated_at = ? where id = ?").run(status, nowIso(), id);
    const row = this.db.prepare("select id, project_id, task_id, kind, title, content, confidence, status, scope, source_type, source_id, content_hash, verified, sensitivity, created_at, updated_at from project_memories where id = ?").get(id);
    return row ? mapProjectMemoryRow(row as ProjectMemoryDbRow) : undefined;
  }

  linkProjectMemories(memoryId: string, relatedMemoryId: string, relation: "supports" | "contradicts" | "supersedes" | "related_to"): void {
    this.db.prepare("insert or ignore into memory_links (memory_id, related_memory_id, relation, created_at) values (?, ?, ?, ?)").run(memoryId, relatedMemoryId, relation, nowIso());
  }

  listProjectMemoryLinks(projectId: string): Array<{ memoryId: string; relatedMemoryId: string; relation: string }> {
    return this.db.prepare("select ml.memory_id as memoryId, ml.related_memory_id as relatedMemoryId, ml.relation from memory_links ml join project_memories pm on pm.id = ml.memory_id where pm.project_id = ?").all(projectId) as Array<{ memoryId: string; relatedMemoryId: string; relation: string }>;
  }

  bindChannelSession(channelId:string,conversationId:string,threadId:string|undefined,sessionId:string):void{this.db.prepare("insert into channel_session_bindings (channel_id,conversation_id,thread_id,session_id,updated_at) values (?,?,?,?,?) on conflict(channel_id,conversation_id,thread_id) do update set session_id=excluded.session_id,updated_at=excluded.updated_at").run(channelId,conversationId,threadId??"",sessionId,nowIso())}
  resolveChannelSession(channelId:string,conversationId:string,threadId?:string):SessionRow|undefined{const row=this.db.prepare("select session_id from channel_session_bindings where channel_id=? and conversation_id=? and thread_id=?").get(channelId,conversationId,threadId??"") as {session_id:string}|undefined;return row?this.listSessions().find(item=>item.id===row.session_id):undefined}

  createContextCheckpoint(sessionId: string, summary: string, sourceMessageCount: number): { id: string; sessionId: string; summary: string; sourceMessageCount: number; contentHash: string; createdAt: string } {
    const row={id:newId("ctx"),sessionId,summary,sourceMessageCount,contentHash:createHash("sha256").update(summary).digest("hex"),createdAt:nowIso()};
    this.db.prepare("insert into context_checkpoints (id,session_id,summary,source_message_count,content_hash,created_at) values (?,?,?,?,?,?)").run(row.id,row.sessionId,row.summary,row.sourceMessageCount,row.contentHash,row.createdAt);return row;
  }
  latestContextCheckpoint(sessionId: string): { id: string; sessionId: string; summary: string; sourceMessageCount: number; contentHash: string; createdAt: string } | undefined {
    const row=this.db.prepare("select id,session_id,summary,source_message_count,content_hash,created_at from context_checkpoints where session_id=? order by created_at desc limit 1").get(sessionId) as any;return row?{id:row.id,sessionId:row.session_id,summary:row.summary,sourceMessageCount:row.source_message_count,contentHash:row.content_hash,createdAt:row.created_at}:undefined;
  }

  listRuns(): RunRow[] {
    return this.db
      .prepare(
        `select id, status, goal, model, endpoint, session_id, created_at, updated_at, completed_at
         from runs
         order by created_at, id`,
      )
      .all()
      .map((row) => mapRunRow(row as RunDbRow));
  }

  updateRunStatus(id: string, status: RunStatus): RunRow {
    return this.db.transaction(() => {
      const previous = this.getRun(id);
      if (!previous) {
        throw new Error(`Run not found: ${id}`);
      }

      const updatedAt = nowIso();
      const completedAt = terminalRunStatuses.has(status) ? updatedAt : null;
      this.db
        .prepare("update runs set status = ?, updated_at = ?, completed_at = ? where id = ?")
        .run(status, updatedAt, completedAt, id);
      const updated = this.getRun(id);
      if (!updated) {
        throw new Error(`Run not found after update: ${id}`);
      }

      this.events.append("run.status_changed", { runId: id, previousStatus: previous.status, status }, id);
      return updated;
    })();
  }

  updateStepStatus(id: string, status: StepStatus): StepRow {
    return this.db.transaction(() => {
      const previous = this.getStep(id);
      if (!previous) {
        throw new Error(`Step not found: ${id}`);
      }

      const timestamp = nowIso();
      const shouldStart = status === "running" || terminalStepStatuses.has(status);
      const startedAt = shouldStart ? previous.startedAt ?? timestamp : previous.startedAt;
      const completedAt = terminalStepStatuses.has(status) ? timestamp : null;
      this.db
        .prepare("update steps set status = ?, started_at = ?, completed_at = ? where id = ?")
        .run(status, startedAt, completedAt, id);
      const updated = this.getStep(id);
      if (!updated) {
        throw new Error(`Step not found after update: ${id}`);
      }

      this.events.append(
        "step.status_changed",
        {
          runId: updated.runId,
          stepId: updated.id,
          previousStatus: previous.status,
          status,
        },
        updated.runId,
      );
      return updated;
    })();
  }

  createStep(input: CreateStepInput): StepRow {
    return this.db.transaction(() => {
      const createdAt = nowIso();
      const nextIndex = this.nextStepIndex(input.runId);
      const step: StepRow = {
        id: newId("step"),
        runId: input.runId,
        index: nextIndex,
        kind: input.kind,
        status: input.status,
        title: input.title,
        createdAt,
        startedAt: input.status === "running" ? createdAt : null,
        completedAt: terminalStepStatuses.has(input.status) ? createdAt : null,
      };

      this.db
        .prepare(
          `insert into steps (id, run_id, "index", kind, status, title, created_at, started_at, completed_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          step.id,
          step.runId,
          step.index,
          step.kind,
          step.status,
          step.title,
          step.createdAt,
          step.startedAt,
          step.completedAt,
        );
      this.events.append(
        "step.created",
        {
          runId: step.runId,
          stepId: step.id,
          index: step.index,
          kind: step.kind,
          status: step.status,
          title: step.title,
        },
        step.runId,
      );
      return step;
    })();
  }

  appendMessage(input: AppendMessageInput): MessageRow {
    return this.db.transaction(() => {
      const metadata = input.metadata ? serializeDurableJsonObject(input.metadata, "message metadata") : null;
      const message: MessageRow = {
        id: newId("msg"),
        runId: input.runId,
        role: input.role,
        content: input.content,
        toolCallId: input.toolCallId ?? null,
        metadata: metadata?.value ?? null,
        createdAt: nowIso(),
      };

      this.db
        .prepare(
          "insert into messages (id, run_id, role, content, tool_call_id, metadata_json, created_at) values (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          message.id,
          message.runId,
          message.role,
          message.content,
          message.toolCallId,
          metadata?.json ?? null,
          message.createdAt,
        );
      this.events.append(
        "message.created",
        { runId: message.runId, messageId: message.id, role: message.role, toolCallId: message.toolCallId },
        message.runId,
      );
      return message;
    })();
  }

  listMessages(runId: string): MessageRow[] {
    return this.db
      .prepare(
        `select id, run_id, role, content, tool_call_id, metadata_json, created_at
         from messages
         where run_id = ?
         order by created_at, id`,
      )
      .all(runId)
      .map((row) => mapMessageRow(row as MessageDbRow));
  }

  writeSnapshot(runId: string, snapshot: unknown): SnapshotRow {
    return this.db.transaction(() => {
      const serializedSnapshot = serializeDurableJson(snapshot, "snapshot");
      const row: SnapshotRow = {
        id: newId("snap"),
        runId,
        snapshot: serializedSnapshot.value,
        createdAt: nowIso(),
      };

      this.db
        .prepare("insert into state_snapshots (id, run_id, snapshot_json, created_at) values (?, ?, ?, ?)")
        .run(row.id, row.runId, serializedSnapshot.json, row.createdAt);
      this.events.append("snapshot.created", { runId: row.runId, snapshotId: row.id }, row.runId);
      return row;
    })();
  }

  latestSnapshot(runId: string): SnapshotRow | undefined {
    const row = this.db
      .prepare(
        `select id, run_id, snapshot_json, created_at
         from state_snapshots
         where run_id = ?
         order by created_at desc, id desc
         limit 1`,
      )
      .get(runId);
    return row ? mapSnapshotRow(row as SnapshotDbRow) : undefined;
  }

  private getStep(id: string): StepRow | undefined {
    const row = this.db
      .prepare(
        `select id, run_id, "index", kind, status, title, created_at, started_at, completed_at
         from steps
         where id = ?`,
      )
      .get(id);
    return row ? mapStepRow(row as StepDbRow) : undefined;
  }

  private nextStepIndex(runId: string): number {
    const row = this.db.prepare('select coalesce(max("index"), -1) + 1 as next_index from steps where run_id = ?').get(
      runId,
    ) as { next_index: number };
    return row.next_index;
  }
}

function mapRunRow(row: RunDbRow): RunRow {
  return {
    id: row.id,
    status: row.status,
    goal: row.goal,
    model: row.model,
    endpoint: row.endpoint,
    sessionId: row.session_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapMessageRow(row: MessageDbRow): MessageRow {
  return {
    id: row.id,
    runId: row.run_id,
    role: row.role,
    content: row.content,
    toolCallId: row.tool_call_id,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as JsonObject) : null,
    createdAt: row.created_at,
  };
}

function mapStepRow(row: StepDbRow): StepRow {
  return {
    id: row.id,
    runId: row.run_id,
    index: row.index,
    kind: row.kind,
    status: row.status,
    title: row.title,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function mapSnapshotRow(row: SnapshotDbRow): SnapshotRow {
  return {
    id: row.id,
    runId: row.run_id,
    snapshot: JSON.parse(row.snapshot_json) as JsonValue,
    createdAt: row.created_at,
  };
}
