import type { Env } from './types';

// Email+password auth, built on the Web Crypto API that's already built into
// the Workers runtime - no bcrypt/jsonwebtoken dependency, so there's no new
// native/eval-dependent code to worry about bundling for Cloudflare.
const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
const COOKIE_NAME = 'fdb_session';

function toB64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `${PBKDF2_ITERATIONS}:${toB64Url(salt)}:${toB64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterationsRaw, saltB64, hashB64] = stored.split(':');
  const iterations = Number(iterationsRaw);
  if (!iterations || !saltB64 || !hashB64) return false;

  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromB64Url(saltB64), iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return timingSafeEqual(toB64Url(new Uint8Array(bits)), hashB64);
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

// A minimal signed, expiring session token: base64url(payload) + "." +
// base64url(HMAC signature). Not a general-purpose JWT implementation - just
// enough to prove "this user id, issued by us, not expired" without adding a
// JWT library to the bundle.
export async function issueSessionToken(env: Env, userId: string): Promise<string> {
  if (!env.AUTH_JWT_SECRET) throw new Error('Authentication is not configured on the server yet.');
  const payload = JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  const payloadB64 = toB64Url(new TextEncoder().encode(payload));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env.AUTH_JWT_SECRET), new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toB64Url(new Uint8Array(signature))}`;
}

async function verifySessionToken(env: Env, token: string): Promise<string | null> {
  if (!env.AUTH_JWT_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC', await hmacKey(env.AUTH_JWT_SECRET), fromB64Url(signatureB64), new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(payloadB64))) as { sub?: string; exp?: number };
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') || '';
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key) cookies[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

export function sessionCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// Returns the authenticated user id for this request, or null if there is no
// valid session. Never throws - an invalid/expired/missing cookie just means
// "not logged in".
export async function getUserId(request: Request, env: Env): Promise<string | null> {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(env, token);
}
