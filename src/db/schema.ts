export const INITIAL_SCHEMA_VERSION = 1;

export const initialSchemaSql = `
create table if not exists schema_migrations (
  version integer primary key,
  name text not null,
  applied_at text not null
);

create table if not exists runs (
  id text primary key,
  status text not null,
  goal text not null,
  model text not null,
  endpoint text not null,
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
  started_at text,
  completed_at text
);

create table if not exists messages (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  role text not null,
  content text,
  tool_call_id text,
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
  created_at text not null
);

create table if not exists state_snapshots (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  snapshot_json text not null,
  created_at text not null
);

create index if not exists idx_runs_status_created_at on runs(status, created_at);
create index if not exists idx_steps_run_id on steps(run_id);
create index if not exists idx_messages_run_id on messages(run_id);
create index if not exists idx_tool_calls_run_id_status on tool_calls(run_id, status);
create index if not exists idx_tool_calls_run_id_status_created_at on tool_calls(run_id, status, created_at);
create index if not exists idx_approvals_status on approvals(status);
create index if not exists idx_approvals_run_id_status_created_at on approvals(run_id, status, created_at);
create index if not exists idx_evidence_run_id on evidence(run_id);
create index if not exists idx_evidence_run_id_created_at on evidence(run_id, created_at);
create index if not exists idx_events_run_id_created_at on events(run_id, created_at);
create index if not exists idx_settings_updated_at on settings(updated_at);
`;
