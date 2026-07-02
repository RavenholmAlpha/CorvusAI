# Durable Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SQLite-backed durable Corvus harness with persistent runs, events, snapshots, tool calls, approvals, evidence, a standardized tool protocol, an asynchronous queue, recovery behavior, and line-mode inspection commands.

**Architecture:** Add a durable harness layer beneath `CorvusAgent`: SQLite stores run state, append-only events, evidence, approvals, and snapshots; `HarnessRunner` coordinates model turns and `ToolQueue`; existing line-mode commands remain compatible. Implement incrementally so each task leaves the app buildable and tested.

**Tech Stack:** Node.js, TypeScript, Vitest, `better-sqlite3`, `ajv`, OpenAI Chat Completions compatible messages, existing Corvus TUI and tool registry.

---

## File Structure

- `package.json`
  - Add `better-sqlite3`, `ajv`, and `@types/better-sqlite3`.
- `src/db/schema.ts`
  - SQL schema constants and migration ids.
- `src/db/connection.ts`
  - Open and configure SQLite database connections.
- `src/db/migrations.ts`
  - Idempotent migration runner.
- `src/harness/types.ts`
  - Durable harness ids, statuses, row shapes, event types, evidence types, and snapshots.
- `src/harness/run-store.ts`
  - `RunStore` for runs, steps, messages, and snapshots.
- `src/harness/event-log.ts`
  - Append-only audit events.
- `src/harness/evidence-store.ts`
  - Evidence creation and lookup.
- `src/tools/protocol.ts`
  - Tool manifest, handler context, normalized result, and manifest-to-OpenAI conversion.
- `src/tools/validation.ts`
  - JSON Schema argument validation and output serialization helpers.
- `src/tools/builtin.ts`
  - Built-in tools converted to manifests.
- `src/tools/index.ts`
  - Re-export protocol and keep compatibility with existing imports.
- `src/harness/approval-service.ts`
  - Durable approval records and policy updates.
- `src/harness/tool-queue.ts`
  - Async durable queue, permission gate, timeout/output policy, recovery.
- `src/harness/runner.ts`
  - Agent run orchestration over model calls, queue results, approvals, evidence, and snapshots.
- `src/agent.ts`
  - Delegate to `HarnessRunner` when supplied; keep current in-memory path for tests that do not opt in.
- `src/commands.ts`
  - Add `/runs`, `/run`, `/resume`, `/cancel`, `/approvals`, `/approve`, `/deny`, `/evidence`.
- `src/cli.ts`
  - Initialize database, stores, queue, runner, and recovery on startup.
- `tests/db.test.ts`
  - Migration and schema tests.
- `tests/harness-store.test.ts`
  - Store and event tests.
- `tests/tool-protocol.test.ts`
  - Manifest, validation, result normalization tests.
- `tests/tool-queue.test.ts`
  - Queue state, approval, timeout, recovery tests.
- `tests/harness-runner.test.ts`
  - Durable agent loop tests.
- `tests/harness-commands.test.ts`
  - Line-mode durable harness command tests.

---

### Task 1: SQLite Connection and Migrations

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/db/schema.ts`
- Create: `src/db/connection.ts`
- Create: `src/db/migrations.ts`
- Test: `tests/db.test.ts`

- [ ] **Step 1: Add dependencies**

Run:

```powershell
npm install better-sqlite3 ajv
npm install -D @types/better-sqlite3
```

Expected: `package.json` and `package-lock.json` update, no npm audit vulnerabilities that block install.

- [ ] **Step 2: Write the failing migration test**

Create `tests/db.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("database migrations", () => {
  it("creates the durable harness schema idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-db-"));
    roots.push(root);
    const dbPath = join(root, "corvus.db");
    const db = openCorvusDatabase(dbPath);

    ensureDatabase(db);
    ensureDatabase(db);

    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "approvals",
        "events",
        "evidence",
        "messages",
        "runs",
        "schema_migrations",
        "state_snapshots",
        "steps",
        "tool_calls",
      ]),
    );
    expect(db.prepare("select count(*) as count from schema_migrations").get()).toEqual({ count: 1 });

    db.close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/db.test.ts
