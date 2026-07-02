import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";

const roots: string[] = [];
const databases: CorvusDatabase[] = [];

afterEach(async () => {
  for (const db of databases) {
    if (db.open) {
      db.close();
    }
  }
  databases.length = 0;
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

function openTestDatabase(path: string): CorvusDatabase {
  const db = openCorvusDatabase(path);
  databases.push(db);
  return db;
}

describe("database migrations", () => {
  it("creates the durable harness schema idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-db-"));
    roots.push(root);
    const dbPath = join(root, "corvus.db");
    const db = openTestDatabase(dbPath);

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
        "settings",
        "state_snapshots",
        "steps",
        "tool_calls",
      ]),
    );
    expect(db.prepare("select count(*) as count from schema_migrations").get()).toEqual({ count: 1 });

    db.close();
  });

  it("enforces foreign keys for run-owned durable records", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-db-"));
    roots.push(root);
    const db = openTestDatabase(join(root, "corvus.db"));

    ensureDatabase(db);

    expect(() =>
      db
        .prepare(
          `insert into tool_calls
            (id, run_id, tool_name, capability, status, arguments_json, timeout_ms, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("tool_missing_run", "missing_run", "now", "local", "pending", "{}", 1000, "2026-07-02T00:00:00.000Z"),
    ).toThrow(/FOREIGN KEY constraint failed/);

    db.close();
  });

  it("preserves rows across close and reopen without duplicating migrations", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-db-"));
    roots.push(root);
    const dbPath = join(root, "corvus.db");
    const createdAt = "2026-07-02T00:00:00.000Z";
    const first = openTestDatabase(dbPath);

    ensureDatabase(first);
    first
      .prepare(
        `insert into runs
          (id, status, goal, model, endpoint, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("run_persisted", "created", "persist data", "test-model", "https://example.test/v1", createdAt, createdAt);
    first
      .prepare("insert into settings (key, value_json, created_at, updated_at) values (?, ?, ?, ?)")
      .run("harness.mode", JSON.stringify({ durable: true }), createdAt, createdAt);
    first.close();

    const reopened = openTestDatabase(dbPath);
    ensureDatabase(reopened);

    expect(reopened.prepare("select goal from runs where id = ?").get("run_persisted")).toEqual({
      goal: "persist data",
    });
    expect(reopened.prepare("select value_json from settings where key = ?").get("harness.mode")).toEqual({
      value_json: JSON.stringify({ durable: true }),
    });
    expect(reopened.prepare("select count(*) as count from schema_migrations").get()).toEqual({ count: 1 });

    reopened.close();
  });

  it("creates indexes for common status and creation-time queries", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-db-"));
    roots.push(root);
    const db = openTestDatabase(join(root, "corvus.db"));

    ensureDatabase(db);

    const indexes = db
      .prepare("select name from sqlite_master where type = 'index' order by name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_approvals_run_id_status_created_at",
        "idx_events_run_id_created_at",
        "idx_evidence_run_id_created_at",
        "idx_runs_status_created_at",
        "idx_settings_updated_at",
        "idx_tool_calls_run_id_status_created_at",
      ]),
    );

    db.close();
  });
});
