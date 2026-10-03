import type { Env, Engine, Project } from './types';
import { isDemo } from './utils';

const demoRows = [
  { id: 1, name: 'Alice', email: 'alice@example.com', status: 'active' },
  { id: 2, name: 'Brian', email: 'brian@example.com', status: 'active' },
  { id: 3, name: 'Chisomo', email: 'chisomo@example.com', status: 'invited' }
];

export async function runSql(
  env: Env,
  project: Project,
  sql: string
) {
  const statement = sql.trim();

  if (!statement) {
    throw new Error('SQL query is empty.');
  }

  if (statement.length > 100_000) {
    throw new Error('SQL query is too large.');
  }

  /*
   * Demo mode intentionally does not connect to a real database.
   * The real database gateway will be connected later.
   */
  if (isDemo(env)) {
    const isSelect = /^select\b/i.test(statement);

    return {
      mode: 'demo',
      engine: project.engine,
      rows: isSelect ? demoRows : [],
      fields: isSelect ? Object.keys(demoRows[0]) : [],
      rowCount: isSelect ? demoRows.length : 0,
      message:
        'Demo mode: SQL execution is simulated. A real external database service will be connected later.'
    };
  }

  /*
   * Production database execution will go through the external
   * database service rather than Cloudflare D1 or Hyperdrive.
   */
  if (!env.DATABASE_API_URL) {
    throw new Error(
      'External database service is not configured.'
    );
  }

  return executeThroughDatabaseService(
    env,
    project,
    statement
  );
}

async function executeThroughDatabaseService(
  env: Env,
  project: Project,
  sql: string
) {
  const response = await fetch(
    `${env.DATABASE_API_URL}/v1/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.DATABASE_API_KEY
          ? { Authorization: `Bearer ${env.DATABASE_API_KEY}` }
          : {})
      },
      body: JSON.stringify({
        projectId: project.id,
        engine: project.engine,
        sql
      })
    }
  );

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Database service returned an invalid response (${response.status}).`
    );
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : 'Database service request failed.';

    throw new Error(message);
  }

  return data;
}