```

Expected: FAIL because `../src/db/connection.js` or `../src/db/migrations.js` does not exist.

- [ ] **Step 4: Implement database connection and schema**

Create `src/db/schema.ts`:

```ts
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

create index if not exists idx_steps_run_id on steps(run_id);
create index if not exists idx_messages_run_id on messages(run_id);
create index if not exists idx_tool_calls_run_id_status on tool_calls(run_id, status);
create index if not exists idx_approvals_status on approvals(status);
create index if not exists idx_evidence_run_id on evidence(run_id);
create index if not exists idx_events_run_id_created_at on events(run_id, created_at);
`;
```

Create `src/db/connection.ts`:

```ts
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type CorvusDatabase = Database.Database;

export function defaultDatabasePath(cwd = process.cwd()): string {
  return resolve(cwd, ".corvus", "corvus.db");
}

export function openCorvusDatabase(path = defaultDatabasePath()): CorvusDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
```

Create `src/db/migrations.ts`:

```ts
import type { CorvusDatabase } from "./connection.js";
import { INITIAL_SCHEMA_VERSION, initialSchemaSql } from "./schema.js";

export function ensureDatabase(db: CorvusDatabase): void {
  const apply = db.transaction(() => {
    db.exec(initialSchemaSql);
    const existing = db
      .prepare("select version from schema_migrations where version = ?")
      .get(INITIAL_SCHEMA_VERSION);
    if (!existing) {
      db.prepare("insert into schema_migrations (version, name, applied_at) values (?, ?, ?)")
        .run(INITIAL_SCHEMA_VERSION, "initial durable harness schema", new Date().toISOString());
    }
  });
  apply();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
npx vitest run tests/db.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json src/db tests/db.test.ts
git commit -m "feat: add durable harness database schema"
```

---

### Task 2: RunStore, EventLog, and EvidenceStore

**Files:**
- Create: `src/harness/types.ts`
- Create: `src/harness/event-log.ts`
- Create: `src/harness/run-store.ts`
- Create: `src/harness/evidence-store.ts`
- Modify: `src/index.ts`
- Test: `tests/harness-store.test.ts`

- [ ] **Step 1: Write the failing store tests**

Create `tests/harness-store.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { RunStore } from "../src/harness/run-store.js";

const roots: string[] = [];

function createStores() {
  const root = join(tmpdir(), `corvus-store-${Date.now()}-${Math.random()}`);
  roots.push(root);
  const db = openCorvusDatabase(join(root, "corvus.db"));
  ensureDatabase(db);
  const events = new EventLog(db);
  const runs = new RunStore(db, events);
  const evidence = new EvidenceStore(db, events);
  return { db, events, runs, evidence };
}

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("durable harness stores", () => {
  it("creates runs, messages, steps, events, evidence, and snapshots", () => {
    const { db, runs, evidence, events } = createStores();

    const run = runs.createRun({ goal: "test goal", model: "test-model", endpoint: "https://example.test/v1" });
    const step = runs.createStep({ runId: run.id, kind: "model", status: "running", title: "Model turn" });
    const message = runs.appendMessage({ runId: run.id, role: "user", content: "hello" });
    const evidenceItem = evidence.createEvidence({
      runId: run.id,
      sourceType: "system",
      sourceId: step.id,
      title: "System note",
      summary: "Created during test",
      content: "full content",
    });
    runs.writeSnapshot(run.id, { mode: "test", stepId: step.id });
    runs.updateRunStatus(run.id, "succeeded");

    expect(runs.getRun(run.id)?.status).toBe("succeeded");
    expect(runs.listMessages(run.id)).toEqual([expect.objectContaining({ id: message.id, role: "user" })]);
    expect(evidence.getEvidence(evidenceItem.id)?.summary).toBe("Created during test");
    expect(runs.latestSnapshot(run.id)?.snapshot).toEqual({ mode: "test", stepId: step.id });
    expect(events.listEvents(run.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["run.created", "message.created", "evidence.created", "snapshot.created"]),
    );

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/harness-store.test.ts
```

