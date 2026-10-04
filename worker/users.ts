import type { Env } from './types';
import { uid, now } from './utils';
import { hashPassword, verifyPassword } from './auth';

export interface UserRecord {
  id: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(env: Env, rawEmail: string, password: string): Promise<UserRecord> {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (password.length > 200) throw new Error('Password is too long.');

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) throw new Error('An account with that email already exists.');

  const id = uid('user');
  const passwordHash = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).bind(id, email, passwordHash, now()).run();

  return { id, email };
}

export async function loginUser(env: Env, rawEmail: string, password: string): Promise<UserRecord> {
  const email = String(rawEmail || '').trim().toLowerCase();
  const row = await env.DB.prepare(
    'SELECT id, email, password_hash FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; email: string; password_hash: string }>();

  // Same error for "no such account" and "wrong password" so a login attempt
  // can't be used to discover which emails have accounts.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new Error('Incorrect email or password.');
  }

  return { id: row.id, email: row.email };
}

export async function getUserById(env: Env, id: string): Promise<UserRecord | null> {
  const row = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(id).first<{ id: string; email: string }>();
  return row || null;
}
