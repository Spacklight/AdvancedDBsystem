export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
}

export function now() {
  return new Date().toISOString();
}

export function safeUserId(request: Request) {
  return request.headers.get('x-demo-user') || 'demo-user';
}

export function isDemo(env: { DEMO_MODE?: string }) {
  return env.DEMO_MODE !== 'false';
}