Expected: FAIL because harness store modules do not exist.

- [ ] **Step 3: Implement harness types**

Create `src/harness/types.ts`:

```ts
import type { ChatRole } from "../types.js";

export type RunStatus = "created" | "running" | "waiting_for_approval" | "succeeded" | "failed" | "canceled" | "interrupted";
export type StepKind = "model" | "tool" | "approval" | "review" | "system";
export type StepStatus = "created" | "running" | "succeeded" | "failed" | "canceled" | "interrupted";
export type EvidenceSourceType = "tool_result" | "tool_error" | "permission_denial" | "model_error" | "system";

export interface RunRow {
  id: string;
  status: RunStatus;
  goal: string;
  model: string;
  endpoint: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface StepRow {
  id: string;
  runId: string;
  index: number;
  kind: StepKind;
  status: StepStatus;
  title: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MessageRow {
  id: string;
  runId: string;
  role: ChatRole;
  content: string | null;
  toolCallId: string | null;
  createdAt: string;
}

export interface EvidenceRow {
  id: string;
  runId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  title: string;
  summary: string;
  content: string;
  createdAt: string;
}

export interface EventRow {
  id: string;
  runId: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SnapshotRow {
  id: string;
  runId: string;
  snapshot: unknown;
  createdAt: string;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 4: Implement EventLog**

Create `src/harness/event-log.ts`:

```ts
import type { CorvusDatabase } from "../db/connection.js";
import { newId, nowIso, type EventRow } from "./types.js";

export class EventLog {
  constructor(private readonly db: CorvusDatabase) {}

  append(type: string, payload: Record<string, unknown>, runId: string | null = null): EventRow {
    const row: EventRow = { id: newId("evt"), runId, type, payload, createdAt: nowIso() };
    this.db
      .prepare("insert into events (id, run_id, type, payload_json, created_at) values (?, ?, ?, ?, ?)")
      .run(row.id, row.runId, row.type, JSON.stringify(row.payload), row.createdAt);
    return row;
  }

  listEvents(runId: string): EventRow[] {
    return this.db
      .prepare("select id, run_id, type, payload_json, created_at from events where run_id = ? order by created_at, id")
      .all(runId)
      .map((row) => ({
        id: (row as { id: string }).id,
        runId: (row as { run_id: string | null }).run_id,
        type: (row as { type: string }).type,
        payload: JSON.parse((row as { payload_json: string }).payload_json) as Record<string, unknown>,
        createdAt: (row as { created_at: string }).created_at,
      }));
  }
}
```

- [ ] **Step 5: Implement RunStore**

Create `src/harness/run-store.ts` with methods used in the test: `createRun`, `getRun`, `updateRunStatus`, `createStep`, `appendMessage`, `listMessages`, `writeSnapshot`, and `latestSnapshot`. Use `EventLog.append()` for `run.created`, `run.status_changed`, `step.created`, `message.created`, and `snapshot.created`.

The row mapping must convert snake_case database columns to camelCase TypeScript rows exactly as defined in `src/harness/types.ts`.

- [ ] **Step 6: Implement EvidenceStore**

Create `src/harness/evidence-store.ts` with `createEvidence(id generated with prefix "ev")` and `getEvidence(id)`. Write `evidence.created` events.

- [ ] **Step 7: Export harness stores**

Modify `src/index.ts`:

```ts
export * from "./harness/types.js";
export * from "./harness/event-log.js";
export * from "./harness/run-store.js";
export * from "./harness/evidence-store.js";
```

- [ ] **Step 8: Run test to verify it passes**

Run:

```powershell
npx vitest run tests/harness-store.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run full verification**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 10: Commit**

```powershell
git add src/harness src/index.ts tests/harness-store.test.ts
git commit -m "feat: add durable harness stores"
```

---

### Task 3: Tool Protocol and Built-In Tool Manifests

**Files:**
- Create: `src/tools/protocol.ts`
- Create: `src/tools/validation.ts`
- Create: `src/tools/builtin.ts`
- Modify: `src/tools/index.ts`
- Test: `tests/tool-protocol.test.ts`

