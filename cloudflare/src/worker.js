import { authenticate, login, logout, mayManageAccounts } from './auth.js';
import { encryptSecret, decryptSecret } from './crypto.js';
import { addDays, limaToday, textField, validCents, validDate } from './validation.js';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function bodyOf(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 100_000) return null;
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function cleanPhone(value) {
  if (value == null || value === '') return null;
  const phone = String(value).trim();
  return /^\d{5,16}$/.test(phone) ? phone : null;
}

function uuid() {
  return crypto.randomUUID();
}

async function summary(env) {
  const today = limaToday();
  const week = addDays(today, 7);
  const [year, month] = today.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [clients, subscriptions, movementsMonth, legacyMonth, historical] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS total FROM clientes'),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN estado = 'activa' AND vence_el >= ? THEN 1 ELSE 0 END) AS activas,
      SUM(CASE WHEN estado = 'activa' AND vence_el BETWEEN ? AND ? THEN 1 ELSE 0 END) AS proximas,
      SUM(CASE WHEN estado = 'activa' AND vence_el < ? THEN 1 ELSE 0 END) AS vencidas
      FROM suscripciones`).bind(today, today, week, today),
    env.DB.prepare(`SELECT COALESCE(SUM(ingresos_centimos - costos_centimos), 0) AS margen_centimos
      FROM movimientos WHERE fecha_cobro >= ? AND fecha_cobro < ?`).bind(monthStart, nextMonth),
    env.DB.prepare(`SELECT COUNT(*) AS ventas, COALESCE(SUM(precio_venta_centimos - precio_compra_centimos), 0) AS margen_centimos,
      SUM(CASE WHEN precio_venta_centimos IS NULL OR precio_compra_centimos IS NULL THEN 1 ELSE 0 END) AS sin_importe
      FROM suscripciones WHERE legacy_cliente_id IS NOT NULL AND fecha_compra >= ? AND fecha_compra < ?`)
      .bind(monthStart, nextMonth),
    env.DB.prepare(`SELECT
      (SELECT COALESCE(SUM(ingresos_centimos - costos_centimos), 0) FROM saldos_iniciales
        WHERE estado_revision = 'verificado' AND ingresos_centimos IS NOT NULL AND costos_centimos IS NOT NULL)
      + (SELECT COALESCE(SUM(ingresos_centimos - costos_centimos), 0) FROM movimientos) AS margen_centimos,
      (SELECT COUNT(*) FROM saldos_iniciales WHERE estado_revision = 'pendiente') AS pendientes`),
  ]);
  const margenExcelMes = legacyMonth.results[0].margen_centimos;
  const margenMovimientosMes = movementsMonth.results[0].margen_centimos;
  return json({
    clientes: clients.results[0].total,
    activas: subscriptions.results[0].activas || 0,
    proximas: subscriptions.results[0].proximas || 0,
    vencidas: subscriptions.results[0].vencidas || 0,
    margenMesCentimos: margenExcelMes + margenMovimientosMes,
    margenExcelMesCentimos: margenExcelMes,
    margenMovimientosMesCentimos: margenMovimientosMes,
    ventasExcelMes: legacyMonth.results[0].ventas,
    ventasExcelSinImporte: legacyMonth.results[0].sin_importe || 0,
    margenHistoricoVerificadoCentimos: historical.results[0].margen_centimos,
    saldosPendientes: historical.results[0].pendientes,
    fecha: today,
  });
}

async function analytics(env) {
  const today = limaToday();
  const [year, month] = today.split('-').map(Number);
  const firstMonth = new Date(Date.UTC(year, month - 12, 1)).toISOString().slice(0, 7);
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const [monthly, platforms] = await env.DB.batch([
    env.DB.prepare(`SELECT mes, SUM(margen_centimos) AS margenCentimos FROM (
      SELECT substr(fecha_compra, 1, 7) AS mes,
        precio_venta_centimos - precio_compra_centimos AS margen_centimos
      FROM suscripciones WHERE legacy_cliente_id IS NOT NULL
        AND fecha_compra >= ? AND fecha_compra < ?
        AND precio_venta_centimos IS NOT NULL AND precio_compra_centimos IS NOT NULL
      UNION ALL
      SELECT substr(fecha_cobro, 1, 7) AS mes,
        ingresos_centimos - costos_centimos AS margen_centimos
      FROM movimientos WHERE fecha_cobro >= ? AND fecha_cobro < ?
    ) GROUP BY mes ORDER BY mes`).bind(`${firstMonth}-01`, nextMonth, `${firstMonth}-01`, nextMonth),
    env.DB.prepare(`SELECT p.id, p.nombre, COUNT(s.id) AS suscripciones
      FROM plataformas p LEFT JOIN suscripciones s ON s.plataforma_id = p.id
      GROUP BY p.id ORDER BY suscripciones DESC, p.nombre COLLATE NOCASE`),
  ]);
  const byMonth = new Map(monthly.results.map((row) => [row.mes, row.margenCentimos]));
  const months = Array.from({ length: 12 }, (_, index) => {
    const mes = new Date(Date.UTC(year, month - 12 + index, 1)).toISOString().slice(0, 7);
    return { mes, margenCentimos: byMonth.get(mes) || 0 };
  });
  return json({ meses: months, plataformas: platforms.results });
}

async function getSettings(env) {
  const result = await env.DB.prepare(`SELECT clave, valor FROM configuracion
    WHERE clave IN ('moneda', 'prefijo_defecto', 'proveedor_nombre', 'proveedor_telefono', 'condiciones_plataformas')`).all();
  const values = Object.fromEntries(result.results.map((row) => [row.clave, row.valor]));
  let conditions = {};
  try {
    const parsed = JSON.parse(values.condiciones_plataformas || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) conditions = parsed;
  } catch { /* Conservar el texto original en D1; la interfaz usa condiciones vacías. */ }
  return json({ moneda: values.moneda || 'S/.', prefijoDefecto: values.prefijo_defecto || '+51',
    proveedorNombre: values.proveedor_nombre || '', proveedorTelefono: values.proveedor_telefono || '',
    condiciones: conditions });
}

async function saveSettings(request, env) {
  const body = await bodyOf(request);
  if (!body || typeof body.prefijoDefecto !== 'string' || !/^\+\d{1,4}$/.test(body.prefijoDefecto)
    || typeof body.proveedorNombre !== 'string' || body.proveedorNombre.length > 150
    || typeof body.proveedorTelefono !== 'string' || body.proveedorTelefono.length > 50
    || !body.condiciones || typeof body.condiciones !== 'object' || Array.isArray(body.condiciones)) {
    return error('Ajustes inválidos');
  }
  const platformRows = await env.DB.prepare('SELECT nombre FROM plataformas').all();
  const names = new Set(platformRows.results.map((row) => row.nombre));
  const conditions = {};
  for (const [name, value] of Object.entries(body.condiciones)) {
    if (!names.has(name) || typeof value !== 'string' || value.length > 4000) return error('Condiciones inválidas');
    conditions[name] = value;
  }
  await env.DB.batch([
    ...[['prefijo_defecto', body.prefijoDefecto], ['proveedor_nombre', body.proveedorNombre.trim()],
      ['proveedor_telefono', body.proveedorTelefono.trim()],
      ['condiciones_plataformas', JSON.stringify(conditions)]].map(([key, value]) =>
      env.DB.prepare(`INSERT INTO configuracion (clave, valor) VALUES (?, ?)
        ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`).bind(key, value)),
  ]);
  return json({ ok: true });
}

async function addPlatform(request, env) {
  const body = await bodyOf(request);
  if (!body || !textField(body.nombre, 80)) return error('Nombre de plataforma inválido');
  const name = body.nombre.trim();
  const existing = await env.DB.prepare('SELECT id FROM plataformas WHERE nombre = ? COLLATE NOCASE').bind(name).first();
  if (existing) return error('La plataforma ya existe', 409);
  const id = uuid();
  await env.DB.prepare('INSERT INTO plataformas (id, nombre) VALUES (?, ?)').bind(id, name).run();
  return json({ id, nombre: name }, 201);
}

async function listClients(url, env) {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(url.searchParams.get('pagina') || '1', 10) || 1));
  const rawLimit = Number.parseInt(url.searchParams.get('limite') || '25', 10) || 25;
  const limit = Math.max(1, Math.min(50, rawLimit));
  const search = (url.searchParams.get('buscar') || '').trim().slice(0, 80);
  const needle = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  const condition = search ? `WHERE c.nombre LIKE ? ESCAPE '\\' OR c.telefono LIKE ? ESCAPE '\\'` : '';
  const params = search ? [needle, needle] : [];
  const base = `FROM clientes c LEFT JOIN suscripciones s ON s.id = (
    SELECT id FROM suscripciones WHERE cliente_id = c.id ORDER BY vence_el DESC, id DESC LIMIT 1
  ) LEFT JOIN plataformas p ON p.id = s.plataforma_id ${condition}`;
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(`SELECT c.id, c.nombre, c.prefijo, c.telefono, s.id AS suscripcionId,
      s.vence_el AS venceEl, s.estado, s.version, s.legacy_cuenta AS cuentaOriginal, p.nombre AS plataforma
      ${base} ORDER BY s.vence_el ASC, c.nombre COLLATE NOCASE ASC LIMIT ? OFFSET ?`)
      .bind(...params, limit, (page - 1) * limit),
    env.DB.prepare(`SELECT COUNT(*) AS total ${base}`).bind(...params),
  ]);
  return json({ items: rows.results, total: count.results[0].total, pagina: page, limite: limit });
}

async function upcomingClients(env) {
  const result = await env.DB.prepare(`SELECT c.id, c.nombre, c.prefijo, c.telefono,
    s.vence_el AS venceEl, s.estado, p.nombre AS plataforma
    FROM suscripciones s JOIN clientes c ON c.id = s.cliente_id
    JOIN plataformas p ON p.id = s.plataforma_id
    WHERE s.estado = 'activa' AND s.vence_el >= ?
    ORDER BY s.vence_el ASC, c.nombre COLLATE NOCASE ASC LIMIT 6`).bind(limaToday()).all();
  return json({ items: result.results });
}

async function getClient(id, env) {
  const client = await env.DB.prepare('SELECT id, nombre, prefijo, telefono FROM clientes WHERE id = ?')
    .bind(id).first();
  if (!client) return error('Cliente no encontrado', 404);
  const subscriptions = await env.DB.prepare(`SELECT s.id, s.plataforma_id AS plataformaId,
    p.nombre AS plataforma, s.cuenta_id AS cuentaId, s.perfil, s.fecha_inicio AS fechaInicio,
    s.vence_el AS venceEl, s.estado, s.version, s.legacy_cuenta AS cuentaOriginal,
    s.precio_compra_centimos AS precioCompraCentimos, s.precio_venta_centimos AS precioVentaCentimos,
    b.ingresos_centimos AS ingresosHistoricosCentimos,
    b.costos_centimos AS costosHistoricosCentimos, b.renovaciones AS renovacionesHistoricas,
    b.estado_revision AS estadoRevision, h.json_original AS historialOriginal
    FROM suscripciones s JOIN plataformas p ON p.id = s.plataforma_id
    LEFT JOIN saldos_iniciales b ON b.suscripcion_id = s.id
    LEFT JOIN historial_legacy h ON h.suscripcion_id = s.id
    WHERE s.cliente_id = ? ORDER BY s.vence_el DESC`).bind(id).all();
  const movements = await env.DB.prepare(`SELECT m.id, m.suscripcion_id AS suscripcionId, m.tipo,
    m.fecha_cobro AS fechaCobro, m.ingresos_centimos AS ingresosCentimos,
    m.costos_centimos AS costosCentimos, m.vencimiento_nuevo AS vencimientoNuevo
    FROM movimientos m JOIN suscripciones s ON s.id = m.suscripcion_id
    WHERE s.cliente_id = ? ORDER BY m.fecha_cobro DESC, m.creado_en DESC LIMIT 100`).bind(id).all();
  return json({ ...client, suscripciones: subscriptions.results, movimientos: movements.results });
}

async function createClient(request, env, actor) {
  const body = await bodyOf(request);
  if (!body || !textField(body.nombre, 150) || !textField(body.plataformaId, 100)
    || !validDate(body.fechaInicio) || !validDate(body.venceEl)
    || !validCents(body.ingresosCentimos) || !validCents(body.costosCentimos)) {
    return error('Datos de cliente inválidos');
  }
  const phone = cleanPhone(body.telefono);
  if (body.telefono && !phone) return error('Teléfono inválido');
  const prefix = typeof body.prefijo === 'string' && /^\+\d{1,4}$/.test(body.prefijo)
    ? body.prefijo : '+51';
  const platform = await env.DB.prepare('SELECT id FROM plataformas WHERE id = ?').bind(body.plataformaId).first();
  if (!platform) return error('Plataforma no encontrada');
  if (body.cuentaId) {
    const account = await env.DB.prepare('SELECT plataforma_id FROM cuentas_servicio WHERE id = ?')
      .bind(body.cuentaId).first();
    if (!account || account.plataforma_id !== body.plataformaId) return error('Cuenta incompatible');
  }
  const clientId = uuid();
  const subscriptionId = uuid();
  const movementId = uuid();
  const operationKey = uuid();
  const pin = body.pin == null || body.pin === '' ? null : String(body.pin);
  if (pin && (pin.length > 50 || !/^\d+$/.test(pin))) return error('PIN inválido');
  const encryptedPin = pin ? await encryptSecret(pin, env) : null;
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO clientes (id, nombre, prefijo, telefono) VALUES (?, ?, ?, ?)')
        .bind(clientId, body.nombre.trim(), prefix, phone),
      env.DB.prepare(`INSERT INTO suscripciones
        (id, cliente_id, plataforma_id, cuenta_id, perfil, pin_ciphertext, pin_nonce,
         pin_clave_version, fecha_inicio, vence_el)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        subscriptionId, clientId, body.plataformaId, body.cuentaId || null,
        typeof body.perfil === 'string' ? body.perfil.trim().slice(0, 100) : null,
        encryptedPin?.ciphertext || null, encryptedPin?.nonce || null,
        encryptedPin?.keyVersion || null, body.fechaInicio, body.venceEl,
      ),
      env.DB.prepare(`INSERT INTO movimientos
        (id, suscripcion_id, tipo, operation_key, request_hash, expected_version, fecha_cobro,
         ingresos_centimos, costos_centimos, vencimiento_nuevo, creado_por)
        VALUES (?, ?, 'alta', ?, ?, 0, ?, ?, ?, ?, ?)`).bind(
        movementId, subscriptionId, operationKey, operationKey,
        body.fechaInicio, body.ingresosCentimos, body.costosCentimos, body.venceEl,
        actor.access_subject,
      ),
      env.DB.prepare('UPDATE suscripciones SET version = 1 WHERE id = ? AND version = 0')
        .bind(subscriptionId),
    ]);
    return json({ id: clientId, suscripcionId: subscriptionId }, 201);
  } catch {
    return error('No se pudo registrar el cliente', 409);
  }
}

