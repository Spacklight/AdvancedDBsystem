import initSqlJs, { type Database } from 'cloudflare-worker-sqlite-wasm';

let database: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (database) {
    return database;
  }

  const SQL = await initSqlJs();

  database = new SQL.Database();

  return database;
}

export async function executeSql(sql: string) {
  const db = await getDatabase();

  const statement = sql.trim();

  if (!statement) {
    throw new Error('SQL query is empty.');
  }

  if (statement.length > 100_000) {
    throw new Error('SQL query is too large.');
  }

  const results = db.exec(statement);

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
