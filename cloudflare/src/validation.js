export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function validCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function textField(value, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

export function normalizePhone(value, prefix = '+51') {
  if (typeof prefix !== 'string' || !/^\+\d{1,4}$/.test(prefix)) return null;
  if (value == null || value === '') return { prefijo: prefix, telefono: null };
  if (typeof value !== 'string' || value.length > 100) return null;
  let phone = value.replace(/\s/g, '');
  if (!phone) return { prefijo: prefix, telefono: null };
  if (phone.startsWith('+')) {
    if (phone.startsWith('+51')) prefix = '+51';
    if (!phone.startsWith(prefix)) return null;
    phone = phone.slice(prefix.length);
  }
  return /^\d{5,16}$/.test(phone) ? { prefijo: prefix, telefono: phone } : null;
}

export function limaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
