const SESSION_COOKIE = 'ds_session';
const SESSION_SECONDS = 12 * 60 * 60;

function bytesToBase64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64urlToBytes(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sessionKey(env) {
  const bytes = base64urlToBytes((env.SESSION_SIGNING_KEY || '').trim());
  if (bytes.length !== 32) throw new Error('Invalid signing key');
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(payload, env) {
  const signature = await crypto.subtle.sign('HMAC', await sessionKey(env), new TextEncoder().encode(payload));
  return bytesToBase64url(new Uint8Array(signature));
}

async function authenticatedSession(request, env) {
  const cookie = request.headers.get('Cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!cookie) return null;
  const separator = cookie.lastIndexOf('.');
  if (separator < 0) return null;
  const payload = cookie.slice(0, separator);
  const provided = cookie.slice(separator + 1);
  const expected = await sign(payload, env);
  if (!sameBytes(new TextEncoder().encode(provided), new TextEncoder().encode(expected))) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)));
    if (value.sub !== 'local-admin' || value.exp <= Date.now() || value.email !== env.AUTHORIZED_ADMIN_EMAIL?.trim()) return null;
    return env.DB.prepare('SELECT access_subject, correo, rol FROM operadores WHERE access_subject = ? AND activo = 1')
      .bind(value.sub).first();
  } catch {
    return null;
  }
}

export async function login(request, env) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) {
    return new Response(JSON.stringify({ error: 'Solicitud inválida' }), { status: 403, headers });
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Math.floor(Date.now() / 1000);
  const record = await env.DB.prepare('SELECT intentos, bloqueado_hasta FROM login_attempts WHERE ip = ?').bind(ip).first();
  if (record && record.bloqueado_hasta > now) {
    return new Response(JSON.stringify({ error: 'Espera unos minutos antes de intentar de nuevo' }), { status: 429, headers });
  }
  let password = '';
  try {
    const raw = await request.text();
    if (raw.length <= 1000) password = JSON.parse(raw).password;
  } catch { /* invalid JSON */ }
  if (typeof password !== 'string' || password.length > 200) password = '';
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password)));
  const expectedHash = base64urlToBytes((env.ADMIN_PASSWORD_HASH || '').trim());
  if (!sameBytes(hash, expectedHash)) {
    const attempts = (record?.intentos || 0) + 1;
    await env.DB.prepare(`INSERT INTO login_attempts (ip, intentos, bloqueado_hasta) VALUES (?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET intentos = excluded.intentos, bloqueado_hasta = excluded.bloqueado_hasta`)
      .bind(ip, attempts, attempts >= 5 ? now + 900 : 0).run();
    return new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), { status: 401, headers });
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO operadores (access_subject, correo, rol)
    VALUES ('local-admin', ?, 'admin')`).bind(env.AUTHORIZED_ADMIN_EMAIL.trim()).run();
  const payload = bytesToBase64url(new TextEncoder().encode(JSON.stringify({
    sub: 'local-admin', email: env.AUTHORIZED_ADMIN_EMAIL.trim(), exp: Date.now() + SESSION_SECONDS * 1000,
  })));
  const cookie = `${SESSION_COOKIE}=${payload}.${await sign(payload, env)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...headers, 'Set-Cookie': cookie } });
}

export function logout() {
  return new Response(JSON.stringify({ ok: true }), { headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  } });
}

export async function authenticate(request, env) {
  return authenticatedSession(request, env);
}

export function mayManageAccounts(actor) {
  return actor?.rol === 'admin';
}
