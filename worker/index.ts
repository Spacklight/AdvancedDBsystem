import type { Env, Engine } from './types';
import { json } from './utils';
import { createProject, getProject, listProjects, deleteProject } from './projects';
import { runSql } from './database';
import { deleteFromHuggingFace, listStorage, uploadToHuggingFace } from './storage';
import { deleteProjectDatabase } from './sqlite';
import {
  getUserId,
  issueSessionToken,
  sessionCookieHeader,
  clearSessionCookieHeader
} from './auth';
import { registerUser, loginUser, getUserById } from './users';

const engines = new Set<Engine>(['mysql', 'postgresql', 'sqlite']);

function withCookie(response: Response, cookie: string): Response {
  response.headers.append('Set-Cookie', cookie);
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return json({ ok: true, service: 'forgedb-platform', time: new Date().toISOString() });
    if (url.pathname === '/api/engines') return json({ engines: ['mysql', 'postgresql', 'sqlite'] });

    try {
      // ---------- auth (no session required) ----------
      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        const body = await request.json() as { email?: string; password?: string };
        const user = await registerUser(env, body.email || '', body.password || '');
        const token = await issueSessionToken(env, user.id);
        return withCookie(json({ user }, { status: 201 }), sessionCookieHeader(token));
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json() as { email?: string; password?: string };
        const user = await loginUser(env, body.email || '', body.password || '');
        const token = await issueSessionToken(env, user.id);
        return withCookie(json({ user }), sessionCookieHeader(token));
      }

      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        return withCookie(json({ ok: true }), clearSessionCookieHeader());
      }

      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        const userId = await getUserId(request, env);
        const user = userId ? await getUserById(env, userId) : null;
        return json({ user });
      }

      // ---------- everything below requires a signed-in session ----------
      const userId = await getUserId(request, env);
      if (!userId) return json({ error: 'Sign in required.' }, { status: 401 });

      if (url.pathname === '/api/projects' && request.method === 'GET') {
        return json({ projects: await listProjects(env, userId) });
      }

      if (url.pathname === '/api/projects' && request.method === 'POST') {
        const body = await request.json() as { name?: string; engine?: Engine };
        if (!body.name || !body.engine || !engines.has(body.engine)) return json({ error: 'Name and a valid engine are required.' }, { status: 400 });
        return json({ project: await createProject(env, userId, body.name.trim().slice(0, 80), body.engine) }, { status: 201 });
      }

      const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch && request.method === 'GET') {
        const project = await getProject(env, userId, projectMatch[1]);
        return project ? json({ project }) : json({ error: 'Project not found.' }, { status: 404 });
      }

      if (projectMatch && request.method === 'DELETE') {
        const project = await getProject(env, userId, projectMatch[1]);
        if (!project) return json({ error: 'Project not found.' }, { status: 404 });
        await deleteProject(env, userId, projectMatch[1]);
        if (project.engine === 'sqlite') await deleteProjectDatabase(env, userId, project.id);
        return json({ ok: true });
      }

      const queryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/query$/);
      if (queryMatch && request.method === 'POST') {
        const project = await getProject(env, userId, queryMatch[1]);
        if (!project) return json({ error: 'Project not found.' }, { status: 404 });
        const body = await request.json() as { sql?: string };
        if (!body.sql) return json({ error: 'SQL is required.' }, { status: 400 });
        return json({ result: await runSql(env, project, body.sql) });
      }

      if (url.pathname === '/api/storage/usage' && request.method === 'GET') {
        const storage = await listStorage(env, userId);
        const quota = Number(env.STORAGE_QUOTA_BYTES || 10 * 1024 ** 3);
        return json({ ...storage, quotaBytes: quota, remainingBytes: Math.max(0, quota - storage.bytes) });
      }

      if (url.pathname === '/api/storage/upload' && request.method === 'POST') {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return json({ error: 'Attach a file using the file field.' }, { status: 400 });
        const quota = Number(env.STORAGE_QUOTA_BYTES || 10 * 1024 ** 3);
        const usage = await listStorage(env, userId);
        if (usage.bytes + file.size > quota) return json({ error: 'Storage quota exceeded.' }, { status: 413 });
        return json({ file: await uploadToHuggingFace(env, userId, file) }, { status: 201 });
      }

      if (url.pathname === '/api/storage/object' && request.method === 'DELETE') {
        const key = url.searchParams.get('key');
        if (!key) return json({ error: 'key is required.' }, { status: 400 });
        return json(await deleteFromHuggingFace(env, userId, key));
      }

      return json({ error: 'Not found' }, { status: 404 });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      return json({ error: message }, { status: 500 });
    }
  }
} satisfies ExportedHandler<Env>;
