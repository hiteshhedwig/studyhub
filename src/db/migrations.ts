import type { Database } from "sql.js";
import { schemaSql, seedSql } from "./schema";

/** True if `column` already exists on `table` (per PRAGMA table_info). */
function columnExists(db: Database, table: string, column: string): boolean {
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (!result.length) return false;
  const nameIndex = result[0].columns.indexOf("name");
  return result[0].values.some((row) => row[nameIndex] === column);
}

/** Adds a column only when it's missing, so the migration is safe to re-run. */
function addColumnIfMissing(db: Database, table: string, column: string, definition: string) {
  if (!columnExists(db, table, column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function runMigrations(db: Database) {
  db.run(schemaSql);
  // Additive column migrations for databases created before the column existed —
  // CREATE TABLE IF NOT EXISTS leaves an already-existing table untouched.
  addColumnIfMissing(db, "StudySession", "extra_focus_seconds", "INTEGER NOT NULL DEFAULT 0");
  db.run(seedSql);
}
