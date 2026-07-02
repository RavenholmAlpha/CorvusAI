import type { CorvusDatabase } from "../db/connection.js";
import type { ChatRole } from "../types.js";
import type { EventLog } from "./event-log.js";
import {
  newId,
  nowIso,
  serializeDurableJson,
  type JsonValue,
  type MessageRow,
  type RunRow,
  type RunStatus,
  type SnapshotRow,
  type StepKind,
  type StepRow,
  type StepStatus,
} from "./types.js";

export interface CreateRunInput {
  goal: string;
  model: string;
  endpoint: string;
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
}

interface RunDbRow {
  id: string;
  status: RunStatus;
  goal: string;
  model: string;
  endpoint: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
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
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      };

      this.db
        .prepare(
          `insert into runs (id, status, goal, model, endpoint, created_at, updated_at, completed_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(run.id, run.status, run.goal, run.model, run.endpoint, run.createdAt, run.updatedAt, run.completedAt);
      this.events.append(
        "run.created",
        { runId: run.id, goal: run.goal, model: run.model, endpoint: run.endpoint },
        run.id,
      );
      return run;
    })();
  }

  getRun(id: string): RunRow | undefined {
    const row = this.db
      .prepare("select id, status, goal, model, endpoint, created_at, updated_at, completed_at from runs where id = ?")
      .get(id);
    return row ? mapRunRow(row as RunDbRow) : undefined;
  }

  listRuns(): RunRow[] {
    return this.db
      .prepare(
        `select id, status, goal, model, endpoint, created_at, updated_at, completed_at
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
      const message: MessageRow = {
        id: newId("msg"),
        runId: input.runId,
        role: input.role,
        content: input.content,
        toolCallId: input.toolCallId ?? null,
        createdAt: nowIso(),
      };

      this.db
        .prepare("insert into messages (id, run_id, role, content, tool_call_id, created_at) values (?, ?, ?, ?, ?, ?)")
        .run(message.id, message.runId, message.role, message.content, message.toolCallId, message.createdAt);
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
        `select id, run_id, role, content, tool_call_id, created_at
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
    createdAt: row.created_at,
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
