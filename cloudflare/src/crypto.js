function decodeBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function encodeBase64(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

async function keyFromEnv(env) {
  if (!env.ACCOUNT_ENCRYPTION_KEY) throw new Error('Missing encryption key');
  const raw = decodeBase64(env.ACCOUNT_ENCRYPTION_KEY.trim());
  if (raw.length !== 32) throw new Error('Invalid encryption key length');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(value, env) {
  const key = await keyFromEnv(env);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, data);
  return { ciphertext: encodeBase64(ciphertext), nonce: encodeBase64(nonce), keyVersion: 1 };
}

export async function decryptSecret(ciphertext, nonce, env) {
  const key = await keyFromEnv(env);
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(nonce) },
    key,
    decodeBase64(ciphertext),
  );
  return new TextDecoder().decode(data);
}
