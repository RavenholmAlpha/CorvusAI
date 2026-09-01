export const INITIAL_SCHEMA_VERSION = 10;

export const initialSchemaSql = `
create table if not exists schema_migrations (
  version integer primary key,
  name text not null,
  applied_at text not null,
  created_at text not null
);

create table if not exists agents (
  id text primary key, kind text not null, project_id text, parent_agent_id text references agents(id) on delete set null, role_id text, status text not null, config_json text, created_at text not null, updated_at text not null
);
create unique index if not exists idx_agents_master on agents(kind) where kind='master';
create unique index if not exists idx_agents_project on agents(project_id) where kind='project';

create table if not exists projects (
  id text primary key,
  name text not null,
  path text not null,
  config_json text,
  last_session_id text,
  main_agent_id text references agents(id) on delete set null,
  created_at text not null,
  updated_at text not null
);

create table if not exists sessions (
  id text primary key,
  project_id text references projects(id) on delete cascade,
  agent_id text references agents(id) on delete set null,
  kind text not null default 'project_main',
  parent_session_id text references sessions(id) on delete set null,
  provider_id text,
  model text,
  context_window_tokens integer,
  name text,
  preview text,
  message_count integer not null default 0,
  total_tokens integer not null default 0,
  created_at text not null,
  last_active_at text not null
);

create table if not exists subagent_tasks (
  id text primary key,
  parent_run_id text references runs(id) on delete set null,
  parent_session_id text not null references sessions(id) on delete cascade,
  child_session_id text not null references sessions(id) on delete cascade,
  prompt text not null,
  description text,
  model_profile text,
  agent_scope text not null default 'project',
  project_id text references projects(id) on delete cascade,
  parent_task_id text references subagent_tasks(id) on delete set null,
  depth integer not null,
  status text not null,
  error text,
  created_at text not null,
  completed_at text
);
create index if not exists idx_subagent_tasks_parent_session on subagent_tasks(parent_session_id, created_at desc);
create index if not exists idx_subagent_tasks_child_session on subagent_tasks(child_session_id);
create index if not exists idx_subagent_tasks_hierarchy on subagent_tasks(project_id, parent_task_id, created_at desc);

create table if not exists scope_leases (
  id text primary key,
  task_id text not null references subagent_tasks(id) on delete cascade,
  scope text not null,
  status text not null,
  conflict_level text not null default 'none',
  created_at text not null,
  heartbeat_at text not null,
  expires_at text not null,
  released_at text
);
create index if not exists idx_scope_leases_scope_status on scope_leases(scope, status);
create index if not exists idx_scope_leases_task on scope_leases(task_id);
create unique index if not exists idx_scope_leases_active_scope on scope_leases(scope) where status = 'active';

create table if not exists project_memories (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  task_id text references subagent_tasks(id) on delete set null,
  kind text not null,
  title text not null,
  content text not null,
  confidence real not null,
  status text not null,
  scope text not null default 'project',
  source_type text not null default 'manual',
  source_id text,
  content_hash text,
  verified integer not null default 0,
  sensitivity text not null default 'normal',
  created_at text not null,
  updated_at text not null
);
create index if not exists idx_project_memories_project_status on project_memories(project_id, status, updated_at desc);
create virtual table if not exists project_memories_fts using fts5(memory_id unindexed, project_id unindexed, title, content, tokenize='unicode61');
create trigger if not exists project_memories_fts_insert after insert on project_memories begin
  insert into project_memories_fts(memory_id, project_id, title, content) values (new.id, new.project_id, new.title, new.content);
end;
create trigger if not exists project_memories_fts_delete after delete on project_memories begin
  delete from project_memories_fts where memory_id = old.id;
end;
create trigger if not exists project_memories_fts_update after update of title, content, project_id on project_memories begin
  delete from project_memories_fts where memory_id = old.id;
  insert into project_memories_fts(memory_id, project_id, title, content) values (new.id, new.project_id, new.title, new.content);
end;

create table if not exists memory_links (
  memory_id text not null references project_memories(id) on delete cascade,
  related_memory_id text not null references project_memories(id) on delete cascade,
  relation text not null,
  created_at text not null,
  primary key (memory_id, related_memory_id, relation)
);
create index if not exists idx_memory_links_memory on memory_links(memory_id);
create table if not exists memory_embeddings (memory_id text primary key references project_memories(id) on delete cascade, provider text not null, dimensions integer not null, vector_json text not null, updated_at text not null);

create table if not exists channel_deliveries (
  id text primary key,
  channel_id text not null,
  payload_json text not null,
  status text not null,
  attempts integer not null,
  last_error text,
  created_at text not null,
  updated_at text not null
);
create index if not exists idx_channel_deliveries_status on channel_deliveries(status, updated_at);
create table if not exists channel_inbound_messages (
  channel_id text not null, message_id text not null, user_id text not null, conversation_id text not null, thread_id text, received_at text not null,
  primary key (channel_id, message_id)
);
create index if not exists idx_channel_inbound_conversation on channel_inbound_messages(channel_id, conversation_id, received_at desc);
create table if not exists channel_session_bindings (channel_id text not null, conversation_id text not null, thread_id text not null default '', session_id text not null references sessions(id) on delete cascade, updated_at text not null, primary key(channel_id,conversation_id,thread_id));

create table if not exists automation_runs (
  id text primary key,
  automation_id text not null,
  status text not null,
  started_at text not null,
  completed_at text,
  error text,
  attempt integer not null default 1,
  claim_token text,
  lease_expires_at text
);
create index if not exists idx_automation_runs_job_started on automation_runs(automation_id, started_at desc);

create table if not exists runs (
  id text primary key,
  status text not null,
  goal text not null,
  model text not null,
  endpoint text not null,
  session_id text references sessions(id) on delete set null,
  created_at text not null,
  updated_at text not null,
  completed_at text
);

create table if not exists steps (
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

create table if not exists messages (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  role text not null,
  content text,
  tool_call_id text,
  metadata_json text,
  created_at text not null
);

create table if not exists tool_calls (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  step_id text references steps(id) on delete set null,
  tool_name text not null,
  capability text not null,
  status text not null,
  arguments_json text not null,
  result_json text,
  error text,
  timeout_ms integer not null,
  created_at text not null,
  started_at text,
  completed_at text
);

create table if not exists approvals (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  tool_call_id text not null references tool_calls(id) on delete cascade,
  status text not null,
  decision_scope text not null,
  created_at text not null,
  decided_at text
);

create table if not exists evidence (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  title text not null,
  summary text not null,
  content text not null,
  created_at text not null
);

create table if not exists settings (
  key text primary key,
  value_json text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists events (
  id text primary key,
  run_id text,
  type text not null,
  payload_json text not null,
  created_at text not null,
  previous_hash text,
  event_hash text
);

create table if not exists state_snapshots (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  snapshot_json text not null,
  created_at text not null
);

create index if not exists idx_runs_status_created_at on runs(status, created_at);
create index if not exists idx_runs_session_id on runs(session_id);
create index if not exists idx_sessions_last_active on sessions(last_active_at desc);
create index if not exists idx_sessions_project_id on sessions(project_id);
create index if not exists idx_projects_updated_at on projects(updated_at desc);
create index if not exists idx_steps_run_id on steps(run_id);
create index if not exists idx_steps_run_id_status_created_at on steps(run_id, status, created_at);
create index if not exists idx_messages_run_id on messages(run_id);
create index if not exists idx_messages_run_id_created_at on messages(run_id, created_at);
create index if not exists idx_tool_calls_run_id_status on tool_calls(run_id, status);
create index if not exists idx_tool_calls_run_id_status_created_at on tool_calls(run_id, status, created_at);
create index if not exists idx_approvals_status on approvals(status);
create index if not exists idx_approvals_run_id_status_created_at on approvals(run_id, status, created_at);
create index if not exists idx_evidence_run_id on evidence(run_id);
create index if not exists idx_evidence_run_id_created_at on evidence(run_id, created_at);
create index if not exists idx_events_run_id_created_at on events(run_id, created_at);
create index if not exists idx_settings_updated_at on settings(updated_at);
create index if not exists idx_state_snapshots_run_id_created_at on state_snapshots(run_id, created_at);
create table if not exists context_checkpoints (id text primary key, session_id text not null references sessions(id) on delete cascade, summary text not null, source_message_count integer not null, content_hash text not null, created_at text not null);
create index if not exists idx_context_checkpoints_session_created on context_checkpoints(session_id, created_at desc);
`;
