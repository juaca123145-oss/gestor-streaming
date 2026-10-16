// Read-only production check. Prints aggregate counts only.
import { readFileSync } from 'node:fs';

const base = 'https://dorostream-api.juaca12314-2bf.workers.dev';
let cookie = '';
async function call(path, method = 'GET', payload) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(method !== 'GET' ? { Origin: base, 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (path === '/api/login') cookie = response.headers.get('set-cookie')?.split(';', 1)[0] || '';
  return { status: response.status, body: await response.json() };
}

if ((await call('/api/resumen')).status !== 401) throw new Error('Anonymous request accepted');
const password = readFileSync(new URL('../.migration/admin-password.txt', import.meta.url), 'utf8').trim();
if ((await call('/api/login', 'POST', { password })).status !== 200) throw new Error('Login failed');
const summary = await call('/api/resumen');
const accounts = await call('/api/cuentas');
const clients = await call('/api/clientes?pagina=1&limite=25');
const retired = await call('/api/clientes?archivados=1&pagina=1&limite=25');
const charts = await call('/api/estadisticas');
if (summary.status !== 200 || summary.body.clientes !== 456 || summary.body.saldosPendientes !== 62
  || accounts.status !== 200 || accounts.body.items.length !== 66
  || clients.status !== 200 || clients.body.total !== 456
  || retired.status !== 200 || retired.body.total !== 0
  || charts.status !== 200 || charts.body.meses.length !== 12) {
  throw new Error('Production aggregate verification failed');
}
await call('/api/logout', 'POST');
console.log('Production API OK: 456 clients, 66 accounts, 62 pending balances, 12 chart months.');
