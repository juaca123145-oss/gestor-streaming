// Local-only demonstration data. Never imported into D1 or the legacy app.
const today = new Date();
const date = (offset) => {
  const value = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  return value.toISOString().slice(0, 10);
};

const platforms = [
  { id: 'netflix', nombre: 'Netflix' },
  { id: 'spotify', nombre: 'Spotify' },
  { id: 'disney', nombre: 'Disney+' },
  { id: 'max', nombre: 'Max' },
];
const settings = { moneda: 'S/.', prefijoDefecto: '+51', proveedorNombre: 'Proveedor de ejemplo',
  proveedorTelefono: '+51 900 000 000', condiciones: { Netflix: 'Usar solo el perfil asignado.' } };

const accounts = [
  { id: 'cuenta-1', plataformaId: 'netflix', plataforma: 'Netflix', identificador: 'n***@ejemplo.test', estado: 'activa', perfilesAsignados: 2, password: 'CLAVE-DEMO-1', fechaCompra: date(-22), venceEl: date(8), codigosUrl: 'https://example.com/', codigoPassword: 'CODIGO-DEMO', nota: 'Cuenta de ejemplo' },
  { id: 'cuenta-2', plataformaId: 'spotify', plataforma: 'Spotify', identificador: 's***@ejemplo.test', estado: 'activa', perfilesAsignados: 1, password: 'CLAVE-DEMO-2', fechaCompra: date(-30), venceEl: date(0), codigosUrl: null, codigoPassword: null, nota: null },
  { id: 'cuenta-3', plataformaId: 'disney', plataforma: 'Disney+', identificador: 'd***@ejemplo.test', estado: 'activa', perfilesAsignados: 1, password: 'CLAVE-DEMO-3', fechaCompra: null, venceEl: null, codigosUrl: null, codigoPassword: null, nota: null },
];

const clients = [
  { id: 'demo-1', nombre: 'Ana Morales', prefijo: '+51', telefono: '900000001', plataformaId: 'netflix', plataforma: 'Netflix', cuentaId: 'cuenta-1', cuentaOriginal: 'ana@ejemplo.test', fechaInicio: date(-30), venceEl: date(0), estado: 'activa', version: 1, suscripcionId: 'sub-1', perfil: 'Principal', archivadoEn: null },
  { id: 'demo-2', nombre: 'Carlos Rojas', prefijo: '+51', telefono: '900000002', plataformaId: 'spotify', plataforma: 'Spotify', cuentaId: 'cuenta-2', fechaInicio: date(-29), venceEl: date(1), estado: 'activa', version: 1, suscripcionId: 'sub-2', perfil: 'Individual', archivadoEn: null },
  { id: 'demo-3', nombre: 'Lucía Vega', prefijo: '+51', telefono: '900000003', plataformaId: 'disney', plataforma: 'Disney+', cuentaId: 'cuenta-3', fechaInicio: date(-27), venceEl: date(3), estado: 'activa', version: 1, suscripcionId: 'sub-3', perfil: 'Perfil 2', archivadoEn: null },
  { id: 'demo-4', nombre: 'Jorge Pérez', prefijo: '+51', telefono: '900000004', plataformaId: 'max', plataforma: 'Max', cuentaId: null, fechaInicio: date(-32), venceEl: date(-2), estado: 'activa', version: 1, suscripcionId: 'sub-4', perfil: 'Familiar', archivadoEn: null },
  { id: 'demo-5', nombre: 'María Torres', prefijo: '+51', telefono: '900000005', plataformaId: 'netflix', plataforma: 'Netflix', cuentaId: 'cuenta-1', fechaInicio: date(-10), venceEl: date(20), estado: 'activa', version: 1, suscripcionId: 'sub-5', perfil: 'Perfil 3', archivadoEn: null },
];

const movements = [
  { id: 'mov-1', suscripcionId: 'sub-1', tipo: 'alta', fechaCobro: date(-28), ingresosCentimos: 2500, costosCentimos: 1200, vencimientoNuevo: date(0) },
  { id: 'mov-2', suscripcionId: 'sub-2', tipo: 'renovacion', fechaCobro: date(0), ingresosCentimos: 1800, costosCentimos: 850, vencimientoNuevo: date(1) },
];

