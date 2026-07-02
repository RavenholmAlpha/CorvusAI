import type { CorvusDatabase } from "./connection.js";
import { INITIAL_SCHEMA_VERSION, initialSchemaSql } from "./schema.js";

function tableExists(db: CorvusDatabase, table: string): boolean {
  return Boolean(
    db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(table),
  );
}

function tableHasColumn(db: CorvusDatabase, table: string, column: string): boolean {
  return db
    .prepare(`pragma table_info(${table})`)
    .all()
    .some((row) => (row as { name: string }).name === column);
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

export function ensureDatabase(db: CorvusDatabase): void {
  const apply = db.transaction(() => {
    const createdAt = new Date().toISOString();
    ensureCompatibilityColumns(db, createdAt);
    db.exec(initialSchemaSql);
    ensureCompatibilityColumns(db, createdAt);
    const existing = db
      .prepare("select version from schema_migrations where version = ?")
      .get(INITIAL_SCHEMA_VERSION);
    if (!existing) {
      db.prepare("insert into schema_migrations (version, name, applied_at, created_at) values (?, ?, ?, ?)")
        .run(INITIAL_SCHEMA_VERSION, "initial durable harness schema", createdAt, createdAt);
    }
  });
  apply();
}
