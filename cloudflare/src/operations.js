import { addDays, limaToday, validCents, validDate, textField } from './validation.js';
import { changePassword, derivePassword, logout } from './auth.js';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => json({ error: message }, status);
const id = () => crypto.randomUUID();
const methods = ['Yape', 'Plin', 'Transferencia', 'Efectivo', 'Otro'];
const audit = (env, actor, action, object, detail = {}) => env.DB.prepare(
  'INSERT INTO auditoria(id,actor_subject,accion,objeto_tipo,objeto_id,detalle_json) VALUES(?,?,?,?,?,?)')
  .bind(id(), actor.access_subject, action, 'operacion', object, JSON.stringify(detail));
const encode = (bytes) => {
  let result = ''; for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
};

export async function operations(request, env, actor) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith('/api/operaciones/')) return null;
  if (actor.rol !== 'admin') return fail('Sin permiso', 403);
  let body = {};
  if (method !== 'GET') {
    try { const raw = await request.text(); if (raw.length > 30000) return fail('Solicitud demasiado grande'); body = JSON.parse(raw || '{}'); }
    catch { return fail('Solicitud inválida'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Solicitud inválida');
  }
  if (path === '/api/operaciones/vencimientos' && method === 'GET') {
    const today = limaToday(), end = addDays(today, 7);
    const results = await env.DB.batch([
      env.DB.prepare(`SELECT c.id,c.nombre,c.prefijo,c.telefono,s.id AS suscripcionId,s.vence_el AS venceEl,p.nombre AS plataforma
        FROM suscripciones s JOIN clientes c ON c.id=s.cliente_id JOIN plataformas p ON p.id=s.plataforma_id
        WHERE c.archivado_en IS NULL AND s.estado='activa' AND s.vence_el<=? ORDER BY s.vence_el,c.nombre`).bind(end),
      env.DB.prepare(`SELECT a.id,a.identificador,a.vence_el AS venceEl,p.nombre AS plataforma FROM cuentas_servicio a
        JOIN plataformas p ON p.id=a.plataforma_id WHERE a.estado='activa' AND (a.vence_el<=? OR a.vence_el IS NULL)
        ORDER BY a.vence_el`).bind(end),
    ]);
    return json({ fecha: today, clientes: results[0].results, cuentas: results[1].results });
  }
  if (path === '/api/operaciones/cupos' && method === 'GET') {
    const result = await env.DB.prepare(`SELECT a.id,a.identificador,p.nombre AS plataforma,a.capacidad,a.estado,
      (SELECT COUNT(*) FROM suscripciones WHERE cuenta_id=a.id) AS ocupados,
      EXISTS(SELECT 1 FROM secretos_cuenta WHERE cuenta_id=a.id) AS tieneCredencial
      FROM cuentas_servicio a JOIN plataformas p ON p.id=a.plataforma_id ORDER BY p.nombre,a.identificador`).all();
    const members = await env.DB.prepare(`SELECT s.cuenta_id AS cuentaId,s.cliente_id AS clienteId,c.nombre,s.perfil,
      s.vence_el AS venceEl,c.archivado_en AS archivadoEn FROM suscripciones s JOIN clientes c ON c.id=s.cliente_id
      WHERE s.cuenta_id IS NOT NULL ORDER BY c.nombre`).all();
    return json({ items: result.results.map((a) => ({ ...a, miembros: members.results.filter((s) => s.cuentaId === a.id) })) });
  }
  const capacity = path.match(/^\/api\/operaciones\/cupos\/([^/]+)$/);
  if (capacity && method === 'PATCH') {
    if (body.capacidad !== null && (!Number.isInteger(body.capacidad) || body.capacidad < 1 || body.capacidad > 1000)) return fail('Capacidad inválida');
    const existing = await env.DB.prepare('SELECT capacidad FROM cuentas_servicio WHERE id=?').bind(capacity[1]).first();
    if (!existing) return fail('Cuenta no encontrada', 404);
    try {
      await env.DB.batch([env.DB.prepare('UPDATE cuentas_servicio SET capacidad=? WHERE id=?').bind(body.capacidad, capacity[1]),
        audit(env, actor, 'cambiar_capacidad', capacity[1], { anterior: existing.capacidad, nueva: body.capacidad })]);
    } catch { return fail('La capacidad no puede ser menor que los perfiles asignados', 409); }
    return json({ ok: true });
  }
  if (path === '/api/operaciones/pagos' && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT d.*,c.nombre,p.nombre AS plataforma,
      COALESCE((SELECT SUM(importe_centimos) FROM abonos WHERE deuda_id=d.id),0) AS pagado
      FROM deudas d JOIN suscripciones s ON s.id=d.suscripcion_id JOIN clientes c ON c.id=s.cliente_id
      JOIN plataformas p ON p.id=s.plataforma_id ORDER BY d.creado_en DESC`).all();
    const payments = await env.DB.prepare('SELECT * FROM abonos ORDER BY fecha DESC').all();
    const subscriptions = await env.DB.prepare(`SELECT s.id,c.nombre,p.nombre AS plataforma FROM suscripciones s
      JOIN clientes c ON c.id=s.cliente_id JOIN plataformas p ON p.id=s.plataforma_id WHERE c.archivado_en IS NULL ORDER BY c.nombre`).all();
    return json({ items: rows.results, abonos: payments.results, suscripciones: subscriptions.results });
  }
  if (path === '/api/operaciones/pagos' && method === 'POST') {
    const operationKey = request.headers.get('Idempotency-Key');
    if (!operationKey || !/^[A-Za-z0-9_-]{16,100}$/.test(operationKey)) return fail('Falta identificador de operación');
    if (!textField(body.concepto, 200) || !textField(body.suscripcionId, 100)
      || !validCents(body.importeCentimos) || body.importeCentimos <= 0 || !validDate(body.fecha)) return fail('Datos de deuda inválidos');
    const previous = await env.DB.prepare('SELECT * FROM deudas WHERE operation_key=?').bind(operationKey).first();
    if (previous) return previous.suscripcion_id === body.suscripcionId && previous.concepto === body.concepto.trim()
      && previous.importe_centimos === body.importeCentimos && previous.fecha === body.fecha
      ? json({ id: previous.id, repetido: true }) : fail('Operación repetida con otros datos', 409);
    const subscription = await env.DB.prepare(`SELECT s.id FROM suscripciones s JOIN clientes c ON c.id=s.cliente_id
      WHERE s.id=? AND c.archivado_en IS NULL`).bind(body.suscripcionId).first();
    if (!subscription) return fail('Suscripción no disponible', 404);
    const debtId = id();
    await env.DB.batch([env.DB.prepare('INSERT INTO deudas(id,suscripcion_id,concepto,importe_centimos,fecha,operation_key) VALUES(?,?,?,?,?,?)')
      .bind(debtId, body.suscripcionId, body.concepto.trim(), body.importeCentimos, body.fecha, operationKey),
      audit(env, actor, 'registrar_deuda', debtId, body)]);
    return json({ id: debtId }, 201);
  }
  const payment = path.match(/^\/api\/operaciones\/pagos\/([^/]+)\/abonos$/);
  if (payment && method === 'POST') {
    const key = request.headers.get('Idempotency-Key');
    if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key) || !validCents(body.importeCentimos) || body.importeCentimos <= 0
      || !validDate(body.fecha) || !methods.includes(body.metodo)) return fail('Abono inválido');
    const previous = await env.DB.prepare('SELECT * FROM abonos WHERE operation_key=?').bind(key).first();
    if (previous) return previous.deuda_id === payment[1] && previous.importe_centimos === body.importeCentimos
      && previous.fecha === body.fecha && previous.metodo === body.metodo ? json({ ok: true, repetido: true }) : fail('Operación repetida con datos diferentes', 409);
    const debt = await env.DB.prepare(`SELECT d.*,s.version FROM deudas d JOIN suscripciones s ON s.id=d.suscripcion_id WHERE d.id=?`).bind(payment[1]).first();
    if (!debt) return fail('Deuda no encontrada', 404);
    const movementId = id();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO movimientos(id,suscripcion_id,tipo,operation_key,request_hash,expected_version,fecha_cobro,
          ingresos_centimos,costos_centimos,creado_por,metodo_pago) VALUES(?,?,'ajuste',?,?,?,?,?,0,?,?)`)
          .bind(movementId, debt.suscripcion_id, key, key, debt.version, body.fecha, body.importeCentimos, actor.access_subject, body.metodo),
        env.DB.prepare('INSERT INTO abonos(id,deuda_id,importe_centimos,fecha,metodo,operation_key,movimiento_id) VALUES(?,?,?,?,?,?,?)')
          .bind(id(), debt.id, body.importeCentimos, body.fecha, body.metodo, key, movementId),
        env.DB.prepare('UPDATE suscripciones SET version=version+1 WHERE id=?').bind(debt.suscripcion_id),
        audit(env, actor, 'registrar_abono', debt.id, body),
      ]);
    } catch { return fail('El abono supera la deuda o hubo otra modificación. Actualiza antes de reintentar.', 409); }
    return json({ ok: true });
  }
  if (path === '/api/operaciones/rentabilidad' && method === 'GET') {
    const month = url.searchParams.get('mes') || limaToday().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('Mes inválido');
    const result = await env.DB.prepare(`SELECT p.nombre,COALESCE(SUM(v.ingreso),0) AS ingresos,
      COALESCE(SUM(v.costo),0) AS costos,COUNT(v.plataforma_id) AS registros,
      SUM(CASE WHEN v.plataforma_id IS NOT NULL AND (v.ingreso IS NULL OR v.costo IS NULL) THEN 1 ELSE 0 END) AS incompletos
      FROM plataformas p LEFT JOIN (
        SELECT plataforma_id,precio_venta_centimos AS ingreso,precio_compra_centimos AS costo FROM suscripciones
          WHERE legacy_cliente_id IS NOT NULL AND substr(fecha_compra,1,7)=?
        UNION ALL SELECT s.plataforma_id,m.ingresos_centimos,m.costos_centimos FROM movimientos m
          JOIN suscripciones s ON s.id=m.suscripcion_id WHERE substr(m.fecha_cobro,1,7)=?
      ) v ON v.plataforma_id=p.id GROUP BY p.id ORDER BY (SUM(v.ingreso)-SUM(v.costo)) DESC`).bind(month, month).all();
    return json({ mes: month, items: result.results });
  }
  if (path === '/api/operaciones/revision' && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT b.*,s.cliente_id AS clienteId,c.nombre,p.nombre AS plataforma,s.version,
      s.precio_venta_centimos AS precioVenta,s.precio_compra_centimos AS precioCompra FROM saldos_iniciales b
      JOIN suscripciones s ON s.id=b.suscripcion_id JOIN clientes c ON c.id=s.cliente_id JOIN plataformas p ON p.id=s.plataforma_id
      WHERE b.estado_revision='pendiente' OR b.resolucion IS NOT NULL ORDER BY b.estado_revision,c.nombre`).all();
    const references = await env.DB.prepare(`SELECT s.id,s.cliente_id AS clienteId,c.nombre,p.nombre AS plataforma,s.legacy_cuenta
      FROM suscripciones s JOIN clientes c ON c.id=s.cliente_id JOIN plataformas p ON p.id=s.plataforma_id
      WHERE s.cuenta_id IS NULL AND s.legacy_cuenta IS NOT NULL AND trim(s.legacy_cuenta)<>''`).all();
    const missing = await env.DB.prepare(`SELECT a.id,a.identificador,p.nombre AS plataforma FROM cuentas_servicio a JOIN plataformas p ON p.id=a.plataforma_id
      WHERE NOT EXISTS(SELECT 1 FROM secretos_cuenta WHERE cuenta_id=a.id)`).all();
    return json({ saldos: rows.results, referencias: references.results, sinCredenciales: missing.results });
  }
  const reconcile = path.match(/^\/api\/operaciones\/revision\/([^/]+)$/);
  if (reconcile && method === 'PATCH') {
    if (!validCents(body.ingresos) || !validCents(body.costos) || !Number.isInteger(body.renovaciones) || body.renovaciones < 0
      || body.renovaciones > 100000 || !textField(body.evidencia, 2000)) return fail('Completa importes, renovaciones y evidencia');
    const old = await env.DB.prepare('SELECT * FROM saldos_iniciales WHERE suscripcion_id=?').bind(reconcile[1]).first();
    if (!old) return fail('Saldo no encontrado', 404);
    await env.DB.batch([env.DB.prepare(`UPDATE saldos_iniciales SET ingresos_centimos=?,costos_centimos=?,renovaciones=?,
      estado_revision='verificado',resolucion='manual',evidencia=? WHERE suscripcion_id=?`)
      .bind(body.ingresos, body.costos, body.renovaciones, body.evidencia, reconcile[1]),
      audit(env, actor, 'conciliar_saldo', reconcile[1], { anterior: old, nuevo: body })]);
    return json({ ok: true });
  }
  if (path === '/api/operaciones/password' && method === 'POST') return changePassword(request, env, body, actor);
  if (path === '/api/operaciones/cerrar-sesiones' && method === 'POST') {
    await env.DB.batch([env.DB.prepare('UPDATE seguridad_admin SET session_version=session_version+1 WHERE id=1'),
      audit(env, actor, 'cerrar_sesiones', 'admin')]);
    return logout();
  }
  if (path === '/api/operaciones/respaldo' && method === 'POST') {
    if (typeof body.passphrase !== 'string' || body.passphrase.length < 12 || body.passphrase.length > 200) return fail('Usa una clave de respaldo de 12 a 200 caracteres');
    const schema = await env.DB.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all();
    const tables = schema.results.filter((s) => s.type === 'table');
    const snapshots = await env.DB.batch(tables.map((t) => env.DB.prepare(`SELECT * FROM "${t.name.replaceAll('"', '""')}"`)));
    const payload = { schema: schema.results, tables: Object.fromEntries(tables.map((t, i) => [t.name, snapshots[i].results])),
      accountEncryptionKey: env.ACCOUNT_ENCRYPTION_KEY,
      adminPasswordHash: env.ADMIN_PASSWORD_HASH, adminEmail: env.AUTHORIZED_ADMIN_EMAIL,
      creadoEn: new Date().toISOString() };
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', await derivePassword(body.passphrase, salt), 'AES-GCM', false, ['encrypt']);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
    await audit(env, actor, 'descargar_respaldo', 'base').run();
    return json({ formato: 'dorostream-backup-v1', salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) });
  }
  return fail('Ruta no encontrada', 404);
}
