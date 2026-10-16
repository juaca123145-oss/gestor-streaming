import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const base = 'http://127.0.0.1:8789';
const original = readFileSync(new URL('../.migration/admin-password.txt', import.meta.url), 'utf8').trim();
let cookie = '';
async function call(path, method = 'GET', body, key) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie, ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (path === '/login' && response.ok) cookie = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
assert.equal((await call('/login', 'POST', { password: original })).status, 200);
for (const path of ['vencimientos', 'cupos', 'pagos', 'rentabilidad', 'revision']) assert.equal((await call(`/operaciones/${path}`)).status, 200);
const account = await call('/cuentas', 'POST', { plataformaId: 'test-platform', identificador: 'operations@example.test',
  contrasena: 'local-test-password', fechaCompra: '2026-10-16', venceEl: '2026-11-16' });
assert.equal(account.status, 201);
const accountId = account.data.id;
assert.equal((await call(`/operaciones/cupos/${accountId}`, 'PATCH', { capacidad: 1 })).status, 200);
const input = { nombre: 'Operations test', prefijo: '+51', telefono: '900000001', plataformaId: 'test-platform',
  cuentaId: accountId, fechaInicio: '2026-10-16', venceEl: '2026-11-16', ingresosCentimos: 2000, costosCentimos: 1000, pendiente: true };
const client = await call('/clientes', 'POST', input);
assert.equal(client.status, 201);
assert.equal((await call('/clientes', 'POST', input)).status, 409);
const debt = (await call('/operaciones/pagos')).data.items.find((d) => d.suscripcion_id === client.data.suscripcionId);
assert.equal(debt.importe_centimos, 2000); assert.equal(debt.pagado, 0);
const detail = (await call(`/clientes/${client.data.id}`)).data;
assert.equal(detail.movimientos[0].ingresosCentimos, 0);
const payment = { importeCentimos: 750, fecha: '2026-10-16', metodo: 'Yape' }, opKey = crypto.randomUUID();
assert.equal((await call(`/operaciones/pagos/${debt.id}/abonos`, 'POST', payment, opKey)).status, 200);
assert.equal((await call(`/operaciones/pagos/${debt.id}/abonos`, 'POST', payment, opKey)).data.repetido, true);
assert.equal((await call(`/operaciones/pagos/${debt.id}/abonos`, 'POST', { ...payment, importeCentimos: 2000 }, crypto.randomUUID())).status, 409);
const result = (await call('/operaciones/pagos')).data.items.find((d) => d.id === debt.id);
assert.equal(result.pagado, 750);
const movements = (await call(`/clientes/${client.data.id}`)).data.movimientos;
assert.equal(movements.reduce((s, m) => s + m.ingresosCentimos, 0), 750);
assert.equal((await call(`/operaciones/pagos/${debt.id}/abonos`, 'POST', { ...payment, importeCentimos: 1250, metodo: 'Plin' }, crypto.randomUUID())).status, 200);
const subscription = (await call(`/clientes/${client.data.id}`)).data.suscripciones[0];
assert.equal((await call(`/suscripciones/${subscription.id}/renovaciones`, 'POST', {
  expectedVersion: subscription.version, fechaCobro: '2026-10-16', venceEl: '2026-12-16',
  ingresosCentimos: 1000, costosCentimos: 300, metodoPago: 'Efectivo',
}, crypto.randomUUID())).status, 201);
assert.ok((await call(`/clientes/${client.data.id}`)).data.movimientos.some((m) => m.metodoPago === 'Efectivo'));
const manualKey = crypto.randomUUID(), manualBody = { suscripcionId: subscription.id, concepto: 'Extra de prueba', importeCentimos: 500, fecha: '2026-10-16' };
assert.equal((await call('/operaciones/pagos', 'POST', manualBody, manualKey)).status, 201);
assert.equal((await call('/operaciones/pagos', 'POST', manualBody, manualKey)).data.repetido, true);
assert.equal((await call('/cuentas/test-reference-account', 'PATCH', { contrasena: 'recovered-test', codigoPassword: 'code-test' })).status, 200);
const revealed = (await call('/cuentas/test-reference-account/revelar', 'POST', {})).data;
assert.equal(revealed.contrasena, 'recovered-test'); assert.equal(revealed.codigoPassword, 'code-test');

const oldCookie = cookie, temporary = `test-${crypto.randomUUID()}`;
assert.equal((await call('/operaciones/password', 'POST', { currentPassword: 'incorrect', newPassword: temporary })).status, 401);
assert.equal((await call('/operaciones/password', 'POST', { currentPassword: original, newPassword: temporary })).status, 200);
assert.equal((await call('/session')).status, 401);
assert.equal((await call('/login', 'POST', { password: original })).status, 401);
assert.equal((await call('/login', 'POST', { password: temporary })).status, 200);
assert.equal((await call('/operaciones/cerrar-sesiones', 'POST', {})).status, 200);
assert.equal((await call('/session')).status, 401);
assert.equal((await call('/login', 'POST', { password: temporary })).status, 200);
assert.equal((await call('/operaciones/password', 'POST', { currentPassword: temporary, newPassword: original })).status, 200);
assert.equal((await call('/login', 'POST', { password: original })).status, 200);
const currentCookie = cookie; cookie = oldCookie; assert.equal((await call('/session')).status, 401); cookie = currentCookie;

const passphrase = 'local-backup-test-only';
const backup = await call('/operaciones/respaldo', 'POST', { passphrase });
assert.equal(backup.status, 200);
assert.equal(backup.data.formato, 'dorostream-backup-v1');
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
const aes = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(backup.data.salt, 'base64'), iterations: 100000, hash: 'SHA-256' }, key, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const payload = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(backup.data.iv, 'base64') }, aes, Buffer.from(backup.data.ciphertext, 'base64'))));
assert.ok(payload.tables.clientes.some((c) => c.id === client.data.id));
assert.ok(payload.tables.abonos.filter((a) => a.deuda_id === debt.id).length === 2);
writeFileSync(new URL('../.migration/operations-test.backup.json', import.meta.url), JSON.stringify(backup.data));
console.log('Operations OK: capacity enforced, deferred payments, partial payments, no overpayment/duplicates, password/session revocation, encrypted backup round trip.');