async function hashBody(body) {
  const data = new TextEncoder().encode(JSON.stringify(body));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function renew(request, env, actor, subscriptionId) {
  const body = await bodyOf(request);
  const operationKey = request.headers.get('Idempotency-Key');
  if (!body || !operationKey || !/^[A-Za-z0-9_-]{16,100}$/.test(operationKey)
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0
    || !validDate(body.fechaCobro) || !validDate(body.venceEl)
    || !validCents(body.ingresosCentimos) || !validCents(body.costosCentimos)) {
    return error('Renovación inválida');
  }
  const canonical = {
    subscriptionId, expectedVersion: body.expectedVersion, fechaCobro: body.fechaCobro,
    venceEl: body.venceEl, ingresosCentimos: body.ingresosCentimos,
    costosCentimos: body.costosCentimos,
  };
  const requestHash = await hashBody(canonical);
  const existing = await env.DB.prepare('SELECT id, request_hash FROM movimientos WHERE operation_key = ?')
    .bind(operationKey).first();
  if (existing) {
    return existing.request_hash === requestHash
      ? json({ id: existing.id, repetida: true })
      : error('Clave de operación reutilizada con otros datos', 409);
  }
  const current = await env.DB.prepare('SELECT version, vence_el, estado FROM suscripciones WHERE id = ?')
    .bind(subscriptionId).first();
  if (!current) return error('Suscripción no encontrada', 404);
  if (current.estado !== 'activa') return error('Suscripción no activa', 409);
  if (current.version !== body.expectedVersion) return error('La suscripción cambió; actualiza la vista', 409);
  const movementId = uuid();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO movimientos
        (id, suscripcion_id, tipo, operation_key, request_hash, expected_version, fecha_cobro,
         ingresos_centimos, costos_centimos, vencimiento_anterior, vencimiento_nuevo, creado_por)
        VALUES (?, ?, 'renovacion', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        movementId, subscriptionId, operationKey, requestHash, body.expectedVersion,
        body.fechaCobro, body.ingresosCentimos, body.costosCentimos,
        current.vence_el, body.venceEl, actor.access_subject,
      ),
      env.DB.prepare(`UPDATE suscripciones SET vence_el = ?, version = version + 1
        WHERE id = ? AND version = ?`).bind(body.venceEl, subscriptionId, body.expectedVersion),
    ]);
    return json({ id: movementId, version: body.expectedVersion + 1 }, 201);
  } catch {
    const retry = await env.DB.prepare('SELECT id, request_hash FROM movimientos WHERE operation_key = ?')
      .bind(operationKey).first();
    if (retry?.request_hash === requestHash) return json({ id: retry.id, repetida: true });
    return error('Conflicto al renovar; actualiza la vista', 409);
  }
}