const clone = (value) => structuredClone(value);
const demoDebts = [], demoPayments = [];

export async function demoApi(path, options = {}) {
  const url = new URL(path, 'http://demo.local');
  const method = options.method || 'GET';

  if (url.pathname.startsWith('/operaciones/')) {
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.pathname === '/operaciones/vencimientos') return { fecha: date(0),
      clientes: clone(clients.filter((c) => !c.archivadoEn && c.venceEl <= date(7))),
      cuentas: clone(accounts.filter((a) => a.estado === 'activa' && (!a.venceEl || a.venceEl <= date(7)))) };
    if (url.pathname === '/operaciones/cupos') return { items: accounts.map((a) => ({ ...a,
      capacidad: a.capacidad ?? null, ocupados: clients.filter((c) => c.cuentaId === a.id).length,
      tieneCredencial: !!a.password, miembros: clients.filter((c) => c.cuentaId === a.id).map((c) => ({ ...c, clienteId: c.id })) })) };
    if (url.pathname.startsWith('/operaciones/cupos/')) {
      const a = accounts.find((a) => a.id === url.pathname.split('/').at(-1));
      if (!a) throw new Error('Cuenta no encontrada');
      if (body.capacidad !== null && body.capacidad < clients.filter((c) => c.cuentaId === a.id).length) throw new Error('La capacidad no puede ser menor que las asignaciones');
      a.capacidad = body.capacidad; return { ok: true };
    }
    if (url.pathname === '/operaciones/pagos' && method === 'GET') return { items: demoDebts.map((d) => ({ ...d,
      pagado: demoPayments.filter((a) => a.deuda_id === d.id).reduce((sum, a) => sum + a.importe_centimos, 0) })),
      abonos: clone(demoPayments), suscripciones: clients.filter((c) => !c.archivadoEn).map((c) => ({ id: c.suscripcionId, nombre: c.nombre, plataforma: c.plataforma })) };
    if (url.pathname === '/operaciones/pagos' && method === 'POST') {
      const c = clients.find((c) => c.suscripcionId === body.suscripcionId);
      if (!c || !Number.isInteger(body.importeCentimos) || body.importeCentimos <= 0) throw new Error('Deuda inválida');
      demoDebts.push({ id: crypto.randomUUID(), suscripcion_id: c.suscripcionId, nombre: c.nombre, plataforma: c.plataforma,
        concepto: body.concepto, importe_centimos: body.importeCentimos, fecha: body.fecha }); return { ok: true };
    }
    if (url.pathname.endsWith('/abonos')) {
      const d = demoDebts.find((d) => d.id === url.pathname.split('/').at(-2));
      const paid = demoPayments.filter((a) => a.deuda_id === d?.id).reduce((sum, a) => sum + a.importe_centimos, 0);
      if (!d || body.importeCentimos <= 0 || body.importeCentimos + paid > d.importe_centimos) throw new Error('Abono inválido o superior a la deuda');
      demoPayments.push({ id: crypto.randomUUID(), deuda_id: d.id, importe_centimos: body.importeCentimos, fecha: body.fecha, metodo: body.metodo });
      movements.push({ id: crypto.randomUUID(), suscripcionId: d.suscripcion_id, tipo: 'ajuste', ingresosCentimos: body.importeCentimos, costosCentimos: 0, fechaCobro: body.fecha }); return { ok: true };
    }
    if (url.pathname === '/operaciones/rentabilidad') return { mes: url.searchParams.get('mes'), items: platforms.map((p) => {
      const rows = movements.filter((m) => m.fechaCobro.startsWith(url.searchParams.get('mes')) && clients.some((c) => c.suscripcionId === m.suscripcionId && c.plataformaId === p.id));
      return { nombre: p.nombre, ingresos: rows.reduce((s, r) => s + r.ingresosCentimos, 0), costos: rows.reduce((s, r) => s + r.costosCentimos, 0), registros: rows.length, incompletos: 0 };
    }) };
    if (url.pathname === '/operaciones/revision') return { saldos: [], referencias: [], sinCredenciales: [] };
    throw new Error('Esta acción requiere iniciar sesión en la aplicación real.');
  }

  if (url.pathname === '/resumen') {
    const current = date(0);
    const week = date(7);
    return { clientes: clients.filter((c) => !c.archivadoEn).length,
      activas: clients.filter((c) => !c.archivadoEn && c.venceEl >= current).length,
      proximas: clients.filter((c) => !c.archivadoEn && c.venceEl >= current && c.venceEl <= week).length,
      vencidas: clients.filter((c) => !c.archivadoEn && c.venceEl < current).length,
      margenMesCentimos: movements.filter((m) => m.fechaCobro.slice(0, 7) === current.slice(0, 7))
        .reduce((sum, m) => sum + m.ingresosCentimos - m.costosCentimos, 0),
      margenExcelMesCentimos: 0,
      margenMovimientosMesCentimos: movements.filter((m) => m.fechaCobro.slice(0, 7) === current.slice(0, 7))
        .reduce((sum, m) => sum + m.ingresosCentimos - m.costosCentimos, 0),
      ventasExcelMes: 0,
      ventasExcelSinImporte: 0,
      margenHistoricoVerificadoCentimos: movements.reduce((sum, m) => sum + m.ingresosCentimos - m.costosCentimos, 0),
      saldosPendientes: 0,
      fecha: current };
  }
  if (url.pathname === '/estadisticas') return {
    meses: Array.from({ length: 12 }, (_, index) => {
      const mes = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 11 + index, 1)).toISOString().slice(0, 7);
      return { mes, margenCentimos: movements.filter((movement) => movement.fechaCobro.startsWith(mes))
        .reduce((sum, movement) => sum + movement.ingresosCentimos - movement.costosCentimos, 0) };
    }),
    plataformas: platforms.map((platform) => ({ ...platform,
      suscripciones: clients.filter((client) => client.plataformaId === platform.id).length,
    })).sort((a, b) => b.suscripciones - a.suscripciones),
  };
  if (url.pathname === '/plataformas' && method === 'GET') return { items: clone(platforms) };
  if (url.pathname === '/configuracion' && method === 'GET') return clone(settings);
  if (url.pathname === '/configuracion' && method === 'PATCH') {
    const body = JSON.parse(options.body);
    for (const key of ['prefijoDefecto', 'proveedorNombre', 'proveedorTelefono', 'condiciones']) settings[key] = body[key];
    return { ok: true };
  }
  if (url.pathname === '/plataformas' && method === 'POST') {
    const name = JSON.parse(options.body).nombre.trim();
    if (platforms.some((platform) => platform.nombre.toLowerCase() === name.toLowerCase())) throw new Error('La plataforma ya existe');
    const platform = { id: crypto.randomUUID(), nombre: name };
    platforms.push(platform);
    return clone(platform);
  }
  if (url.pathname === '/proximos') return { items: clone(clients.filter((c) => !c.archivadoEn && c.venceEl >= date(0))
    .sort((a, b) => a.venceEl.localeCompare(b.venceEl)).slice(0, 6)) };
  if (url.pathname === '/cuentas' && method === 'GET') {
    return { items: accounts.map(({ password: _password, codigoPassword: _codigoPassword, ...account }) => ({ ...account })) };
  }
  if (url.pathname === '/cuentas' && method === 'POST') {
    const body = JSON.parse(options.body);
    const platform = platforms.find((item) => item.id === body.plataformaId);
    if (!platform) throw new Error('Selecciona una plataforma.');
    const id = crypto.randomUUID();
    accounts.push({ id, plataformaId: platform.id, plataforma: platform.nombre,
      identificador: `${body.identificador[0] || '*'}***`, estado: 'activa', perfilesAsignados: 0, password: body.contrasena,
      fechaCompra: body.fechaCompra, venceEl: body.venceEl, codigosUrl: body.codigosUrl,
      codigoPassword: body.codigoPassword, nota: body.nota });
    return { id };
  }
  const update = url.pathname.match(/^\/cuentas\/([^/]+)$/);
  if (update && method === 'PATCH') {
    const account = accounts.find((item) => item.id === update[1]);
    if (!account) throw new Error('Cuenta no encontrada');
    const body = JSON.parse(options.body);
    for (const field of ['fechaCompra', 'venceEl', 'codigosUrl', 'nota']) account[field] = body[field] || null;
    if (body.contrasena) account.password = body.contrasena;
    if (body.codigoPassword) account.codigoPassword = body.codigoPassword;
    return { id: account.id };
  }
  const reveal = url.pathname.match(/^\/cuentas\/([^/]+)\/revelar$/);
  if (reveal && method === 'POST') {
    const account = accounts.find((item) => item.id === reveal[1]);
    if (!account) throw new Error('Cuenta no encontrada');
    return { contrasena: account.password, codigoPassword: account.codigoPassword };
  }
  const accountLifecycle = url.pathname.match(/^\/cuentas\/([^/]+)\/(retirar|restaurar)$/);
  if (accountLifecycle && method === 'POST') {
    const account = accounts.find((item) => item.id === accountLifecycle[1]);
    if (!account) throw new Error('Cuenta no encontrada');
    if (accountLifecycle[2] === 'retirar' && clients.some((item) => item.cuentaId === account.id)) {
      throw new Error('Desasigna primero los perfiles de esta cuenta');
    }
    account.estado = accountLifecycle[2] === 'retirar' ? 'retirada' : 'activa';
    return { id: account.id, retirada: account.estado === 'retirada' };
  }
  if (url.pathname === '/clientes' && method === 'GET') {
    const search = (url.searchParams.get('buscar') || '').toLocaleLowerCase('es');
    const page = Number(url.searchParams.get('pagina') || 1);
    const limit = Number(url.searchParams.get('limite') || 25);
    const archived = url.searchParams.get('archivados') === '1';
    const found = clients.filter((c) => Boolean(c.archivadoEn) === archived)
      .filter((c) => `${c.nombre} ${c.telefono}`.toLocaleLowerCase('es').includes(search))
      .sort((a, b) => a.venceEl.localeCompare(b.venceEl));
    return { items: clone(found.slice((page - 1) * limit, page * limit)), total: found.length, pagina: page, limite: limit };
  }
  if (url.pathname === '/clientes' && method === 'POST') {
    const body = JSON.parse(options.body);
    const platform = platforms.find((item) => item.id === body.plataformaId);
    if (!platform) throw new Error('Selecciona una plataforma.');
    const id = crypto.randomUUID();
    const suscripcionId = crypto.randomUUID();
    const account = accounts.find((a) => a.id === body.cuentaId);
    if (account?.capacidad != null && clients.filter((c) => c.cuentaId === account.id).length >= account.capacidad) throw new Error('Cuenta sin cupos');
    clients.push({ id, suscripcionId, nombre: body.nombre, prefijo: body.prefijo,
      telefono: body.telefono, plataformaId: platform.id, plataforma: platform.nombre,
      cuentaId: body.cuentaId, fechaInicio: body.fechaInicio, venceEl: body.venceEl,
      estado: 'activa', version: 1, perfil: body.perfil, archivadoEn: null });
    movements.push({ id: crypto.randomUUID(), suscripcionId, tipo: 'alta', fechaCobro: body.fechaInicio,
      ingresosCentimos: body.pendiente ? 0 : body.ingresosCentimos, costosCentimos: body.costosCentimos, vencimientoNuevo: body.venceEl });
    if (body.pendiente && body.ingresosCentimos > 0) demoDebts.push({ id: crypto.randomUUID(), suscripcion_id: suscripcionId, nombre: body.nombre, plataforma: platform.nombre, concepto: 'Alta pendiente', importe_centimos: body.ingresosCentimos, fecha: body.fechaInicio });
    return { id, suscripcionId };
  }
  const client = url.pathname.match(/^\/clientes\/([^/]+)$/);
  if (client) {
    const value = clients.find((item) => item.id === client[1]);
    if (!value) throw new Error('Cliente no encontrado');
    if (method === 'PATCH') {
      if (value.archivadoEn) throw new Error('Restaura el cliente antes de editar');
      const body = JSON.parse(options.body);
      if (value.version !== body.expectedVersion) throw new Error('La suscripción cambió; actualiza la vista');
      const platform = platforms.find((item) => item.id === body.plataformaId);
      const account = accounts.find((item) => item.id === body.cuentaId);
      if (!platform || (body.cuentaId && (!account || account.estado !== 'activa'
        || account.plataformaId !== platform.id))) throw new Error('Cuenta incompatible o retirada');
      Object.assign(value, { nombre: body.nombre, prefijo: body.prefijo, telefono: body.telefono,
        plataformaId: platform.id, plataforma: platform.nombre, cuentaId: body.cuentaId || null,
        perfil: body.perfil, fechaInicio: body.fechaInicio, venceEl: body.venceEl });
      value.version += 1;
      return { id: value.id, version: value.version };
    }
    return { id: value.id, nombre: value.nombre, prefijo: value.prefijo, telefono: value.telefono,
      archivadoEn: value.archivadoEn,
      suscripciones: [{ id: value.suscripcionId, plataformaId: value.plataformaId,
        plataforma: value.plataforma, cuentaId: value.cuentaId, cuentaOriginal: value.cuentaOriginal, perfil: value.perfil,
        fechaInicio: value.fechaInicio, venceEl: value.venceEl, estado: value.estado, version: value.version }],
      movimientos: clone(movements.filter((m) => m.suscripcionId === value.suscripcionId)) };
  }
  const clientLifecycle = url.pathname.match(/^\/clientes\/([^/]+)\/(archivar|restaurar)$/);
  if (clientLifecycle && method === 'POST') {
    const value = clients.find((item) => item.id === clientLifecycle[1]);
    if (!value) throw new Error('Cliente no encontrado');
    value.archivadoEn = clientLifecycle[2] === 'archivar' ? new Date().toISOString() : null;
    return { id: value.id, archivado: Boolean(value.archivadoEn) };
  }
  const delivery = url.pathname.match(/^\/suscripciones\/([^/]+)\/entrega$/);
  if (delivery && method === 'POST') {
    const value = clients.find((item) => item.suscripcionId === delivery[1]);
    if (!value || value.archivadoEn) throw new Error('Suscripción no disponible');
    const account = accounts.find((item) => item.id === value.cuentaId && item.estado === 'activa');
    if (!account) throw new Error('Vincula una cuenta activa antes de enviar credenciales');
    const lines = [`*${value.plataforma}* 📌`, `Correo: ${account.identificador}`,
      `Contraseña: ${account.password}`, `Perfil/usuario: ${value.perfil || value.nombre}`,
      `🗓 Compra: ${value.fechaInicio || 'Sin fecha'}`, `🗓 Vencimiento: ${value.venceEl}`];
    if (account.codigosUrl) lines.push(`Web de códigos: ${account.codigosUrl}`);
    if (account.codigoPassword) lines.push(`Contraseña web de códigos: ${account.codigoPassword}`);
    if (settings.condiciones[value.plataforma]) lines.push('', '⚠️ *Condiciones de uso:*', settings.condiciones[value.plataforma]);
    lines.push('', `👤 Proveedor: ${settings.proveedorNombre}`, `📞 Teléfono: ${settings.proveedorTelefono}`,
      '', '¡Muchas gracias por tu compra!');
    return { telefono: `${value.prefijo}${value.telefono}`.replace(/\D/g, ''), mensaje: lines.join('\n') };
  }
  const renew = url.pathname.match(/^\/suscripciones\/([^/]+)\/renovaciones$/);
  if (renew && method === 'POST') {
    const body = JSON.parse(options.body);
    const value = clients.find((item) => item.suscripcionId === renew[1]);
    if (!value) throw new Error('Suscripción no encontrada');
    if (value.version !== body.expectedVersion) throw new Error('La suscripción cambió; actualiza la vista');
    value.venceEl = body.venceEl;
    value.version += 1;
    const id = crypto.randomUUID();
    movements.push({ id, suscripcionId: value.suscripcionId, tipo: 'renovacion', fechaCobro: body.fechaCobro,
      ingresosCentimos: body.pendiente ? 0 : body.ingresosCentimos, costosCentimos: body.costosCentimos,
      vencimientoNuevo: body.venceEl });
    if (body.pendiente && body.ingresosCentimos > 0) demoDebts.push({ id: crypto.randomUUID(), suscripcion_id: value.suscripcionId, nombre: value.nombre, plataforma: value.plataforma, concepto: 'Renovación pendiente', importe_centimos: body.ingresosCentimos, fecha: body.fechaCobro });
    return { id, version: value.version };
  }
  throw new Error('Acción no disponible en la demostración');
}