- [ ] **Step 1: Write failing tool protocol tests**

Create `tests/tool-protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createBuiltInToolManifests } from "../src/tools/builtin.js";
import { normalizeToolResult, validateToolInput } from "../src/tools/validation.js";

describe("tool protocol", () => {
  it("converts built-in manifests to OpenAI-compatible tool schemas", () => {
    const tools = createBuiltInToolManifests();
    const readFile = tools.find((tool) => tool.name === "read_file");

    expect(readFile).toMatchObject({
      namespace: "filesystem",
      version: "1.0.0",
      capability: "filesystem.read",
      risk: "low",
      timeoutMs: expect.any(Number),
      outputLimitBytes: expect.any(Number),
      evidencePolicy: "summary",
    });
    expect(readFile?.toOpenAITool()).toMatchObject({
      type: "function",
      function: { name: "read_file", parameters: { type: "object" } },
    });
  });

  it("validates tool input before execution", () => {
    const readFile = createBuiltInToolManifests().find((tool) => tool.name === "read_file");
    expect(readFile).toBeDefined();

    expect(() => validateToolInput(readFile!, {})).toThrow("Invalid arguments");
    expect(validateToolInput(readFile!, { path: "package.json" })).toEqual({ path: "package.json" });
  });

  it("normalizes serializable tool outputs and rejects functions", () => {
    expect(normalizeToolResult({ ok: true, output: { value: 1 } })).toEqual({ ok: true, output: { value: 1 } });
    expect(normalizeToolResult({ ok: false, error: "bad" })).toEqual({ ok: false, error: "bad" });
    expect(() => normalizeToolResult({ ok: true, output: { bad: () => undefined } })).toThrow("not JSON serializable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/tool-protocol.test.ts
```

Expected: FAIL because `src/tools/builtin.js` and `src/tools/validation.js` do not exist.

- [ ] **Step 3: Implement tool protocol**

Create `src/tools/protocol.ts` with:

```ts
import type { JsonObject, JsonSchema, OpenAIToolSchema } from "../types.js";

export type ToolRisk = "low" | "medium" | "high";
export type EvidencePolicy = "none" | "summary" | "full" | "full_if_error";

export interface ToolConcurrency {
  perTool: number;
  perRun: number;
  global: number;
}

export interface ToolExecutionContext {
  runId: string;
  toolCallId: string;
  signal: AbortSignal;
  cwd: string;
  timeoutMs: number;
  outputLimitBytes: number;
}

export type ToolRunResult =
  | { ok: true; output: unknown; summary?: string; metadata?: Record<string, unknown> }
  | { ok: false; error: string; code?: string; metadata?: Record<string, unknown> };

export interface ToolManifest<TInput extends JsonObject = JsonObject> {
  name: string;
  namespace: string;
  version: string;
  description: string;
  capability: string;
  risk: ToolRisk;
  parameters: JsonSchema;
  timeoutMs: number;
  outputLimitBytes: number;
  concurrency: ToolConcurrency;
  evidencePolicy: EvidencePolicy;
  resources: string[];
  execute: (input: TInput, context: ToolExecutionContext) => Promise<ToolRunResult> | ToolRunResult;
  toOpenAITool: () => OpenAIToolSchema;
}

export function createToolManifest<TInput extends JsonObject>(
  definition: Omit<ToolManifest<TInput>, "toOpenAITool">,
): ToolManifest<TInput> {
  return {
    ...definition,
    toOpenAITool: () => ({
      type: "function",
      function: {
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
      },
    }),
  };
}
```

- [ ] **Step 4: Implement validation**

Create `src/tools/validation.ts` using Ajv. `validateToolInput(manifest, input)` throws `Invalid arguments for <tool>: <ajv errors>` on failure and returns the input object on success. `normalizeToolResult(result)` must JSON stringify and parse the result to prove serializability; throw if serialization fails or drops unsupported values such as functions.

- [ ] **Step 5: Implement built-in manifests**

Create `src/tools/builtin.ts` by moving built-in tool definitions from `src/tools/index.ts` into manifests. Keep names unchanged: `read_file`, `write_file`, `list_dir`, `shell`, `web_fetch`, `now`. Use these defaults:

