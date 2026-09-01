import type { CorvusDatabase } from "../db/connection.js";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { newId, nowIso, serializeDurableJsonObject, type EventRow, type JsonObject } from "./types.js";

interface EventDbRow {
  id: string;
  run_id: string | null;
  type: string;
  payload_json: string;
  created_at: string;
}

export class EventLog {
  private readonly emitter = new EventEmitter();
  constructor(private readonly db: CorvusDatabase) {}

  append(type: string, payload: Record<string, unknown>, runId?: string | null): EventRow {
    const serializedPayload = serializeDurableJsonObject(payload, "payload");
    const row: EventRow = {
      id: newId("evt"),
      runId: runId ?? null,
      type,
      payload: serializedPayload.value,
      createdAt: nowIso(),
    };

    const previous = this.db.prepare("select event_hash from events where event_hash is not null order by created_at desc, id desc limit 1").get() as { event_hash: string } | undefined;
    const previousHash = previous?.event_hash ?? null;
    const eventHash = createHash("sha256").update([previousHash ?? "GENESIS", row.id, row.runId ?? "", row.type, serializedPayload.json, row.createdAt].join("\n")).digest("hex");
    this.db.prepare("insert into events (id, run_id, type, payload_json, created_at, previous_hash, event_hash) values (?, ?, ?, ?, ?, ?, ?)").run(row.id, row.runId, row.type, serializedPayload.json, row.createdAt, previousHash, eventHash);

    this.emitter.emit("event", row);
    return row;
  }

  onEvent(listener: (event: EventRow) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  listRecent(limit = 100): EventRow[] {
    return this.db.prepare("select id, run_id, type, payload_json, created_at from events order by created_at desc, id desc limit ?").all(limit).map((row) => mapEventRow(row as EventDbRow));
  }

  verifyChain(): { ok: boolean; checked: number; brokenAt?: string } {
    const rows = this.db.prepare("select id, run_id, type, payload_json, created_at, previous_hash, event_hash from events order by created_at, id").all() as Array<EventDbRow & { previous_hash: string | null; event_hash: string | null }>;
    let previous: string | null = null; let checked = 0;
    for (const row of rows) { if (!row.event_hash) continue; const expected: string = createHash("sha256").update([previous ?? "GENESIS", row.id, row.run_id ?? "", row.type, row.payload_json, row.created_at].join("\n")).digest("hex"); if (row.previous_hash !== previous || row.event_hash !== expected) return { ok: false, checked, brokenAt: row.id }; previous = row.event_hash; checked++; }
    return { ok: true, checked };
  }

  listEvents(runId: string): EventRow[] {
    return this.db
      .prepare(
        `select id, run_id, type, payload_json, created_at
         from events
         where run_id = ?
         order by created_at, id`,
      )
      .all(runId)
      .map((row) => mapEventRow(row as EventDbRow));
  }
}

function mapEventRow(row: EventDbRow): EventRow {
  return {
    id: row.id,
    runId: row.run_id,
    type: row.type,
    payload: JSON.parse(row.payload_json) as JsonObject,
    createdAt: row.created_at,
  };
}
