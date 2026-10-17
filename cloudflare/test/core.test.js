import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret } from '../src/crypto.js';
import { addDays, limaToday, validCents, validDate, normalizePhone } from '../src/validation.js';
import worker from '../src/worker.js';

test('phone paste formats preserve the number and avoid a duplicated country prefix', () => {
  for (const input of ['+51 903 242 961', '903 242 961', '903242961', '+51903242961', ' +51\u00a0903 242 961 ']) {
    assert.deepEqual(normalizePhone(input), { prefijo: '+51', telefono: '903242961' });
  }
  assert.deepEqual(normalizePhone('+51 903 242 961', '+54'), { prefijo: '+51', telefono: '903242961' });
  assert.deepEqual(normalizePhone('+54 911 1234 5678', '+54'), { prefijo: '+54', telefono: '91112345678' });
  assert.equal(normalizePhone('+54 911 1234 5678', '+51'), null);
  assert.equal(normalizePhone('903ABC242961'), null);
  assert.deepEqual(normalizePhone(''), { prefijo: '+51', telefono: null });
});

test('dates and money reject impossible or unsafe values', () => {
  assert.equal(validDate('2026-02-28'), true);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('16/10/2026'), false);
  assert.equal(validCents(0), true);
  assert.equal(validCents(1499), true);
  assert.equal(validCents(-1), false);
  assert.equal(validCents(12.5), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(limaToday(new Date('2026-10-17T03:00:00Z')), '2026-10-16');
});

test('account secret round trip encrypts with a unique nonce', async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const env = { ACCOUNT_ENCRYPTION_KEY: btoa(String.fromCharCode(...bytes)) };
  const first = await encryptSecret('clave-de-ejemplo', env);
  const second = await encryptSecret('clave-de-ejemplo', env);
  assert.notEqual(first.ciphertext, 'clave-de-ejemplo');
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.nonce, second.nonce);
  assert.equal(await decryptSecret(first.ciphertext, first.nonce, env), 'clave-de-ejemplo');
  await assert.rejects(decryptSecret(first.ciphertext, second.nonce, env));
});

test('API denies requests without an authenticated session', async () => {
  const response = await worker.fetch(new Request('https://demo.workers.dev/api/clientes'), {});
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