- `read_file`: namespace `filesystem`, risk `low`, capability `filesystem.read`, timeout `10000`, output limit `12000`, evidence `summary`.
- `write_file`: namespace `filesystem`, risk `medium`, capability `filesystem.write`, timeout `10000`, output limit `4000`, evidence `summary`.
- `list_dir`: namespace `filesystem`, risk `low`, capability `filesystem.read`, timeout `10000`, output limit `12000`, evidence `summary`.
- `shell`: namespace `shell`, risk `high`, capability `process`, timeout `30000`, output limit `20000`, evidence `full_if_error`.
- `web_fetch`: namespace `web`, risk `medium`, capability `network`, timeout `30000`, output limit `20000`, evidence `summary`.
- `now`: namespace `local`, risk `low`, capability `local`, timeout `1000`, output limit `1000`, evidence `none`.

- [ ] **Step 6: Keep old imports compatible**

Modify `src/tools/index.ts` so existing tests importing `createBuiltInTools` still work. Export:

```ts
export { createBuiltInToolManifests } from "./builtin.js";
export * from "./protocol.js";
export * from "./validation.js";
```

Then make `createBuiltInTools()` return `createBuiltInToolManifests()` and update `ToolRegistry` to accept `ToolManifest`.

- [ ] **Step 7: Run tests**

Run:

```powershell
npx vitest run tests/tool-protocol.test.ts tests/tools.test.ts
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add src/tools tests/tool-protocol.test.ts
git commit -m "feat: add tool runtime protocol"
```

---

### Task 4: ApprovalService and ToolQueue

**Files:**
- Create: `src/harness/approval-service.ts`
- Create: `src/harness/tool-queue.ts`
- Modify: `src/harness/types.ts`
- Test: `tests/tool-queue.test.ts`

- [ ] **Step 1: Write failing queue tests**

Create `tests/tool-queue.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { RunStore } from "../src/harness/run-store.js";
import { ToolQueue } from "../src/harness/tool-queue.js";
import { createDefaultPolicy } from "../src/permissions.js";
import { createToolManifest } from "../src/tools/protocol.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

function harness() {
  const root = join(tmpdir(), `corvus-queue-${Date.now()}-${Math.random()}`);
  roots.push(root);
  const db = openCorvusDatabase(join(root, "corvus.db"));
  ensureDatabase(db);
  const events = new EventLog(db);
  const runs = new RunStore(db, events);
  const evidence = new EvidenceStore(db, events);
  const approvals = new ApprovalService(db, events, createDefaultPolicy());
  const queue = new ToolQueue(db, events, evidence, approvals);
  const run = runs.createRun({ goal: "queue", model: "m", endpoint: "https://example.test/v1" });
  const step = runs.createStep({ runId: run.id, kind: "tool", status: "running", title: "tool" });
  return { db, events, evidence, approvals, queue, run, step };
}

describe("ToolQueue", () => {
  it("executes an allowed tool and stores evidence", async () => {
    const { db, queue, run, step, evidence } = harness();
    const tool = createToolManifest({
      name: "echo",
      namespace: "test",
      version: "1.0.0",
      description: "Echo",
      capability: "local",
      risk: "low",
      parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      timeoutMs: 1000,
      outputLimitBytes: 1000,
      concurrency: { perTool: 1, perRun: 1, global: 2 },
      evidencePolicy: "summary",
      resources: [],
      execute: async ({ text }) => ({ ok: true, output: { text }, summary: String(text) }),
    });

    const result = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: { text: "hello" } });

    expect(result.status).toBe("succeeded");
    expect(evidence.listEvidence(run.id)[0]?.summary).toBe("hello");
    db.close();
  });

  it("creates an approval for ask decisions and resumes after approval", async () => {
    const { db, queue, approvals, run, step } = harness();
    const tool = createToolManifest({
      name: "needs_approval",
      namespace: "test",
      version: "1.0.0",
      description: "Needs approval",
      capability: "process",
      risk: "high",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      timeoutMs: 1000,
      outputLimitBytes: 1000,
      concurrency: { perTool: 1, perRun: 1, global: 1 },
      evidencePolicy: "summary",
      resources: [],
      execute: async () => ({ ok: true, output: "approved", summary: "approved" }),
    });

    const pending = await queue.enqueueAndRun({ runId: run.id, stepId: step.id, tool, args: {} });
    expect(pending.status).toBe("approval_required");

    const approval = approvals.listPending(run.id)[0];
    approvals.resolveApproval(approval.id, "approved", "once");
    const resumed = await queue.runApproved(approval.toolCallId, tool);

    expect(resumed.status).toBe("succeeded");
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/tool-queue.test.ts
```

