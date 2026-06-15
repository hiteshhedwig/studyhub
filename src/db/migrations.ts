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
  addColumnIfMissing(db, "Question", "code_meta_json", "TEXT");
  backfillFocusSeconds(db);
  db.run(seedSql);
}

// Before the real-elapsed-focus credit model, focus time was only banked per fully
// completed pomodoro, so sessions ended even a minute early recorded zero focus —
// the Today bar and heatmap showed nothing despite real study. Estimate the focus
// time studied for those finished-but-zero sessions from their wall-clock duration,
// capped at one focus block beyond the pomodoros that did complete (so a session
// left running idle for hours can't over-credit). Only touches rows that are still
// zero, so it's safe to re-run and never overwrites real recorded totals.
function backfillFocusSeconds(db: Database) {
  if (!columnExists(db, "StudySession", "extra_focus_seconds")) return;
  db.run(`
    UPDATE StudySession
    SET extra_focus_seconds = MIN(
      CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER),
      (pomodoros_completed + 1) * focus_minutes * 60
    )
    WHERE ended_at IS NOT NULL
      AND COALESCE(extra_focus_seconds, 0) = 0
      AND CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER) > 0
  `);
}
