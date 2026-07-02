import type { CorvusDatabase } from "../db/connection.js";
import type { EventLog } from "./event-log.js";
import { newId, nowIso, type EvidenceRow, type EvidenceSourceType } from "./types.js";

export interface CreateEvidenceInput {
  runId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  title: string;
  summary: string;
  content: string;
}

interface EvidenceDbRow {
  id: string;
  run_id: string;
  source_type: EvidenceSourceType;
  source_id: string;
  title: string;
  summary: string;
  content: string;
  created_at: string;
}

export class EvidenceStore {
  constructor(
    private readonly db: CorvusDatabase,
    private readonly events: EventLog,
  ) {}

  createEvidence(input: CreateEvidenceInput): EvidenceRow {
    return this.db.transaction(() => {
      const evidence: EvidenceRow = {
        id: newId("ev"),
        runId: input.runId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        title: input.title,
        summary: input.summary,
        content: input.content,
        createdAt: nowIso(),
      };

      this.db
        .prepare(
          `insert into evidence (id, run_id, source_type, source_id, title, summary, content, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evidence.id,
          evidence.runId,
          evidence.sourceType,
          evidence.sourceId,
          evidence.title,
          evidence.summary,
          evidence.content,
          evidence.createdAt,
        );
      this.events.append(
        "evidence.created",
        {
          runId: evidence.runId,
          evidenceId: evidence.id,
          sourceType: evidence.sourceType,
          sourceId: evidence.sourceId,
          title: evidence.title,
          summary: evidence.summary,
        },
        evidence.runId,
      );
      return evidence;
    })();
  }

  getEvidence(id: string): EvidenceRow | undefined {
    const row = this.db
      .prepare("select id, run_id, source_type, source_id, title, summary, content, created_at from evidence where id = ?")
      .get(id);
    return row ? mapEvidenceRow(row as EvidenceDbRow) : undefined;
  }

  listEvidence(runId: string): EvidenceRow[] {
    return this.db
      .prepare(
        `select id, run_id, source_type, source_id, title, summary, content, created_at
         from evidence
         where run_id = ?
         order by created_at, id`,
      )
      .all(runId)
      .map((row) => mapEvidenceRow(row as EvidenceDbRow));
  }
}

function mapEvidenceRow(row: EvidenceDbRow): EvidenceRow {
  return {
    id: row.id,
    runId: row.run_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    createdAt: row.created_at,
  };
}
