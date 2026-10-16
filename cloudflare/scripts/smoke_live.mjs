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
if (summary.status !== 200 || summary.body.clientes !== 456 || summary.body.saldosPendientes !== 0
  || accounts.status !== 200 || accounts.body.items.length !== 85
  || clients.status !== 200 || clients.body.total !== 456
  || retired.status !== 200 || retired.body.total !== 0
  || charts.status !== 200 || charts.body.meses.length !== 12) {
  throw new Error(`Production verification: ${JSON.stringify({ summaryStatus: summary.status, clients: summary.body.clientes,
    pending: summary.body.saldosPendientes, accountsStatus: accounts.status, accounts: accounts.body.items?.length,
    clientsStatus: clients.status, clientTotal: clients.body.total, retiredStatus: retired.status, retired: retired.body.total,
    chartsStatus: charts.status, months: charts.body.meses?.length })}`);
}
const review = await call('/api/operaciones/revision');
if (review.status !== 200 || review.body.referencias.length || review.body.sinCredenciales.length !== 19
  || review.body.saldos.filter((s) => s.resolucion === 'base_legacy').length !== 61
  || review.body.saldos.filter((s) => s.resolucion === 'historial').length !== 1) throw new Error('Reconciliation check failed');
for (const route of ['vencimientos','cupos','pagos','rentabilidad']) {
  if ((await call(`/api/operaciones/${route}`)).status !== 200) throw new Error(`Failed route ${route}`);
}
await call('/api/logout', 'POST');
console.log('Production API OK: 456 clients, 85 accounts (66 original + 19 reconstructed), 0 pending balances, 24 references resolved, all operations endpoints OK.');
