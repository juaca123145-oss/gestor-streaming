import { authenticate, login, logout, mayManageAccounts } from './auth.js';
import { encryptSecret, decryptSecret } from './crypto.js';
import { addDays, limaToday, textField, validCents, validDate, normalizePhone } from './validation.js';
import { operations } from './operations.js';

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
    env.DB.prepare('SELECT COUNT(*) AS total FROM clientes WHERE archivado_en IS NULL'),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN estado = 'activa' AND vence_el >= ? THEN 1 ELSE 0 END) AS activas,
      SUM(CASE WHEN estado = 'activa' AND vence_el BETWEEN ? AND ? THEN 1 ELSE 0 END) AS proximas,
      SUM(CASE WHEN estado = 'activa' AND vence_el < ? THEN 1 ELSE 0 END) AS vencidas
      FROM suscripciones s JOIN clientes c ON c.id = s.cliente_id
      WHERE c.archivado_en IS NULL`).bind(today, today, week, today),
    env.DB.prepare(`SELECT COALESCE(SUM(ingresos_centimos - costos_centimos), 0) AS margen_centimos
      FROM movimientos WHERE fecha_cobro >= ? AND fecha_cobro < ?`).bind(monthStart, nextMonth),
    env.DB.prepare(`SELECT COUNT(*) AS ventas, COALESCE(SUM(precio_venta_centimos - precio_compra_centimos), 0) AS margen_centimos,
      SUM(CASE WHEN precio_venta_centimos IS NULL OR precio_compra_centimos IS NULL THEN 1 ELSE 0 END) AS sin_importe
      FROM suscripciones WHERE legacy_cliente_id IS NOT NULL AND fecha_compra >= ? AND fecha_compra < ?`)
      .bind(monthStart, nextMonth),
    env.DB.prepare(`SELECT
      (SELECT COALESCE(SUM(ingresos_centimos - costos_centimos), 0) FROM saldos_iniciales
        WHERE estado_revision = 'verificado' AND COALESCE(resolucion,'') <> 'base_legacy' AND ingresos_centimos IS NOT NULL AND costos_centimos IS NOT NULL)
      + (SELECT COALESCE(SUM(ingresos_centimos - costos_centimos), 0) FROM movimientos) AS margen_centimos,
      (SELECT COUNT(*) FROM saldos_iniciales WHERE estado_revision = 'pendiente') AS pendientes,
      (SELECT COALESCE(SUM(ingresos_centimos-costos_centimos),0) FROM saldos_iniciales WHERE resolucion='base_legacy') AS reconstruido`),
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
    margenReconstruidoCentimos: historical.results[0].reconstruido,
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
  const archived = url.searchParams.get('archivados') === '1';
  const needle = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  const condition = `WHERE c.archivado_en IS ${archived ? 'NOT ' : ''}NULL`
    + (search ? ` AND (c.nombre LIKE ? ESCAPE '\\' OR c.telefono LIKE ? ESCAPE '\\')` : '');
  const params = search ? [needle, needle] : [];
  const base = `FROM clientes c LEFT JOIN suscripciones s ON s.id = (
    SELECT id FROM suscripciones WHERE cliente_id = c.id ORDER BY vence_el DESC, id DESC LIMIT 1
  ) LEFT JOIN plataformas p ON p.id = s.plataforma_id ${condition}`;
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(`SELECT c.id, c.nombre, c.prefijo, c.telefono, c.archivado_en AS archivadoEn, s.id AS suscripcionId,
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
    WHERE s.estado = 'activa' AND c.archivado_en IS NULL AND s.vence_el >= ?
    ORDER BY s.vence_el ASC, c.nombre COLLATE NOCASE ASC LIMIT 6`).bind(limaToday()).all();
  return json({ items: result.results });
}

async function getClient(id, env) {
  const client = await env.DB.prepare('SELECT id, nombre, prefijo, telefono, archivado_en AS archivadoEn FROM clientes WHERE id = ?')
    .bind(id).first();
  if (!client) return error('Cliente no encontrado', 404);
  const subscriptions = await env.DB.prepare(`SELECT s.id, s.plataforma_id AS plataformaId,
    p.nombre AS plataforma, s.cuenta_id AS cuentaId, s.perfil, s.fecha_inicio AS fechaInicio,
    s.vence_el AS venceEl, s.estado, s.version, s.legacy_cuenta AS cuentaOriginal,
    s.precio_compra_centimos AS precioCompraCentimos, s.precio_venta_centimos AS precioVentaCentimos,
    b.ingresos_centimos AS ingresosHistoricosCentimos,
    b.costos_centimos AS costosHistoricosCentimos, b.renovaciones AS renovacionesHistoricas,
    b.estado_revision AS estadoRevision, b.resolucion, b.evidencia, h.json_original AS historialOriginal
    FROM suscripciones s JOIN plataformas p ON p.id = s.plataforma_id
    LEFT JOIN saldos_iniciales b ON b.suscripcion_id = s.id
    LEFT JOIN historial_legacy h ON h.suscripcion_id = s.id
    WHERE s.cliente_id = ? ORDER BY s.vence_el DESC`).bind(id).all();
  const movements = await env.DB.prepare(`SELECT m.id, m.suscripcion_id AS suscripcionId, m.tipo,
    m.fecha_cobro AS fechaCobro, m.ingresos_centimos AS ingresosCentimos,
    m.costos_centimos AS costosCentimos, m.vencimiento_nuevo AS vencimientoNuevo, m.metodo_pago AS metodoPago
    FROM movimientos m JOIN suscripciones s ON s.id = m.suscripcion_id
    WHERE s.cliente_id = ? ORDER BY m.fecha_cobro DESC, m.creado_en DESC LIMIT 100`).bind(id).all();
  return json({ ...client, suscripciones: subscriptions.results, movimientos: movements.results });
}

async function editClient(request, env, actor, clientId) {
  const body = await bodyOf(request);
  if (!body || !textField(body.nombre, 150) || !/^\+\d{1,4}$/.test(body.prefijo)
    || !textField(body.suscripcionId, 100) || !textField(body.plataformaId, 100)
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0
    || !validDate(body.venceEl) || (body.fechaInicio && !validDate(body.fechaInicio))
    || (body.cuentaId != null && (typeof body.cuentaId !== 'string' || body.cuentaId.length > 100))
    || (body.quitarPin != null && typeof body.quitarPin !== 'boolean')
    || (body.perfil != null && (typeof body.perfil !== 'string' || body.perfil.length > 100))
    || (body.pin != null && (typeof body.pin !== 'string' || (body.pin && !/^\d{1,50}$/.test(body.pin))))
    || (body.quitarPin && body.pin)) return error('Datos de cliente inválidos');
  const contact = normalizePhone(body.telefono, body.prefijo);
  if (!contact) return error('Teléfono inválido. Usa números y espacios; el prefijo debe coincidir con el país seleccionado.');
  const phone = contact.telefono;
  const current = await env.DB.prepare(`SELECT c.nombre, c.prefijo, c.telefono, c.archivado_en,
    s.id AS suscripcion_id, s.version, s.plataforma_id, s.cuenta_id, s.perfil,
    s.fecha_inicio, s.vence_el, s.pin_ciphertext, s.pin_nonce, s.pin_clave_version
    FROM clientes c JOIN suscripciones s ON s.cliente_id = c.id
    WHERE c.id = ? AND s.id = ?`).bind(clientId, body.suscripcionId).first();
  if (!current) return error('Cliente o suscripción no encontrados', 404);
  if (current.archivado_en) return error('Restaura el cliente antes de editar', 409);
  if (current.version !== body.expectedVersion) return error('La suscripción cambió; actualiza la vista', 409);
  const platform = await env.DB.prepare('SELECT id FROM plataformas WHERE id = ?').bind(body.plataformaId).first();
  if (!platform) return error('Plataforma no encontrada', 404);
  if (body.cuentaId) {
    const account = await env.DB.prepare('SELECT plataforma_id, estado FROM cuentas_servicio WHERE id = ?').bind(body.cuentaId).first();
    if (!account || account.plataforma_id !== body.plataformaId || account.estado !== 'activa') return error('Cuenta incompatible o retirada', 409);
  }
  const secret = body.pin ? await encryptSecret(body.pin, env) : null;
  const clearPin = body.quitarPin === true;
  const prior = { nombre: current.nombre, prefijo: current.prefijo, telefono: current.telefono,
    plataformaId: current.plataforma_id, cuentaId: current.cuenta_id, perfil: current.perfil,
    fechaInicio: current.fecha_inicio, venceEl: current.vence_el };
  const next = { nombre: body.nombre.trim(), prefijo: contact.prefijo, telefono: phone,
    plataformaId: body.plataformaId, cuentaId: body.cuentaId || null,
    perfil: body.perfil?.trim() || null, fechaInicio: body.fechaInicio || null, venceEl: body.venceEl };
  const detail = JSON.stringify({ suscripcionId: body.suscripcionId, expectedVersion: body.expectedVersion,
    anterior: prior, nuevo: next, pinModificado: !!secret || clearPin });
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO auditoria (id, actor_subject, accion, objeto_tipo, objeto_id, detalle_json)
        VALUES (?, ?, 'editar_cliente', 'cliente', ?, ?)`).bind(uuid(), actor.access_subject, clientId, detail),
      env.DB.prepare(`UPDATE clientes SET nombre = ?, prefijo = ?, telefono = ?, actualizado_en = datetime('now') WHERE id = ?`)
        .bind(next.nombre, next.prefijo, next.telefono, clientId),
      env.DB.prepare(`UPDATE suscripciones SET plataforma_id = ?, cuenta_id = ?, perfil = ?,
        fecha_inicio = ?, vence_el = ?, pin_ciphertext = ?, pin_nonce = ?, pin_clave_version = ?,
        version = version + 1 WHERE id = ? AND version = ?`).bind(
        next.plataformaId, next.cuentaId, next.perfil, next.fechaInicio, next.venceEl,
        secret?.ciphertext || (clearPin ? null : current.pin_ciphertext),
        secret?.nonce || (clearPin ? null : current.pin_nonce),
        secret?.keyVersion || (clearPin ? null : current.pin_clave_version),
        body.suscripcionId, body.expectedVersion),
    ]);
    return json({ id: clientId, version: body.expectedVersion + 1 });
  } catch {
    return error('La suscripción cambió o no se pudo guardar; actualiza la vista', 409);
  }
}

