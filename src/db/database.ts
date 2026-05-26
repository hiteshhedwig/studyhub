import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { runMigrations } from "./migrations";

const DB_STORE = "study-hub-sqlite";
const DB_KEY = "main";
let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbPromise: Promise<Database> | null = null;

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_STORE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readPersistedBinary(): Promise<Uint8Array | null> {
  const idb = await openStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(DB_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as ArrayBuffer | Uint8Array | undefined;
      resolve(result ? new Uint8Array(result) : null);
    };
  });
}

async function writePersistedBinary(binary: Uint8Array): Promise<void> {
  const idb = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(binary, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function sql() {
  sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl });
  return sqlPromise;
}

export async function getDatabase(): Promise<Database> {
  dbPromise ??= (async () => {
    const SQL = await sql();
    const persisted = await readPersistedBinary();
    const db = persisted ? new SQL.Database(persisted) : new SQL.Database();
    runMigrations(db);
    await persistDatabase(db);
    return db;
  })();
  return dbPromise;
}

export async function persistDatabase(db?: Database): Promise<void> {
  const activeDb = db ?? (await getDatabase());
  await writePersistedBinary(activeDb.export());
}

export async function resetDatabase(): Promise<void> {
  const SQL = await sql();
  const db = new SQL.Database();
  runMigrations(db);
  dbPromise = Promise.resolve(db);
  await persistDatabase(db);
}

export async function exportDatabaseBinary(): Promise<Uint8Array> {
  const db = await getDatabase();
  return db.export();
}

export async function replaceDatabase(binary: Uint8Array): Promise<void> {
  const SQL = await sql();
  // Throws if the file is not a valid SQLite database.
  const db = new SQL.Database(binary);
  runMigrations(db);
  dbPromise = Promise.resolve(db);
  await persistDatabase(db);
}

export function toRows<T extends Record<string, unknown>>(db: Database, sqlText: string, params: SqlValue[] = []): T[] {
  const stmt = db.prepare(sqlText, params);
  const rows: T[] = [];
  try {
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
  } finally {
    stmt.free();
  }
  return rows;
}

export function one<T extends Record<string, unknown>>(db: Database, sqlText: string, params: SqlValue[] = []): T | null {
  return toRows<T>(db, sqlText, params)[0] ?? null;
}
