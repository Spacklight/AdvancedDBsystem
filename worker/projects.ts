import type { Env, Project, Engine } from './types';
import { uid, now } from './utils';

export async function listProjects(env: Env, userId: string): Promise<Project[]> {
  const { results } = await env.DB.prepare(
    'SELECT id, user_id, name, engine, status, created_at, storage_bytes FROM projects WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all<Project>();
  return results || [];
}

export async function createProject(
  env: Env,
  userId: string,
  name: string,
  engine: Engine
): Promise<Project> {
  const project: Project = {
    id: uid('proj'),
    user_id: userId,
    name,
    engine,
    status: 'ready',
    created_at: now(),
    storage_bytes: 0
  };

  await env.DB.prepare(
    'INSERT INTO projects (id, user_id, name, engine, status, created_at, storage_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    project.id, project.user_id, project.name, project.engine,
    project.status, project.created_at, project.storage_bytes
  ).run();

  return project;
}

export async function getProject(env: Env, userId: string, id: string): Promise<Project | null> {
  const row = await env.DB.prepare(
    'SELECT id, user_id, name, engine, status, created_at, storage_bytes FROM projects WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first<Project>();
  return row || null;
}

// Returns true if a project owned by this user was actually deleted.
// Scoped by user_id so one account can never delete another's project.
export async function deleteProject(env: Env, userId: string, id: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'DELETE FROM projects WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run();
  return (result.meta?.changes || 0) > 0;
}