Expected: FAIL because `approval-service` and `tool-queue` do not exist.

- [ ] **Step 3: Implement ApprovalService**

Create `src/harness/approval-service.ts` with:

- constructor `(db, events, policy)`
- `createApproval({ runId, toolCallId })`
- `listPending(runId?)`
- `resolveApproval(id, status, decisionScope)`
- on `always` set `tool:<toolName>=allow`
- on `never` set `tool:<toolName>=deny`
- append `approval.created`, `approval.approved`, or `approval.denied`

- [ ] **Step 4: Implement ToolQueue**

Create `src/harness/tool-queue.ts` with:

- `enqueueAndRun({ runId, stepId, tool, args })`
- `runApproved(toolCallId, tool)`
- `recoverInterrupted()`
- insert `tool_calls`
- call permission decision through `ApprovalService`
- validate input
- use `AbortController` and timeout
- normalize result
- truncate output above `outputLimitBytes`
- write evidence
- update statuses and events

- [ ] **Step 5: Add missing EvidenceStore helper**

If not present from Task 2, add `listEvidence(runId)` to `EvidenceStore`, sorted by `created_at`.

- [ ] **Step 6: Run tests**

Run:

```powershell
npx vitest run tests/tool-queue.test.ts
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add src/harness tests/tool-queue.test.ts
git commit -m "feat: add durable tool queue"
```

---

### Task 5: HarnessRunner Integration

**Files:**
- Create: `src/harness/runner.ts`
- Modify: `src/agent.ts`
- Modify: `src/index.ts`
- Test: `tests/harness-runner.test.ts`

- [ ] **Step 1: Write failing runner tests**

Create `tests/harness-runner.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config.js";
import { openCorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { EventLog } from "../src/harness/event-log.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { HarnessRunner } from "../src/harness/runner.js";
import { RunStore } from "../src/harness/run-store.js";
import { ToolQueue } from "../src/harness/tool-queue.js";
import { createDefaultPolicy } from "../src/permissions.js";
import { ToolRegistry } from "../src/tools/index.js";
import { createToolManifest } from "../src/tools/protocol.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("HarnessRunner", () => {
  it("persists model tool calls, tool results, messages, events, and evidence", async () => {
    const root = join(tmpdir(), `corvus-runner-${Date.now()}-${Math.random()}`);
    roots.push(root);
    const db = openCorvusDatabase(join(root, "corvus.db"));
    ensureDatabase(db);
    const events = new EventLog(db);
    const runs = new RunStore(db, events);
    const evidence = new EvidenceStore(db, events);
    const approvals = new ApprovalService(db, events, createDefaultPolicy());
    const queue = new ToolQueue(db, events, evidence, approvals);
    const tools = new ToolRegistry(createDefaultPolicy());
    tools.register(
      createToolManifest({
        name: "echo",
        namespace: "test",
        version: "1.0.0",
        description: "Echo",
        capability: "local",
        risk: "low",
        parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        timeoutMs: 1000,
        outputLimitBytes: 1000,
        concurrency: { perTool: 1, perRun: 1, global: 1 },
        evidencePolicy: "summary",
        resources: [],
        execute: async ({ text }) => ({ ok: true, output: { text }, summary: String(text) }),
      }),
    );

    let calls = 0;
    const model = {
      createChatCompletion: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            choices: [
              {
                message: {
                  role: "assistant" as const,
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function" as const,
                      function: { name: "echo", arguments: JSON.stringify({ text: "hi" }) },
                    },
                  ],
                },
              },
            ],
          };
        }
        return { choices: [{ message: { role: "assistant" as const, content: "done" } }] };
      },
    };

    const runner = new HarnessRunner({ config: createDefaultConfig(), model, tools, runs, queue, evidence, events });
    const result = await runner.runTurn("say hi");

    expect(result.message.content).toBe("done");
    expect(runs.getRun(result.runId)?.status).toBe("succeeded");
    expect(evidence.listEvidence(result.runId)[0]?.summary).toBe("hi");
    expect(events.listEvents(result.runId).map((event) => event.type)).toEqual(
      expect.arrayContaining(["run.created", "tool_call.created", "tool_call.succeeded", "evidence.created"]),
    );
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/harness-runner.test.ts
```