async function setClientArchived(env, actor, clientId, archived) {
  const existing = await env.DB.prepare('SELECT archivado_en FROM clientes WHERE id = ?').bind(clientId).first();
  if (!existing) return error('Cliente no encontrado', 404);
  if (Boolean(existing.archivado_en) === archived) return json({ id: clientId, sinCambios: true });
  await env.DB.batch([
    env.DB.prepare(`UPDATE clientes SET archivado_en = ${archived ? "datetime('now')" : 'NULL'},
      actualizado_en = datetime('now') WHERE id = ?`).bind(clientId),
    env.DB.prepare(`INSERT INTO auditoria (id, actor_subject, accion, objeto_tipo, objeto_id)
      VALUES (?, ?, ?, 'cliente', ?)`).bind(uuid(), actor.access_subject,
      archived ? 'retirar_cliente' : 'restaurar_cliente', clientId),
  ]);
  return json({ id: clientId, archivado: archived });
}

async function createClient(request, env, actor) {
  const body = await bodyOf(request);
  if (!body || !textField(body.nombre, 150) || !textField(body.plataformaId, 100)
    || !validDate(body.fechaInicio) || !validDate(body.venceEl)
    || !validCents(body.ingresosCentimos) || !validCents(body.costosCentimos)) {
    return error('Datos de cliente inválidos');
  }
  if (body.metodoPago != null && !['Yape','Plin','Transferencia','Efectivo','Otro'].includes(body.metodoPago)) return error('Método de pago inválido');
  const contact = normalizePhone(body.telefono, body.prefijo || '+51');
  if (!contact) return error('Teléfono inválido. Usa números y espacios; el prefijo debe coincidir con el país seleccionado.');
  const phone = contact.telefono;
  const prefix = contact.prefijo;
  const platform = await env.DB.prepare('SELECT id FROM plataformas WHERE id = ?').bind(body.plataformaId).first();
  if (!platform) return error('Plataforma no encontrada');
  if (body.cuentaId) {
    const account = await env.DB.prepare('SELECT plataforma_id, estado FROM cuentas_servicio WHERE id = ?')
      .bind(body.cuentaId).first();
    if (!account || account.plataforma_id !== body.plataformaId || account.estado !== 'activa') return error('Cuenta incompatible o retirada');
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
         ingresos_centimos, costos_centimos, vencimiento_nuevo, creado_por, metodo_pago)
        VALUES (?, ?, 'alta', ?, ?, 0, ?, ?, ?, ?, ?, ?)`).bind(
        movementId, subscriptionId, operationKey, operationKey,
        body.fechaInicio, body.pendiente === true ? 0 : body.ingresosCentimos, body.costosCentimos, body.venceEl,
        actor.access_subject, body.pendiente === true ? null : body.metodoPago || null,
      ),
      env.DB.prepare('UPDATE suscripciones SET version = 1 WHERE id = ? AND version = 0')
        .bind(subscriptionId),
      ...pendingDebt(env, body, subscriptionId, body.fechaInicio, 'Alta pendiente'),
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

function pendingDebt(env, body, subscriptionId, date, concept) {
  return body.pendiente === true && body.ingresosCentimos > 0
    ? [env.DB.prepare('INSERT INTO deudas(id,suscripcion_id,concepto,importe_centimos,fecha) VALUES(?,?,?,?,?)')
      .bind(uuid(), subscriptionId, concept, body.ingresosCentimos, date)] : [];
}

async function renew(request, env, actor, subscriptionId) {
  const body = await bodyOf(request);
  if (body?.metodoPago != null && !['Yape','Plin','Transferencia','Efectivo','Otro'].includes(body.metodoPago)) return error('Método de pago inválido');
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
    costosCentimos: body.costosCentimos, pendiente: body.pendiente === true, metodoPago: body.metodoPago || null,
  };
  const requestHash = await hashBody(canonical);
  const existing = await env.DB.prepare('SELECT id, request_hash FROM movimientos WHERE operation_key = ?')
    .bind(operationKey).first();
  if (existing) {
    return existing.request_hash === requestHash
      ? json({ id: existing.id, repetida: true })
      : error('Clave de operación reutilizada con otros datos', 409);
  }
  const current = await env.DB.prepare(`SELECT s.version, s.vence_el, s.estado, c.archivado_en AS archivado_en
    FROM suscripciones s JOIN clientes c ON c.id = s.cliente_id WHERE s.id = ?`)
    .bind(subscriptionId).first();
  if (!current) return error('Suscripción no encontrada', 404);
  if (current.archivado_en) return error('Restaura el cliente antes de renovar', 409);
  if (current.estado !== 'activa') return error('Suscripción no activa', 409);
  if (current.version !== body.expectedVersion) return error('La suscripción cambió; actualiza la vista', 409);
  const movementId = uuid();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO movimientos
        (id, suscripcion_id, tipo, operation_key, request_hash, expected_version, fecha_cobro,
         ingresos_centimos, costos_centimos, vencimiento_anterior, vencimiento_nuevo, creado_por, metodo_pago)
        VALUES (?, ?, 'renovacion', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        movementId, subscriptionId, operationKey, requestHash, body.expectedVersion,
        body.fechaCobro, body.pendiente === true ? 0 : body.ingresosCentimos, body.costosCentimos,
        current.vence_el, body.venceEl, actor.access_subject, body.pendiente === true ? null : body.metodoPago || null,
      ),
      env.DB.prepare(`UPDATE suscripciones SET vence_el = ?, version = version + 1
        WHERE id = ? AND version = ?`).bind(body.venceEl, subscriptionId, body.expectedVersion),
      ...pendingDebt(env, body, subscriptionId, body.fechaCobro, 'Renovación pendiente'),
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
    a.vence_el AS venceEl, a.codigos_url AS codigosUrl, a.nota, a.capacidad,
    EXISTS(SELECT 1 FROM secretos_cuenta WHERE cuenta_id=a.id) AS tieneCredencial,
    COUNT(s.id) AS perfilesAsignados
    FROM cuentas_servicio a JOIN plataformas p ON p.id = a.plataforma_id
    LEFT JOIN suscripciones s ON s.cuenta_id = a.id
    GROUP BY a.id ORDER BY p.nombre, a.identificador`).all();
  return json({ items: result.results });
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
  if (body.contrasena) {
    if (!textField(body.contrasena, 500)) return error('Contraseña inválida');
    const secret = await encryptSecret(body.contrasena, env);
    statements.push(env.DB.prepare(`INSERT INTO secretos_cuenta(cuenta_id,ciphertext,nonce,clave_version)
      VALUES(?,?,?,?) ON CONFLICT(cuenta_id) DO UPDATE SET ciphertext=excluded.ciphertext,
      nonce=excluded.nonce,clave_version=excluded.clave_version,actualizado_en=datetime('now')`)
      .bind(accountId, secret.ciphertext, secret.nonce, secret.keyVersion));
  }
  if (codeSecret) statements.push(env.DB.prepare(`UPDATE secretos_cuenta
    SET codigo_password_ciphertext = ?, codigo_password_nonce = ?,
      codigo_password_clave_version = ?, actualizado_en = datetime('now') WHERE cuenta_id = ?`)
    .bind(codeSecret.ciphertext, codeSecret.nonce, codeSecret.keyVersion, accountId));
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

