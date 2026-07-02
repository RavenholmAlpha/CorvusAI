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
  if (tableExists(db, "steps") && !tableHasColumn(db, "steps", "created_at")) {
    db.exec("alter table steps add column created_at text not null default '1970-01-01T00:00:00.000Z'");
    db.prepare("update steps set created_at = coalesce(started_at, ?)").run(createdAt);
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
