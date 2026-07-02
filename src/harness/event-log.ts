import type { CorvusDatabase } from "../db/connection.js";
import { newId, nowIso, serializeDurableJsonObject, type EventRow, type JsonObject } from "./types.js";

interface EventDbRow {
  id: string;
  run_id: string | null;
  type: string;
  payload_json: string;
  created_at: string;
}

export class EventLog {
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

    this.db
      .prepare("insert into events (id, run_id, type, payload_json, created_at) values (?, ?, ?, ?, ?)")
      .run(row.id, row.runId, row.type, serializedPayload.json, row.createdAt);

    return row;
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
