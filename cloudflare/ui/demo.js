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
  { id: 'cuenta-1', plataformaId: 'netflix', plataforma: 'Netflix', identificador: 'n***@ejemplo.test', perfilesAsignados: 2, password: 'CLAVE-DEMO-1', fechaCompra: date(-22), venceEl: date(8), codigosUrl: 'https://example.com/', codigoPassword: 'CODIGO-DEMO', nota: 'Cuenta de ejemplo' },
  { id: 'cuenta-2', plataformaId: 'spotify', plataforma: 'Spotify', identificador: 's***@ejemplo.test', perfilesAsignados: 1, password: 'CLAVE-DEMO-2', fechaCompra: date(-30), venceEl: date(0), codigosUrl: null, codigoPassword: null, nota: null },
  { id: 'cuenta-3', plataformaId: 'disney', plataforma: 'Disney+', identificador: 'd***@ejemplo.test', perfilesAsignados: 1, password: 'CLAVE-DEMO-3', fechaCompra: null, venceEl: null, codigosUrl: null, codigoPassword: null, nota: null },
];

const clients = [
  { id: 'demo-1', nombre: 'Ana Morales', prefijo: '+51', telefono: '900000001', plataformaId: 'netflix', plataforma: 'Netflix', cuentaId: 'cuenta-1', cuentaOriginal: 'ana@ejemplo.test', venceEl: date(0), estado: 'activa', version: 1, suscripcionId: 'sub-1', perfil: 'Principal' },
  { id: 'demo-2', nombre: 'Carlos Rojas', prefijo: '+51', telefono: '900000002', plataformaId: 'spotify', plataforma: 'Spotify', cuentaId: 'cuenta-2', venceEl: date(1), estado: 'activa', version: 1, suscripcionId: 'sub-2', perfil: 'Individual' },
  { id: 'demo-3', nombre: 'Lucía Vega', prefijo: '+51', telefono: '900000003', plataformaId: 'disney', plataforma: 'Disney+', cuentaId: 'cuenta-3', venceEl: date(3), estado: 'activa', version: 1, suscripcionId: 'sub-3', perfil: 'Perfil 2' },
  { id: 'demo-4', nombre: 'Jorge Pérez', prefijo: '+51', telefono: '900000004', plataformaId: 'max', plataforma: 'Max', cuentaId: null, venceEl: date(-2), estado: 'activa', version: 1, suscripcionId: 'sub-4', perfil: 'Familiar' },
  { id: 'demo-5', nombre: 'María Torres', prefijo: '+51', telefono: '900000005', plataformaId: 'netflix', plataforma: 'Netflix', cuentaId: 'cuenta-1', venceEl: date(20), estado: 'activa', version: 1, suscripcionId: 'sub-5', perfil: 'Perfil 3' },
];

const movements = [
  { id: 'mov-1', suscripcionId: 'sub-1', tipo: 'alta', fechaCobro: date(-28), ingresosCentimos: 2500, costosCentimos: 1200, vencimientoNuevo: date(0) },
  { id: 'mov-2', suscripcionId: 'sub-2', tipo: 'renovacion', fechaCobro: date(0), ingresosCentimos: 1800, costosCentimos: 850, vencimientoNuevo: date(1) },
];

const clone = (value) => structuredClone(value);

export async function demoApi(path, options = {}) {
  const url = new URL(path, 'http://demo.local');
  const method = options.method || 'GET';

  if (url.pathname === '/resumen') {
    const current = date(0);
    const week = date(7);
    return { clientes: clients.length,
      activas: clients.filter((c) => c.venceEl >= current).length,
      proximas: clients.filter((c) => c.venceEl >= current && c.venceEl <= week).length,
      vencidas: clients.filter((c) => c.venceEl < current).length,
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
  if (url.pathname === '/proximos') return { items: clone(clients.filter((c) => c.venceEl >= date(0))
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
      identificador: `${body.identificador[0] || '*'}***`, perfilesAsignados: 0, password: body.contrasena,
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
  if (url.pathname === '/clientes' && method === 'GET') {
    const search = (url.searchParams.get('buscar') || '').toLocaleLowerCase('es');
    const page = Number(url.searchParams.get('pagina') || 1);
    const limit = Number(url.searchParams.get('limite') || 25);
    const found = clients.filter((c) => `${c.nombre} ${c.telefono}`.toLocaleLowerCase('es').includes(search))
      .sort((a, b) => a.venceEl.localeCompare(b.venceEl));
    return { items: clone(found.slice((page - 1) * limit, page * limit)), total: found.length, pagina: page, limite: limit };
  }
  if (url.pathname === '/clientes' && method === 'POST') {
    const body = JSON.parse(options.body);
    const platform = platforms.find((item) => item.id === body.plataformaId);
    if (!platform) throw new Error('Selecciona una plataforma.');
    const id = crypto.randomUUID();
    const suscripcionId = crypto.randomUUID();
    clients.push({ id, suscripcionId, nombre: body.nombre, prefijo: body.prefijo,
      telefono: body.telefono, plataformaId: platform.id, plataforma: platform.nombre,
      cuentaId: body.cuentaId, venceEl: body.venceEl, estado: 'activa', version: 1, perfil: body.perfil });
    movements.push({ id: crypto.randomUUID(), suscripcionId, tipo: 'alta', fechaCobro: body.fechaInicio,
      ingresosCentimos: body.ingresosCentimos, costosCentimos: body.costosCentimos, vencimientoNuevo: body.venceEl });
    return { id, suscripcionId };
  }
  const client = url.pathname.match(/^\/clientes\/([^/]+)$/);
  if (client) {
    const value = clients.find((item) => item.id === client[1]);
    if (!value) throw new Error('Cliente no encontrado');
    return { id: value.id, nombre: value.nombre, prefijo: value.prefijo, telefono: value.telefono,
      suscripciones: [{ id: value.suscripcionId, plataformaId: value.plataformaId,
        plataforma: value.plataforma, cuentaId: value.cuentaId, cuentaOriginal: value.cuentaOriginal, perfil: value.perfil,
        venceEl: value.venceEl, estado: value.estado, version: value.version }],
      movimientos: clone(movements.filter((m) => m.suscripcionId === value.suscripcionId)) };
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
      ingresosCentimos: body.ingresosCentimos, costosCentimos: body.costosCentimos,
      vencimientoNuevo: body.venceEl });
    return { id, version: value.version };
  }
  throw new Error('Acción no disponible en la demostración');
}