async function listAccounts(env) {
  const result = await env.DB.prepare(`SELECT a.id, a.plataforma_id AS plataformaId,
    p.nombre AS plataforma, a.identificador, a.estado, a.fecha_compra AS fechaCompra,
    a.vence_el AS venceEl, a.codigos_url AS codigosUrl, a.nota,
    COUNT(s.id) AS perfilesAsignados
    FROM cuentas_servicio a JOIN plataformas p ON p.id = a.plataforma_id
    LEFT JOIN suscripciones s ON s.cuenta_id = a.id
    GROUP BY a.id ORDER BY p.nombre, a.identificador`).all();
  return json({ items: result.results.map((row) => {
    const value = row.identificador;
    const at = value.indexOf('@');
    const masked = at > 0 ? `${value[0]}***${value.slice(at)}` : `${value.slice(0, 2)}***`;
    return { ...row, identificador: masked };
  }) });
}

function accountDetails(body, existing = false) {
  if ((body.codigosUrl != null && typeof body.codigosUrl !== 'string')
    || (body.nota != null && typeof body.nota !== 'string')) return null;
  const fechaCompra = body.fechaCompra || null;
  const venceEl = body.venceEl || null;
  const codigosUrl = body.codigosUrl?.trim() || null;
  const nota = body.nota?.trim() || null;
  if ((!existing && (!fechaCompra || !venceEl))
    || (fechaCompra && !validDate(fechaCompra)) || (venceEl && !validDate(venceEl))
    || (fechaCompra && venceEl && venceEl < fechaCompra)
    || (codigosUrl && (codigosUrl.length > 2048 || !/^https:\/\/[^\s/]+/i.test(codigosUrl)))
    || (nota && nota.length > 4000)
    || (body.codigoPassword && (typeof body.codigoPassword !== 'string' || body.codigoPassword.length > 500))) {
    return null;
  }
  return { fechaCompra, venceEl, codigosUrl, nota };
}