Expected: FAIL because `src/harness/runner.ts` does not exist.

- [ ] **Step 3: Implement HarnessRunner**

Create `src/harness/runner.ts` with:

- constructor accepting config, model, tools, runs, queue, evidence, events
- `runTurn(content: string): Promise<{ runId: string; message: ChatMessage }>`
- create run on first turn
- append user message
- model loop up to `config.maxToolRounds`
- persist assistant messages
- create tool step
- enqueue/run tool calls through `ToolQueue`
- append OpenAI tool messages to durable messages
- set run status `waiting_for_approval` when queue returns approval_required
- set `succeeded` when final assistant message has no tool calls
- write snapshots after model/tool loop transitions

- [ ] **Step 4: Update CorvusAgent**

Modify `src/agent.ts` so it can optionally receive `runner?: HarnessRunner`. If runner exists, `send(content)` calls `runner.runTurn(content)` and returns the runner message. Keep current non-durable behavior for existing tests.

- [ ] **Step 5: Export runner**

Modify `src/index.ts`:

```ts
export * from "./harness/runner.js";
```

- [ ] **Step 6: Run tests**

Run:

```powershell
npx vitest run tests/harness-runner.test.ts tests/agent.test.ts
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add src/harness/runner.ts src/agent.ts src/index.ts tests/harness-runner.test.ts
git commit -m "feat: add durable harness runner"
```

---

### Task 6: Harness Commands and CLI Initialization

**Files:**
- Modify: `src/commands.ts`
- Modify: `src/cli.ts`
- Modify: `src/tui.ts`
- Test: `tests/harness-commands.test.ts`

- [ ] **Step 1: Write failing command tests**

Create `tests/harness-commands.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CommandRegistry, createCoreCommands } from "../src/commands.js";
import { createDefaultConfig } from "../src/config.js";

describe("durable harness commands", () => {
  it("prints empty runs approvals and evidence without a harness context", async () => {
    const registry = new CommandRegistry(createCoreCommands());
    const config = createDefaultConfig();
    let output = "";

    await registry.execute("/runs", { config, write: (line) => (output += `${line}\n`) });
    await registry.execute("/approvals", { config, write: (line) => (output += `${line}\n`) });
    await registry.execute("/evidence last", { config, write: (line) => (output += `${line}\n`) });

    expect(output).toContain("No durable runs available.");
    expect(output).toContain("No pending approvals.");
    expect(output).toContain("No evidence available.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/harness-commands.test.ts
```

Expected: FAIL because commands do not exist.

- [ ] **Step 3: Extend CommandContext**

Modify `src/commands.ts` `CommandContext` to include optional durable harness readers:

```ts
harness?: {
  listRuns: () => Array<{ id: string; status: string; goal: string; updatedAt: string }>;
  getRun: (id: string) => unknown | undefined;
  listPendingApprovals: () => Array<{ id: string; toolCallId: string; status: string }>;
  approve: (id: string) => Promise<string> | string;
  deny: (id: string) => Promise<string> | string;
  getEvidence: (idOrLast: string) => unknown | undefined;
};
```

- [ ] **Step 4: Add commands**

Add commands:

- `/runs`
- `/run <id>`
- `/resume <id>`
- `/cancel <id>`
- `/approvals`
- `/approve <id|all>`
- `/deny <id|all>`
- `/evidence [id|last]`

