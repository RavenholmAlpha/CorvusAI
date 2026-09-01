import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getConfigRoot } from "../config.js";

export type CorvusDatabase = Database.Database;

export function defaultDatabasePath(): string {
  return join(getConfigRoot(), "corvus.db");
}

export function openCorvusDatabase(path = defaultDatabasePath()): CorvusDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
