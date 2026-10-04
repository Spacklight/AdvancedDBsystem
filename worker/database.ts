import type { Env, Project } from './types';
import { executeSql } from './sqlite';

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

  // Real embedded SQLite WASM engine
  if (project.engine === 'sqlite') {
    const result = await executeSql(statement);

    return {
      mode: 'sqlite',
      engine: 'sqlite',
      ...result
    };
  }

  // MySQL/PostgreSQL will use an external database gateway
  if (!env.DATABASE_API_URL) {
    throw new Error(
      `${project.engine} database service is not configured.`
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (env.DATABASE_API_KEY) {
    headers.Authorization = `Bearer ${env.DATABASE_API_KEY}`;
  }

  const response = await fetch(
    `${env.DATABASE_API_URL}/v1/query`,
    {
      method: 'POST',
      headers,
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
