import initSqlJs, { type Database } from 'cloudflare-worker-sqlite-wasm';
import wasmModule from './wasm/sql-wasm.wasm';
import type { Env } from './types';
import { getObjectBytes, putObjectBytes } from './storage';

// Plain sql.js tries to fetch its .wasm file over HTTP (or read it off disk)
// the first time it's used - both fail in a Worker, which has neither. The
// fix (per cloudflare-worker-sqlite-wasm's own docs) is to import the wasm
// file as a module - Wrangler's bundler compiles it ahead of time - and hand
// it to sql.js directly via instantiateWasm instead of letting it fetch.
let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;
function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      instantiateWasm(imports: WebAssembly.Imports, successCallback: (instance: WebAssembly.Instance) => void) {
        const instance = new WebAssembly.Instance(wasmModule, imports);
        successCallback(instance);
        return instance.exports;
      }
    });
  }
  return sqlJsPromise;
}

// Each project gets its own SQLite database, persisted as a single file in
// the same Hugging Face bucket used for regular file storage (so it's
// automatically counted against the user's existing quota). An in-memory
// cache avoids re-downloading/re-opening the file on every query within the
// same Worker instance; it's an optimization only, never the source of
// truth - the Hugging Face copy is.
//
// Known limitation: two requests for the *same* project arriving concurrently
// on the same Worker instance can race (last write wins) since there is no
// per-project lock. For a single interactive user running one query at a
// time this is not an issue in practice; serializing access properly would
// need a Durable Object per project.
const CACHE_LIMIT = 10;
const cache = new Map<string, Database>();

function storageKey(userId: string, projectId: string) {
  return `accounts/${userId}/sqlite/${projectId}.sqlite3`;
}

function rememberInCache(projectId: string, db: Database) {
  cache.delete(projectId);
  cache.set(projectId, db);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

async function openDatabase(
  env: Env,
  userId: string,
  projectId: string
): Promise<Database> {
  const cached = cache.get(projectId);
  if (cached) {
    rememberInCache(projectId, cached); // bump to most-recently-used
    return cached;
  }

  const SQL = await loadSqlJs();
  const existing = await getObjectBytes(env, storageKey(userId, projectId));
  const db = existing ? new SQL.Database(existing) : new SQL.Database();

  rememberInCache(projectId, db);
  return db;
}

async function persist(env: Env, userId: string, projectId: string, db: Database) {
  const bytes = db.export();
  await putObjectBytes(
    env,
    storageKey(userId, projectId),
    bytes,
    'application/x-sqlite3'
  );
}

// Statements that cannot change the database don't need a write back to
// Hugging Face afterwards - this keeps a plain SELECT cheap.
function isReadOnly(statement: string) {
  return /^\s*(SELECT|EXPLAIN|PRAGMA\s+table_info|PRAGMA\s+table_list)\b/i.test(statement);
}

export async function executeSql(env: Env, userId: string, projectId: string, sql: string) {
  const statement = sql.trim();

  if (!statement) {
    throw new Error('SQL query is empty.');
  }

  if (statement.length > 100_000) {
    throw new Error('SQL query is too large.');
  }

  const db = await openDatabase(env, userId, projectId);
  const results = db.exec(statement);

  if (!isReadOnly(statement)) {
    await persist(env, userId, projectId, db);
  }

  if (results.length === 0) {
    return {
      rows: [],
      fields: [],
      rowCount: 0
    };
  }

  const result = results[0];

  const rows = result.values.map((values: unknown[]) => {
    const row: Record<string, unknown> = {};

    result.columns.forEach((column: string, index: number) => {
      row[column] = values[index];
    });

    return row;
  });

  return {
    rows,
    fields: result.columns,
    rowCount: rows.length
  };
}

// Permanently removes a project's database file from storage. Called when a
// project is deleted so its data doesn't linger in the bucket or the cache.
export async function deleteProjectDatabase(env: Env, userId: string, projectId: string) {
  cache.delete(projectId);
  const { deleteFromHuggingFace } = await import('./storage');
  await deleteFromHuggingFace(env, userId, storageKey(userId, projectId)).catch(() => {
    // Nothing to delete is fine; any other failure already logs via the caller.
  });
}
