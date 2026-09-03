import type { CorvusDatabase } from "./connection.js";
import { INITIAL_SCHEMA_VERSION, initialSchemaSql } from "./schema.js";

interface ColumnInfo {
  name: string;
  notnull: number;
  dflt_value: string | null;
}

function tableExists(db: CorvusDatabase, table: string): boolean {
  return Boolean(
    db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(table),
  );
}

function columnInfo(db: CorvusDatabase, table: string, column: string): ColumnInfo | undefined {
  return db
    .prepare(`pragma table_info(${table})`)
    .all()
    .map((row) => row as ColumnInfo)
    .find((row) => row.name === column);
}

function tableHasColumn(db: CorvusDatabase, table: string, column: string): boolean {
  return Boolean(columnInfo(db, table, column));
}

function ensureCompatibilityColumns(db: CorvusDatabase, createdAt: string): void {
  if (tableExists(db, "schema_migrations") && !tableHasColumn(db, "schema_migrations", "created_at")) {
    db.exec("alter table schema_migrations add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    db.prepare("update schema_migrations set created_at = coalesce(applied_at, ?)").run(createdAt);
  }
  if (tableExists(db, "runs")) {
    if (!tableHasColumn(db, "runs", "created_at")) {
      db.exec("alter table runs add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    }
    if (!tableHasColumn(db, "runs", "updated_at")) {
      db.exec("alter table runs add column updated_at text not null default '1970-01-01T00:00:00.000Z'");
      db.prepare("update runs set updated_at = coalesce(created_at, ?)").run(createdAt);
    }
    if (!tableHasColumn(db, "runs", "session_id")) {
      db.exec("alter table runs add column session_id text references sessions(id) on delete set null");
    }
  }
  if (tableExists(db, "steps") && !tableHasColumn(db, "steps", "created_at")) {
    db.exec("alter table steps add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    db.prepare("update steps set created_at = coalesce(started_at, ?)").run(createdAt);
  }
  if (tableExists(db, "messages") && !tableHasColumn(db, "messages", "metadata_json")) {
    db.exec("alter table messages add column metadata_json text");
  }
  if (tableExists(db, "projects")) {
    if (!tableHasColumn(db, "projects", "config_json")) {
      db.exec("alter table projects add column config_json text");
    }
    if (!tableHasColumn(db, "projects", "last_session_id")) {
      db.exec("alter table projects add column last_session_id text");
    }
    if (!tableHasColumn(db, "projects", "main_agent_id")) {
      db.exec("alter table projects add column main_agent_id text references agents(id) on delete set null");
    }
    if (!tableHasColumn(db, "projects", "created_at")) {
      db.exec("alter table projects add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    }
    if (!tableHasColumn(db, "projects", "updated_at")) {
      db.exec("alter table projects add column updated_at text not null default '1970-01-01T00:00:00.000Z'");
      db.prepare("update projects set updated_at = coalesce(created_at, ?)").run(createdAt);
    }
  }
  if (tableExists(db, "settings")) {
    if (!tableHasColumn(db, "settings", "created_at")) {
      db.exec("alter table settings add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    }
    if (!tableHasColumn(db, "settings", "updated_at")) {
      db.exec("alter table settings add column updated_at text not null default '1970-01-01T00:00:00.000Z'");
      db.prepare("update settings set updated_at = coalesce(created_at, ?)").run(createdAt);
    }
  }
  if (tableExists(db, "agents")) {
    if (!tableHasColumn(db, "agents", "project_id")) {
      db.exec("alter table agents add column project_id text");
    }
    if (!tableHasColumn(db, "agents", "parent_agent_id")) {
      db.exec("alter table agents add column parent_agent_id text references agents(id) on delete set null");
    }
    if (!tableHasColumn(db, "agents", "role_id")) {
      db.exec("alter table agents add column role_id text");
    }
    if (!tableHasColumn(db, "agents", "config_json")) {
      db.exec("alter table agents add column config_json text");
    }
    if (!tableHasColumn(db, "agents", "created_at")) {
      db.exec("alter table agents add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    }
    if (!tableHasColumn(db, "agents", "updated_at")) {
      db.exec("alter table agents add column updated_at text not null default '1970-01-01T00:00:00.000Z'");
      db.prepare("update agents set updated_at = coalesce(created_at, ?)").run(createdAt);
    }
  }
  if (tableExists(db, "sessions")) {
    if (!tableHasColumn(db, "sessions", "project_id")) {
      db.exec("alter table sessions add column project_id text references projects(id) on delete cascade");
    }
    if (!tableHasColumn(db, "sessions", "agent_id")) {
      db.exec("alter table sessions add column agent_id text references agents(id) on delete set null");
    }
    if (!tableHasColumn(db, "sessions", "kind")) {
      db.exec("alter table sessions add column kind text not null default 'project_main'");
    }
    if (!tableHasColumn(db, "sessions", "parent_session_id")) {
      db.exec("alter table sessions add column parent_session_id text references sessions(id) on delete set null");
    }
    if (!tableHasColumn(db, "sessions", "provider_id")) {
      db.exec("alter table sessions add column provider_id text");
    }
    if (!tableHasColumn(db, "sessions", "model")) {
      db.exec("alter table sessions add column model text");
    }
    if (!tableHasColumn(db, "sessions", "context_window_tokens")) {
      db.exec("alter table sessions add column context_window_tokens integer");
    }
    if (!tableHasColumn(db, "sessions", "preview")) {
      db.exec("alter table sessions add column preview text");
    }
    if (!tableHasColumn(db, "sessions", "message_count")) {
      db.exec("alter table sessions add column message_count integer not null default 0");
    }
    if (!tableHasColumn(db, "sessions", "total_tokens")) {
      db.exec("alter table sessions add column total_tokens integer not null default 0");
    }
    if (!tableHasColumn(db, "sessions", "created_at")) {
      db.exec("alter table sessions add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    }
    if (!tableHasColumn(db, "sessions", "last_active_at")) {
      db.exec("alter table sessions add column last_active_at text not null default '1970-01-01T00:00:00.000Z'");
      db.prepare("update sessions set last_active_at = coalesce(created_at, ?)").run(createdAt);
    }
    if (!tableHasColumn(db, "sessions", "archived_at")) {
      db.exec("alter table sessions add column archived_at text");
    }
  }
  if (tableExists(db, "subagent_tasks")) {
    if (!tableHasColumn(db, "subagent_tasks", "model_profile")) {
      db.exec("alter table subagent_tasks add column model_profile text");
    }
    if (!tableHasColumn(db, "subagent_tasks", "agent_scope")) {
      db.exec("alter table subagent_tasks add column agent_scope text not null default 'project'");
    }
    if (!tableHasColumn(db, "subagent_tasks", "project_id")) {
      db.exec("alter table subagent_tasks add column project_id text references projects(id) on delete cascade");
    }
    if (!tableHasColumn(db, "subagent_tasks", "parent_task_id")) {
      db.exec("alter table subagent_tasks add column parent_task_id text references subagent_tasks(id) on delete set null");
    }
  }
  if (tableExists(db, "scope_leases")) {
    if (!tableHasColumn(db, "scope_leases", "conflict_level")) {
      db.exec("alter table scope_leases add column conflict_level text not null default 'none'");
    }
    if (!tableHasColumn(db, "scope_leases", "heartbeat_at")) {
      db.exec("alter table scope_leases add column heartbeat_at text not null default '1970-01-01T00:00:00.000Z'");
    }
    if (!tableHasColumn(db, "scope_leases", "expires_at")) {
      db.exec("alter table scope_leases add column expires_at text not null default '1970-01-01T00:00:00.000Z'");
    }
  }
  if (tableExists(db, "project_memories")) {
    if (!tableHasColumn(db, "project_memories", "scope")) {
      db.exec("alter table project_memories add column scope text not null default 'project'");
    }
    if (!tableHasColumn(db, "project_memories", "source_type")) {
      db.exec("alter table project_memories add column source_type text not null default 'manual'");
    }
    if (!tableHasColumn(db, "project_memories", "source_id")) {
      db.exec("alter table project_memories add column source_id text");
    }
    if (!tableHasColumn(db, "project_memories", "content_hash")) {
      db.exec("alter table project_memories add column content_hash text");
    }
    if (!tableHasColumn(db, "project_memories", "verified")) {
      db.exec("alter table project_memories add column verified integer not null default 0");
    }
    if (!tableHasColumn(db, "project_memories", "sensitivity")) {
      db.exec("alter table project_memories add column sensitivity text not null default 'normal'");
    }
    if (!tableHasColumn(db, "project_memories", "created_at")) {
      db.exec("alter table project_memories add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    }
    if (!tableHasColumn(db, "project_memories", "updated_at")) {
      db.exec("alter table project_memories add column updated_at text not null default '1970-01-01T00:00:00.000Z'");
      db.prepare("update project_memories set updated_at = coalesce(created_at, ?)").run(createdAt);
    }
  }
  if (tableExists(db, "channel_deliveries")) {
    if (!tableHasColumn(db, "channel_deliveries", "created_at")) {
      db.exec("alter table channel_deliveries add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    }
    if (!tableHasColumn(db, "channel_deliveries", "updated_at")) {
      db.exec("alter table channel_deliveries add column updated_at text not null default '1970-01-01T00:00:00.000Z'");
      db.prepare("update channel_deliveries set updated_at = coalesce(created_at, ?)").run(createdAt);
    }
  }
  if (tableExists(db, "channel_session_bindings") && !tableHasColumn(db, "channel_session_bindings", "updated_at")) {
    db.exec("alter table channel_session_bindings add column updated_at text not null default '1970-01-01T00:00:00.000Z'");
  }
  if (tableExists(db, "memory_embeddings") && !tableHasColumn(db, "memory_embeddings", "updated_at")) {
    db.exec("alter table memory_embeddings add column updated_at text not null default '1970-01-01T00:00:00.000Z'");
  }
  if (!tableExists(db, "users")) {
    db.exec(`
      create table if not exists users (
        id text primary key,
        username text unique not null,
        password_hash text not null,
        salt text not null,
        role text not null default 'collaborator',
        allowed_projects_json text not null default '[]',
        created_at text not null,
        updated_at text not null
      );
      create index if not exists idx_users_username on users(username);
    `);
  }
  if (!tableExists(db, "user_tokens")) {
    db.exec(`
      create table if not exists user_tokens (
        token text primary key,
        user_id text not null references users(id) on delete cascade,
        created_at text not null,
        last_used_at text not null
      );
      create index if not exists idx_user_tokens_user on user_tokens(user_id);
    `);
  }
}

function shouldRebuildColumn(db: CorvusDatabase, table: string, column: string): boolean {
  const info = columnInfo(db, table, column);
  return Boolean(info && (info.notnull !== 1 || info.dflt_value !== null));
}

function rebuildSchemaMigrations(db: CorvusDatabase, createdAt: string): void {
  db.prepare("update schema_migrations set created_at = coalesce(created_at, applied_at, ?)").run(createdAt);
  db.exec(`
    create table schema_migrations_rebuild (
      version integer primary key,
      name text not null,
      applied_at text not null,
      created_at text not null
    );

    insert into schema_migrations_rebuild (version, name, applied_at, created_at)
    select version, name, applied_at, created_at from schema_migrations;

    drop table schema_migrations;
    alter table schema_migrations_rebuild rename to schema_migrations;
  `);
}

function rebuildSteps(db: CorvusDatabase, createdAt: string): void {
  db.prepare("update steps set created_at = coalesce(created_at, started_at, ?)").run(createdAt);
  db.exec(`
    create table steps_rebuild (
      id text primary key,
      run_id text not null references runs(id) on delete cascade,
      "index" integer not null,
      kind text not null,
      status text not null,
      title text not null,
      created_at text not null,
      started_at text,
      completed_at text
    );

    insert into steps_rebuild (id, run_id, "index", kind, status, title, created_at, started_at, completed_at)
    select id, run_id, "index", kind, status, title, created_at, started_at, completed_at from steps;

    drop table steps;
    alter table steps_rebuild rename to steps;
  `);
}

function normalizeCompatibilityTables(db: CorvusDatabase, createdAt: string): void {
  // Persistent three-level agent identities.
  if (!tableExists(db, "agents")) { db.exec("create table agents (id text primary key, kind text not null, project_id text, parent_agent_id text references agents(id) on delete set null, role_id text, status text not null, config_json text, created_at text not null, updated_at text not null)"); db.exec("create unique index idx_agents_master on agents(kind) where kind='master'"); db.exec("create unique index idx_agents_project on agents(project_id) where kind='project'"); }
  // Session/project support (schema v3).
  if (!tableExists(db, "projects")) {
    db.exec("create table if not exists projects (id text primary key, name text not null, path text not null, config_json text, last_session_id text, created_at text not null, updated_at text not null)");
    db.exec("create index if not exists idx_projects_updated_at on projects(updated_at desc)");
  }
  if (tableExists(db, "projects") && !tableHasColumn(db, "projects", "main_agent_id")) db.exec("alter table projects add column main_agent_id text references agents(id) on delete set null");
  if (!tableExists(db, "sessions")) {
    db.exec("create table if not exists sessions (id text primary key, project_id text references projects(id) on delete cascade, name text, preview text, message_count integer not null default 0, total_tokens integer not null default 0, created_at text not null, last_active_at text not null)");
    db.exec("create index if not exists idx_sessions_last_active on sessions(last_active_at desc)");
  }
  if (tableExists(db, "sessions") && !tableHasColumn(db, "sessions", "agent_id")) { db.exec("alter table sessions add column agent_id text references agents(id) on delete set null"); db.exec("alter table sessions add column kind text not null default 'project_main'"); db.exec("alter table sessions add column parent_session_id text references sessions(id) on delete set null"); }
  if (tableExists(db, "sessions") && !tableHasColumn(db, "sessions", "project_id")) {
    db.exec("alter table sessions add column project_id text references projects(id) on delete cascade");
    db.exec("alter table sessions add column preview text");
    db.exec("alter table sessions add column message_count integer not null default 0");
    db.exec("alter table sessions add column total_tokens integer not null default 0");
    db.exec("create index if not exists idx_sessions_project_id on sessions(project_id)");
  }
  if (tableExists(db, "sessions") && !tableHasColumn(db, "sessions", "archived_at")) {
    db.exec("alter table sessions add column archived_at text");
    db.exec("create index if not exists idx_sessions_archived_at on sessions(archived_at)");
  }
  if (!tableExists(db, "subagent_tasks")) {
    db.exec("create table if not exists subagent_tasks (id text primary key, parent_run_id text references runs(id) on delete set null, parent_session_id text not null references sessions(id) on delete cascade, child_session_id text not null references sessions(id) on delete cascade, prompt text not null, description text, model_profile text, depth integer not null, status text not null, error text, created_at text not null, completed_at text)");
    db.exec("create index if not exists idx_subagent_tasks_parent_session on subagent_tasks(parent_session_id, created_at desc)");
    db.exec("create index if not exists idx_subagent_tasks_child_session on subagent_tasks(child_session_id)");
  }
  if (tableExists(db, "subagent_tasks") && !tableHasColumn(db, "subagent_tasks", "model_profile")) db.exec("alter table subagent_tasks add column model_profile text");
  if (tableExists(db, "subagent_tasks") && !tableHasColumn(db, "subagent_tasks", "agent_scope")) {
    db.exec("alter table subagent_tasks add column agent_scope text not null default 'project'");
    db.exec("alter table subagent_tasks add column project_id text references projects(id) on delete cascade");
    db.exec("alter table subagent_tasks add column parent_task_id text references subagent_tasks(id) on delete set null");
    db.exec("create index if not exists idx_subagent_tasks_hierarchy on subagent_tasks(project_id, parent_task_id, created_at desc)");
    db.exec("update subagent_tasks set project_id=(select project_id from sessions where sessions.id=subagent_tasks.child_session_id), agent_scope=case when (select project_id from sessions where sessions.id=subagent_tasks.child_session_id) is null then 'global' else 'project' end");
  }
  if (!tableExists(db, "scope_leases")) {
    db.exec("create table if not exists scope_leases (id text primary key, task_id text not null references subagent_tasks(id) on delete cascade, scope text not null, status text not null, created_at text not null, released_at text)");
    db.exec("create index if not exists idx_scope_leases_scope_status on scope_leases(scope, status)");
    db.exec("create index if not exists idx_scope_leases_task on scope_leases(task_id)");
    db.exec("create unique index if not exists idx_scope_leases_active_scope on scope_leases(scope) where status = 'active'");
  }
  if (tableExists(db, "scope_leases") && !tableHasColumn(db, "scope_leases", "heartbeat_at")) {
    db.exec("alter table scope_leases add column conflict_level text not null default 'none'");
    db.exec("alter table scope_leases add column heartbeat_at text not null default '1970-01-01T00:00:00.000Z'");
    db.exec("alter table scope_leases add column expires_at text not null default '1970-01-01T00:00:00.000Z'");
  }
  if (!tableExists(db, "project_memories")) {
    db.exec("create table if not exists project_memories (id text primary key, project_id text not null references projects(id) on delete cascade, task_id text references subagent_tasks(id) on delete set null, kind text not null, title text not null, content text not null, confidence real not null, status text not null, created_at text not null, updated_at text not null)");
    db.exec("create index if not exists idx_project_memories_project_status on project_memories(project_id, status, updated_at desc)");
  }
  if (tableExists(db, "project_memories") && !tableHasColumn(db, "project_memories", "scope")) {
    db.exec("alter table project_memories add column scope text not null default 'project'");
    db.exec("alter table project_memories add column source_type text not null default 'manual'");
    db.exec("alter table project_memories add column source_id text");
    db.exec("alter table project_memories add column content_hash text");
    db.exec("alter table project_memories add column verified integer not null default 0");
    db.exec("alter table project_memories add column sensitivity text not null default 'normal'");
  }
  if (!tableExists(db, "project_memories_fts")) {
    db.exec("create virtual table project_memories_fts using fts5(memory_id unindexed, project_id unindexed, title, content, tokenize='unicode61')");
    db.exec("insert into project_memories_fts(memory_id, project_id, title, content) select id, project_id, title, content from project_memories");
  }
  db.exec("create trigger if not exists project_memories_fts_insert after insert on project_memories begin insert into project_memories_fts(memory_id, project_id, title, content) values (new.id, new.project_id, new.title, new.content); end");
  db.exec("create trigger if not exists project_memories_fts_delete after delete on project_memories begin delete from project_memories_fts where memory_id = old.id; end");
  db.exec("create trigger if not exists project_memories_fts_update after update of title, content, project_id on project_memories begin delete from project_memories_fts where memory_id = old.id; insert into project_memories_fts(memory_id, project_id, title, content) values (new.id, new.project_id, new.title, new.content); end");
  if (!tableExists(db, "memory_links")) {
    db.exec("create table if not exists memory_links (memory_id text not null references project_memories(id) on delete cascade, related_memory_id text not null references project_memories(id) on delete cascade, relation text not null, created_at text not null, primary key (memory_id, related_memory_id, relation))");
    db.exec("create index if not exists idx_memory_links_memory on memory_links(memory_id)");
  }
  if (!tableExists(db, "memory_embeddings")) { db.exec("create table memory_embeddings (memory_id text primary key references project_memories(id) on delete cascade, provider text not null, dimensions integer not null, vector_json text not null, updated_at text not null)"); }
  if (!tableExists(db, "channel_deliveries")) {
    db.exec("create table if not exists channel_deliveries (id text primary key, channel_id text not null, payload_json text not null, status text not null, attempts integer not null, last_error text, created_at text not null, updated_at text not null)");
    db.exec("create index if not exists idx_channel_deliveries_status on channel_deliveries(status, updated_at)");
  }
  if (!tableExists(db, "channel_inbound_messages")) { db.exec("create table channel_inbound_messages (channel_id text not null, message_id text not null, user_id text not null, conversation_id text not null, thread_id text, received_at text not null, primary key (channel_id, message_id))"); db.exec("create index idx_channel_inbound_conversation on channel_inbound_messages(channel_id, conversation_id, received_at desc)"); }
  if (!tableExists(db, "channel_session_bindings")) { db.exec("create table channel_session_bindings (channel_id text not null, conversation_id text not null, thread_id text not null default '', session_id text not null references sessions(id) on delete cascade, updated_at text not null, primary key(channel_id,conversation_id,thread_id))"); }
  if (tableExists(db, "automation_runs") && !tableHasColumn(db, "automation_runs", "attempt")) { db.exec("alter table automation_runs add column attempt integer not null default 1"); db.exec("alter table automation_runs add column claim_token text"); db.exec("alter table automation_runs add column lease_expires_at text"); }
  if (!tableExists(db, "automation_runs")) {
    db.exec("create table automation_runs (id text primary key, automation_id text not null, status text not null, started_at text not null, completed_at text, error text, attempt integer not null default 1, claim_token text, lease_expires_at text)");
    db.exec("create index idx_automation_runs_job_started on automation_runs(automation_id, started_at desc)");
  }
  if (!tableExists(db, "context_checkpoints")) { db.exec("create table context_checkpoints (id text primary key, session_id text not null references sessions(id) on delete cascade, summary text not null, source_message_count integer not null, content_hash text not null, created_at text not null)"); db.exec("create index idx_context_checkpoints_session_created on context_checkpoints(session_id, created_at desc)"); }
  if (tableExists(db, "events") && !tableHasColumn(db, "events", "event_hash")) { db.exec("alter table events add column previous_hash text"); db.exec("alter table events add column event_hash text"); }
  if (tableExists(db, "runs") && !tableHasColumn(db, "runs", "session_id")) {
    db.exec("alter table runs add column session_id text references sessions(id) on delete set null");
    db.exec("create index if not exists idx_runs_session_id on runs(session_id)");
  }
  if (tableExists(db, "schema_migrations") && shouldRebuildColumn(db, "schema_migrations", "created_at")) {
    rebuildSchemaMigrations(db, createdAt);
  }
  if (tableExists(db, "steps") && shouldRebuildColumn(db, "steps", "created_at")) {
    rebuildSteps(db, createdAt);
  }
}

function foreignKeyCheck(db: CorvusDatabase): Array<{ table: string; rowid: number; parent: string; fkid: number }> {
  return db.prepare("pragma foreign_key_check").all() as Array<{
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
  }>;
}

export function ensureDatabase(db: CorvusDatabase): void {
  const apply = db.transaction(() => {
    const createdAt = new Date().toISOString();
    ensureCompatibilityColumns(db, createdAt);
    normalizeCompatibilityTables(db, createdAt);
    db.exec(initialSchemaSql);
    ensureCompatibilityColumns(db, createdAt);
    normalizeCompatibilityTables(db, createdAt);
    const existing = db
      .prepare("select version from schema_migrations where version = ?")
      .get(INITIAL_SCHEMA_VERSION);
    if (!existing) {
      db.prepare("insert into schema_migrations (version, name, applied_at, created_at) values (?, ?, ?, ?)")
        .run(INITIAL_SCHEMA_VERSION, "initial durable harness schema", createdAt, createdAt);
    }
    const violations = foreignKeyCheck(db);
    if (violations.length > 0) {
      throw new Error(`Database migration left foreign key violations: ${JSON.stringify(violations)}`);
    }
  });
  db.pragma("foreign_keys = OFF");
  try {
    apply();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
