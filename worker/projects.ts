import type { Env, Project, Engine } from './types';
import { isDemo, now, uid } from './utils';

const demoProjects: Project[] = [
  {
    id: 'proj_demo_mysql',
    user_id: 'demo-user',
    name: 'Storefront',
    engine: 'mysql',
    status: 'ready',
    created_at: now(),
    storage_bytes: 184_000_000
  },
  {
    id: 'proj_demo_pg',
    user_id: 'demo-user',
    name: 'Analytics',
    engine: 'postgresql',
    status: 'ready',
    created_at: now(),
    storage_bytes: 92_000_000
  },
  {
    id: 'proj_demo_sqlite',
    user_id: 'demo-user',
    name: 'Mobile Cache',
    engine: 'sqlite',
    status: 'ready',
    created_at: now(),
    storage_bytes: 38_000_000
  }
];

export async function listProjects(
  env: Env,
  userId: string
): Promise<Project[]> {
  return demoProjects.filter((p) => p.user_id === userId);
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

  demoProjects.unshift(project);
  return project;
}

export async function getProject(
  env: Env,
  userId: string,
  id: string
): Promise<Project | null> {
  return (
    demoProjects.find(
      (p) => p.id === id && p.user_id === userId
    ) || null
  );
}