async function setAccountRetired(env, actor, accountId, retired) {
  const existing = await env.DB.prepare('SELECT estado FROM cuentas_servicio WHERE id = ?').bind(accountId).first();
  if (!existing) return error('Cuenta no encontrada', 404);
  if ((existing.estado === 'retirada') === retired) return json({ id: accountId, sinCambios: true });
  if (retired) {
    const assigned = await env.DB.prepare('SELECT COUNT(*) AS total FROM suscripciones WHERE cuenta_id = ?')
      .bind(accountId).first();
    if (assigned.total) return error(`Desasigna primero los ${assigned.total} perfiles de esta cuenta`, 409);
  }
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE cuentas_servicio SET estado = ? WHERE id = ?').bind(retired ? 'retirada' : 'activa', accountId),
      env.DB.prepare(`INSERT INTO auditoria (id, actor_subject, accion, objeto_tipo, objeto_id)
        VALUES (?, ?, ?, 'cuenta', ?)`).bind(uuid(), actor.access_subject,
        retired ? 'retirar_cuenta' : 'restaurar_cuenta', accountId),
    ]);
    return json({ id: accountId, retirada: retired });
  } catch {
    return error('No se pudo cambiar el estado de la cuenta', 409);
  }
}

async function prepareDelivery(env, actor, subscriptionId) {
  const record = await env.DB.prepare(`SELECT c.id AS cliente_id, c.nombre, c.prefijo, c.telefono,
    c.archivado_en, s.id AS suscripcion_id, s.estado AS suscripcion_estado,
    s.perfil, s.fecha_inicio, s.vence_el,
    p.nombre AS plataforma, a.id AS cuenta_id, a.identificador, a.estado AS cuenta_estado,
    a.codigos_url, x.ciphertext, x.nonce, x.codigo_password_ciphertext, x.codigo_password_nonce,
    s.pin_ciphertext, s.pin_nonce
    FROM suscripciones s JOIN clientes c ON c.id = s.cliente_id
    JOIN plataformas p ON p.id = s.plataforma_id
    LEFT JOIN cuentas_servicio a ON a.id = s.cuenta_id
    LEFT JOIN secretos_cuenta x ON x.cuenta_id = a.id
    WHERE s.id = ?`).bind(subscriptionId).first();
  if (!record) return error('Suscripción no encontrada', 404);
  if (record.archivado_en) return error('Restaura el cliente antes de preparar el mensaje', 409);
  if (record.suscripcion_estado !== 'activa') return error('La suscripción no está activa', 409);
  if (!record.cuenta_id || record.cuenta_estado !== 'activa' || !record.ciphertext) {
    return error('Vincula una cuenta activa antes de enviar credenciales', 409);
  }
  const phone = `${record.prefijo || '+51'}${record.telefono || ''}`.replace(/\D/g, '');
  if (phone.length < 8 || phone.length > 20) return error('El cliente necesita un teléfono válido', 409);
  let password;
  let pin;
  let codePassword;
  try {
    password = await decryptSecret(record.ciphertext, record.nonce, env);
    pin = record.pin_ciphertext ? await decryptSecret(record.pin_ciphertext, record.pin_nonce, env) : null;
    codePassword = record.codigo_password_ciphertext
      ? await decryptSecret(record.codigo_password_ciphertext, record.codigo_password_nonce, env) : null;
  } catch { return error('No se pudieron leer las credenciales', 500); }
  const configRows = await env.DB.prepare(`SELECT clave, valor FROM configuracion
    WHERE clave IN ('condiciones_plataformas', 'proveedor_nombre', 'proveedor_telefono')`).all();
  const config = Object.fromEntries(configRows.results.map((row) => [row.clave, row.valor]));
  let conditions = {};
  try { conditions = JSON.parse(config.condiciones_plataformas || '{}'); } catch { /* Mensaje sin condiciones. */ }
  const days = Math.round((Date.parse(`${record.vence_el}T00:00:00Z`) - Date.parse(`${limaToday()}T00:00:00Z`)) / 86_400_000);
  const remaining = days >= 0 ? `${days} días restantes` : `vencido hace ${-days} días`;
  const lines = [`*${record.plataforma}* 📌`, `Correo: ${record.identificador}`,
    `Contraseña: ${password}`, `Perfil/usuario: ${record.perfil || record.nombre}`];
  if (pin) lines.push(`PIN: ${pin}`);
  lines.push(`⏳ Contratado: ${remaining}`, `🗓 Compra: ${record.fecha_inicio || 'Sin fecha'}`,
    `🗓 Vencimiento: ${record.vence_el}`);
  if (record.codigos_url) lines.push(`Web de códigos: ${record.codigos_url}`);
  if (codePassword) lines.push(`Contraseña web de códigos: ${codePassword}`);
  if (conditions && typeof conditions[record.plataforma] === 'string' && conditions[record.plataforma].trim()) {
    lines.push('', `⚠️ *Condiciones de uso:*`, conditions[record.plataforma].trim());
  }
  if (config.proveedor_nombre) lines.push('', `👤 Proveedor: ${config.proveedor_nombre}`);
  if (config.proveedor_telefono) lines.push(`📞 Teléfono: ${config.proveedor_telefono}`);
  lines.push('', '¡Muchas gracias por tu compra!');
  await env.DB.prepare(`INSERT INTO auditoria (id, actor_subject, accion, objeto_tipo, objeto_id, detalle_json)
    VALUES (?, ?, 'preparar_mensaje_entrega', 'suscripcion', ?, ?)`)
    .bind(uuid(), actor.access_subject, subscriptionId,
      JSON.stringify({ clienteId: record.cliente_id, cuentaId: record.cuenta_id })).run();
  return json({ telefono: phone, mensaje: lines.join('\n') });
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
      const operational = await operations(request, env, actor);
      if (operational) return operational;
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
      if (request.method === 'PATCH' && client) {
        return mayManageAccounts(actor) ? editClient(request, env, actor, client[1]) : error('Sin permiso', 403);
      }
      const clientLifecycle = url.pathname.match(/^\/api\/clientes\/([^/]+)\/(archivar|restaurar)$/);
      if (request.method === 'POST' && clientLifecycle) {
        return mayManageAccounts(actor)
          ? setClientArchived(env, actor, clientLifecycle[1], clientLifecycle[2] === 'archivar')
          : error('Sin permiso', 403);
      }
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
      const accountLifecycle = url.pathname.match(/^\/api\/cuentas\/([^/]+)\/(retirar|restaurar)$/);
      if (request.method === 'POST' && accountLifecycle) {
        return mayManageAccounts(actor)
          ? setAccountRetired(env, actor, accountLifecycle[1], accountLifecycle[2] === 'retirar')
          : error('Sin permiso', 403);
      }
      const reveal = url.pathname.match(/^\/api\/cuentas\/([^/]+)\/revelar$/);
      if (request.method === 'POST' && reveal) {
        return mayManageAccounts(actor) ? revealAccount(reveal[1], env, actor) : error('Sin permiso', 403);
      }
      const renewal = url.pathname.match(/^\/api\/suscripciones\/([^/]+)\/renovaciones$/);
      if (request.method === 'POST' && renewal) return renew(request, env, actor, renewal[1]);
      const delivery = url.pathname.match(/^\/api\/suscripciones\/([^/]+)\/entrega$/);
      if (request.method === 'POST' && delivery) {
        return mayManageAccounts(actor) ? prepareDelivery(env, actor, delivery[1]) : error('Sin permiso', 403);
      }
      return error('Ruta no encontrada', 404);
    } catch {
      return error('Error interno', 500);
    }
  },
};