async function createAccount(request, env) {
  const body = await bodyOf(request);
  if (!body || !textField(body.plataformaId, 100) || !textField(body.identificador, 200)
    || !textField(body.contrasena, 500)) return error('Datos de cuenta inválidos');
  const details = accountDetails(body);
  if (!details) return error('Fechas o datos de cuenta inválidos');
  const id = uuid();
  const encrypted = await encryptSecret(body.contrasena, env);
  const codeSecret = body.codigoPassword ? await encryptSecret(body.codigoPassword, env) : null;
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO cuentas_servicio
        (id, plataforma_id, identificador, fecha_compra, vence_el, codigos_url, nota)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, body.plataformaId, body.identificador.trim(),
        details.fechaCompra, details.venceEl, details.codigosUrl, details.nota),
      env.DB.prepare(`INSERT INTO secretos_cuenta
        (cuenta_id, ciphertext, nonce, clave_version, codigo_password_ciphertext,
         codigo_password_nonce, codigo_password_clave_version)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, encrypted.ciphertext, encrypted.nonce,
        encrypted.keyVersion, codeSecret?.ciphertext || null, codeSecret?.nonce || null,
        codeSecret?.keyVersion || null),
    ]);
    return json({ id }, 201);
  } catch {
    return error('No se pudo registrar la cuenta', 409);
  }
}

async function updateAccount(request, env, accountId) {
  const body = await bodyOf(request);
  if (!body) return error('Datos de cuenta inválidos');
  const details = accountDetails(body, true);
  if (!details) return error('Fechas o datos de cuenta inválidos');
  const existing = await env.DB.prepare('SELECT id FROM cuentas_servicio WHERE id = ?').bind(accountId).first();
  if (!existing) return error('Cuenta no encontrada', 404);
  const codeSecret = body.codigoPassword ? await encryptSecret(body.codigoPassword, env) : null;
  const statements = [env.DB.prepare(`UPDATE cuentas_servicio
    SET fecha_compra = ?, vence_el = ?, codigos_url = ?, nota = ? WHERE id = ?`)
    .bind(details.fechaCompra, details.venceEl, details.codigosUrl, details.nota, accountId)];
  if (codeSecret) statements.push(env.DB.prepare(`UPDATE secretos_cuenta
    SET codigo_password_ciphertext = ?, codigo_password_nonce = ?,
      codigo_password_clave_version = ?, actualizado_en = datetime('now') WHERE cuenta_id = ?`)
    .bind(codeSecret.ciphertext, codeSecret.nonce, codeSecret.keyVersion, accountId));
  if (body.contrasena) {
    if (!textField(body.contrasena, 500)) return error('Contraseña inválida');
    const secret = await encryptSecret(body.contrasena, env);
    statements.push(env.DB.prepare(`UPDATE secretos_cuenta
      SET ciphertext = ?, nonce = ?, clave_version = ?, actualizado_en = datetime('now') WHERE cuenta_id = ?`)
      .bind(secret.ciphertext, secret.nonce, secret.keyVersion, accountId));
  }
  await env.DB.batch(statements);
  return json({ id: accountId });
}

async function revealAccount(accountId, env, actor) {
  const secret = await env.DB.prepare(`SELECT ciphertext, nonce,
    codigo_password_ciphertext, codigo_password_nonce FROM secretos_cuenta WHERE cuenta_id = ?`)
    .bind(accountId).first();
  if (!secret) return error('Credencial no encontrada', 404);
  try {
    const password = await decryptSecret(secret.ciphertext, secret.nonce, env);
    const codePassword = secret.codigo_password_ciphertext
      ? await decryptSecret(secret.codigo_password_ciphertext, secret.codigo_password_nonce, env) : null;
    await env.DB.prepare(`INSERT INTO auditoria (id, actor_subject, accion, objeto_tipo, objeto_id)
      VALUES (?, ?, 'revelar_credencial', 'cuenta', ?)`).bind(uuid(), actor.access_subject, accountId).run();
    return json({ contrasena: password, codigoPassword: codePassword });
  } catch {
    return error('No se pudo revelar la credencial', 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return error('Ruta no encontrada', 404);
    if (!['GET', 'POST', 'PATCH'].includes(request.method)) return error('Método no permitido', 405);
    if (request.method === 'POST' && url.pathname === '/api/login') return login(request, env);
    const actor = await authenticate(request, env);
    if (!actor) return error('Acceso no autorizado', 401);
    if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
      return error('Origen no permitido', 403);
    }

    try {
      if (request.method === 'POST' && url.pathname === '/api/logout') return logout();
      if (request.method === 'GET' && url.pathname === '/api/session') return json({ correo: actor.correo, rol: actor.rol });
      if (request.method === 'GET' && url.pathname === '/api/resumen') return summary(env);
      if (request.method === 'GET' && url.pathname === '/api/estadisticas') return analytics(env);
      if (request.method === 'GET' && url.pathname === '/api/configuracion') return getSettings(env);
      if (request.method === 'PATCH' && url.pathname === '/api/configuracion') {
        return mayManageAccounts(actor) ? saveSettings(request, env) : error('Sin permiso', 403);
      }
      if (request.method === 'GET' && url.pathname === '/api/proximos') return upcomingClients(env);
      if (request.method === 'GET' && url.pathname === '/api/clientes') return listClients(url, env);
      const client = url.pathname.match(/^\/api\/clientes\/([^/]+)$/);
      if (request.method === 'GET' && client) return getClient(client[1], env);
      if (request.method === 'POST' && url.pathname === '/api/clientes') return createClient(request, env, actor);
      if (request.method === 'GET' && url.pathname === '/api/plataformas') {
        const result = await env.DB.prepare('SELECT id, nombre FROM plataformas ORDER BY nombre').all();
        return json({ items: result.results });
      }
      if (request.method === 'POST' && url.pathname === '/api/plataformas') {
        return mayManageAccounts(actor) ? addPlatform(request, env) : error('Sin permiso', 403);
      }
      if (request.method === 'GET' && url.pathname === '/api/cuentas') return listAccounts(env);
      if (request.method === 'POST' && url.pathname === '/api/cuentas') {
        return mayManageAccounts(actor) ? createAccount(request, env) : error('Sin permiso', 403);
      }
      const account = url.pathname.match(/^\/api\/cuentas\/([^/]+)$/);
      if (request.method === 'PATCH' && account) {
        return mayManageAccounts(actor) ? updateAccount(request, env, account[1]) : error('Sin permiso', 403);
      }
      const reveal = url.pathname.match(/^\/api\/cuentas\/([^/]+)\/revelar$/);
      if (request.method === 'POST' && reveal) {
        return mayManageAccounts(actor) ? revealAccount(reveal[1], env, actor) : error('Sin permiso', 403);
      }
      const renewal = url.pathname.match(/^\/api\/suscripciones\/([^/]+)\/renovaciones$/);
      if (request.method === 'POST' && renewal) return renew(request, env, actor, renewal[1]);
      return error('Ruta no encontrada', 404);
    } catch {
      return error('Error interno', 500);
    }
  },
};