When no `context.harness` exists, return explicit empty or unavailable messages. Do not throw.

- [ ] **Step 5: Initialize durable harness in CLI**

Modify `src/cli.ts`:

- open DB with `openCorvusDatabase()`
- `ensureDatabase(db)`
- create `EventLog`, `RunStore`, `EvidenceStore`, `ApprovalService`, `ToolQueue`
- create `HarnessRunner`
- pass runner into `CorvusAgent`
- pass a lightweight command harness adapter into `CorvusTui`

- [ ] **Step 6: Pass harness context through TUI**

Modify `src/tui.ts` options and command context to pass `harness`.

- [ ] **Step 7: Run tests**

Run:

```powershell
npx vitest run tests/harness-commands.test.ts tests/commands.test.ts tests/tui.test.ts
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 8: CLI smoke**

Run:

```powershell
@('/runs','/approvals','/evidence last','/exit') | node dist/cli.js
```

Expected output includes:

```text
No durable runs available.
No pending approvals.
No evidence available.
Stopping Corvus.
```

- [ ] **Step 9: Remove smoke-generated runtime files**

If CLI creates `.corvus/corvus.db`, remove only after verifying path is inside the workspace:

```powershell
$workspace=(Resolve-Path -LiteralPath .).Path
$target=Resolve-Path -LiteralPath .\.corvus -ErrorAction SilentlyContinue
if ($target) {
  if (-not $target.Path.StartsWith($workspace)) { throw "Refusing to remove outside workspace: $($target.Path)" }
  Remove-Item -LiteralPath $target.Path -Recurse -Force
}
```

- [ ] **Step 10: Commit**

```powershell
git add src/commands.ts src/cli.ts src/tui.ts tests/harness-commands.test.ts
git commit -m "feat: add durable harness commands"
```

---

### Task 7: Documentation, Final Verification, and Integration Audit

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-02-corvus-durable-harness-design.md` only if implementation intentionally changes the design

- [ ] **Step 1: Update README**

Add a `Durable Harness` section:

```md
## Durable Harness

Corvus stores durable local run state in `.corvus/corvus.db`.

The harness records:

- runs
- steps
- messages
- tool calls
- approvals
- evidence
- append-only events
- state snapshots

Useful commands:

- `/runs`
- `/run <id>`
- `/resume <id>`
- `/cancel <id>`
- `/approvals`
- `/approve <id|all>`
- `/deny <id|all>`
- `/evidence [id|last]`

Tool calls run through the durable queue. Permission `ask` decisions pause the run and create an approval record. Tool outputs and denials create evidence.
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 3: Run CLI smoke**

Run:

```powershell
@('/status','/runs','/approvals','/evidence last','/exit') | node dist/cli.js
```

Expected:

- TUI header renders.
- `/status` renders.
- durable harness commands render without throwing.
- `/exit` exits with code 0.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected: only intended docs/runtime source/test files are modified. `.corvus/`, `dist/`, `node_modules/`, and `.superpowers/` must not appear.

- [ ] **Step 5: Commit**

```powershell
git add README.md docs/superpowers/specs/2026-07-02-corvus-durable-harness-design.md
git commit -m "docs: document durable harness usage"
```

If the spec was not modified and only README changed, commit only README.

---

## Self-Review

Spec coverage:

- SQLite `.corvus/corvus.db`: Task 1.
- Relation tables: Task 1.
- `events`: Tasks 1 and 2.
- `state_snapshots`: Tasks 1 and 2.
- `RunStore`, `EventLog`, `EvidenceStore`: Task 2.
- Tool manifest and protocol: Task 3.
- Parameter validation and normalized output: Task 3.
- Async durable queue: Task 4.
- Approval rows and permission ask/deny/allow: Task 4.
- Startup recovery: Task 4.
- `HarnessRunner`: Task 5.
- Commands: Task 6.
- README and final audit: Task 7.

No implementation task introduces resource-level permissions or a risk engine; this matches the approved first-stage scope. Tool execution remains in-process except shell subprocess behavior already present in the project.
