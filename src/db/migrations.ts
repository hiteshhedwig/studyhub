import type { Database } from "sql.js";
import { schemaSql, seedSql } from "./schema";

export function runMigrations(db: Database) {
  db.run(schemaSql);
  db.run(seedSql);
}
