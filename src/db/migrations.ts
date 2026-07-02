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
