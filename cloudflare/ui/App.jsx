import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, RefreshCw, KeyRound, Plus, Search, X,
  ArrowRight, Eye, EyeOff, CalendarDays, AlertCircle, Wallet,
} from 'lucide-react';
import { demoApi } from './demo.js';

const DEMO = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).has('demo');

async function api(path, options = {}) {
  if (DEMO) return demoApi(path, options);
  const { headers: extraHeaders, ...rest } = options;
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
  });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
  return payload;
}

function limaToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addMonth(date) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next.toISOString().slice(0, 10);
}

function money(cents) {
  return `S/ ${(Number(cents || 0) / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toCents(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [units, decimals = ''] = value.split('.');
  const result = Number(units) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

function status(date) {
  if (!date) return { text: 'Sin fecha', className: 'neutral' };
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${limaToday()}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: 'Vencido', className: 'danger' };
  if (days === 0) return { text: 'Vence hoy', className: 'warning' };
  if (days <= 7) return { text: days === 1 ? 'Mañana' : `En ${days} días`, className: 'warning' };
  return { text: 'Activo', className: 'success' };
}

function accountStatus(date) {
  if (!date) return { text: 'Sin fecha', className: 'neutral' };
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${limaToday()}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: `Venció hace ${-days} días`, className: 'danger' };
  if (days === 0) return { text: 'Vence hoy', className: 'warning' };
  return { text: `Quedan ${days} días`, className: days <= 7 ? 'warning' : 'success' };
}

function emptyAccount() { return { plataformaId: '', identificador: '', contrasena: '', fechaCompra: limaToday(), venceEl: addMonth(limaToday()), codigosUrl: '', codigoPassword: '', nota: '' }; }

function emptyClient() { return { nombre: '', prefijo: '+51', telefono: '', plataformaId: '', cuentaId: '', perfil: '', pin: '', fechaInicio: limaToday(), venceEl: addMonth(limaToday()), ingresos: '', costos: '' }; }

export default function App() {
  const [view, setView] = useState('resumen');
  const [signedIn, setSignedIn] = useState(DEMO);
  const [loginPassword, setLoginPassword] = useState('');
  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [renewForm, setRenewForm] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadOverview() {
    const [s, a, p, u] = await Promise.all([api('/resumen'), api('/cuentas'), api('/plataformas'), api('/proximos')]);
    setSummary(s);
    setAccounts(a.items);
    setPlatforms(p.items);
    setUpcoming(u.items);
  }

  async function loadClients(nextPage = page, nextSearch = search) {
    const data = await api(`/clientes?pagina=${nextPage}&limite=25&buscar=${encodeURIComponent(nextSearch)}`);
    setClients(data.items);
    setTotal(data.total);
  }

  useEffect(() => {
    let active = true;
    (DEMO ? Promise.resolve() : api('/session'))
      .then(() => Promise.all([api('/resumen'), api('/cuentas'), api('/plataformas'), api('/proximos'), api('/clientes?pagina=1&limite=25')]))
      .then(([s, a, p, u, c]) => {
        if (!active) return;
        setSignedIn(true);
        setSummary(s); setAccounts(a.items); setPlatforms(p.items); setUpcoming(u.items); setClients(c.items); setTotal(c.total);
      })
      .catch((cause) => { if (active && cause.message !== 'Acceso no autorizado') setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(''), 6000); }

  async function signIn(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/login', { method: 'POST', body: JSON.stringify({ password: loginPassword }) });
      setLoginPassword(''); setSignedIn(true); await Promise.all([loadOverview(), loadClients(1, '')]);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try { await api('/logout', { method: 'POST' }); }
    finally { setSignedIn(false); setAccounts([]); setClients([]); setSelected(null); setRevealed(null); }
  }

  async function refresh() {
    setError(''); setLoading(true);
    try { await Promise.all([loadOverview(), loadClients()]); }
    catch (cause) { if (cause.message === 'Acceso no autorizado') setSignedIn(false); setError(cause.message); }
    finally { setLoading(false); }
  }

  async function selectClient(id) {
    setError('');
    try { setSelected(await api(`/clientes/${id}`)); setView('detalle'); }
    catch (cause) { setError(cause.message); }
  }

  async function searchClients(event) {
    event.preventDefault(); setPage(1); setSearch(searchDraft); setError('');
    try { await loadClients(1, searchDraft); }
    catch (cause) { setError(cause.message); }
  }

  function openClientForm() {
    setClientForm({ ...emptyClient(), plataformaId: platforms[0]?.id || '' });
    setModal('cliente');
  }

  async function saveClient(event) {
    event.preventDefault();
    const ingresosCentimos = toCents(clientForm.ingresos);
    const costosCentimos = toCents(clientForm.costos);
    if (ingresosCentimos == null || costosCentimos == null) return setError('Escribe importes válidos con hasta dos decimales.');
    setBusy(true); setError('');
    try {
      await api('/clientes', { method: 'POST', body: JSON.stringify({
        nombre: clientForm.nombre, prefijo: clientForm.prefijo, telefono: clientForm.telefono,
        plataformaId: clientForm.plataformaId, cuentaId: clientForm.cuentaId || null,
        perfil: clientForm.perfil, pin: clientForm.pin, fechaInicio: clientForm.fechaInicio,
        venceEl: clientForm.venceEl, ingresosCentimos, costosCentimos,
      }) });
      setModal(null); flash('Cliente guardado.'); await refresh(); setView('clientes');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  function openRenew(subscription) {
    const base = subscription.venceEl > limaToday() ? subscription.venceEl : limaToday();
    setRenewForm({ subscriptionId: subscription.id, expectedVersion: subscription.version,
      nombre: selected?.nombre || '', fechaCobro: limaToday(), venceEl: addMonth(base),
      ingresos: '', costos: '', operationKey: crypto.randomUUID() });
    setModal('renovar');
  }

  async function saveRenew(event) {
    event.preventDefault();
    const ingresosCentimos = toCents(renewForm.ingresos);
    const costosCentimos = toCents(renewForm.costos);
    if (ingresosCentimos == null || costosCentimos == null) return setError('Escribe importes válidos con hasta dos decimales.');
    setBusy(true); setError('');
    try {
      await api(`/suscripciones/${renewForm.subscriptionId}/renovaciones`, {
        method: 'POST', headers: { 'Idempotency-Key': renewForm.operationKey },
        body: JSON.stringify({ expectedVersion: renewForm.expectedVersion,
          fechaCobro: renewForm.fechaCobro, venceEl: renewForm.venceEl,
          ingresosCentimos, costosCentimos }),
      });
      setModal(null); flash('Renovación registrada.');
      await refresh();
      if (selected) await selectClient(selected.id);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function saveAccount(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(editingAccountId ? `/cuentas/${editingAccountId}` : '/cuentas',
        { method: editingAccountId ? 'PATCH' : 'POST', body: JSON.stringify(accountForm) });
      setAccountForm(emptyAccount()); setEditingAccountId(null);
      setModal(null); flash('Cuenta guardada.'); await refresh();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  function editAccount(account) {
    setEditingAccountId(account.id);
    setAccountForm({ plataformaId: account.plataformaId, identificador: account.identificador,
      contrasena: '', fechaCompra: account.fechaCompra || '', venceEl: account.venceEl || '',
      codigosUrl: account.codigosUrl || '', codigoPassword: '', nota: account.nota || '' });
    setModal('cuenta');
  }

  async function reveal(accountId) {
    setRevealed(null); setError('');
    try {
      const data = await api(`/cuentas/${accountId}/revelar`, { method: 'POST' });
      setRevealed({ accountId, password: data.contrasena, codePassword: data.codigoPassword });
      window.setTimeout(() => setRevealed((value) => value?.accountId === accountId ? null : value), 20_000);
    } catch (cause) { setError(cause.message); }
  }

  const nav = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'cuentas', label: 'Cuentas', icon: KeyRound },
  ];

  const title = view === 'resumen' ? 'Resumen de suscripciones'
    : view === 'clientes' ? 'Directorio de clientes'
      : view === 'cuentas' ? 'Cuentas de servicio' : selected?.nombre || 'Cliente';

  if (!DEMO && !signedIn) return <div className="login-page"><form className="login-card" onSubmit={signIn}>
    <div className="brand login-brand"><span className="brand-mark">▶</span>DoroStream</div>
    <h1>Acceso privado</h1><p>Ingresa la contraseña de administración para abrir el panel.</p>
    {error && <div className="message error" role="alert">{error}</div>}
    <Field label="Contraseña"><input required type="password" autoComplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></Field>
    <button className="primary submit" disabled={busy || loading}>{busy ? 'Ingresando…' : loading ? 'Cargando…' : 'Entrar'}</button>
  </form></div>;

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">▶</span>DoroStream</div>
      <p className="nav-label">Espacio de trabajo</p>
      <nav aria-label="Navegación principal" className="nav">
        {nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''}
          onClick={() => setView(id)} type="button"><Icon size={18} />{label}</button>)}
      </nav>
      <div className="sidebar-note">{DEMO ? 'Demostración local · datos ficticios' : 'Panel privado · Cloudflare Workers'}</div>
    </aside>
    <div className="main">
      <header className="topbar"><span>Operación / {title}</span><div className="top-actions">
        {DEMO && <span className="demo-badge">Vista de demostración</span>}
        <button className="icon-button" onClick={refresh} title="Actualizar datos" aria-label="Actualizar datos" disabled={loading}><RefreshCw size={18} /></button>
        {!DEMO && <button className="secondary" onClick={signOut}>Salir</button>}
        <span className="avatar">DS</span>
      </div></header>
      <main className="content">
        {DEMO && <p className="demo-banner">Datos ficticios en memoria. Ninguna acción modifica D1, el Excel ni la aplicación actual.</p>}
        <div className="page-head"><div><p className="eyebrow">DoroStream</p><h1>{title}</h1>
          <p className="sub">{view === 'resumen' ? 'Vencimientos, movimientos y trabajo pendiente en un solo lugar.'
            : view === 'clientes' ? 'Busca clientes y consulta el estado de cada suscripción.'
              : view === 'cuentas' ? 'Gestiona el acceso a tus cuentas de servicio.' : 'Suscripciones y movimientos registrados.'}</p></div>
          {view === 'clientes' && <button className="primary" onClick={openClientForm}><Plus size={17} />Nuevo cliente</button>}
          {view === 'cuentas' && <button className="primary" onClick={() => { setEditingAccountId(null); setAccountForm({ ...emptyAccount(), plataformaId: platforms[0]?.id || '' }); setModal('cuenta'); }}><Plus size={17} />Nueva cuenta</button>}
        </div>

        {error && <div className="message error" role="alert"><AlertCircle size={18} />{error}<button onClick={() => setError('')} aria-label="Cerrar error"><X size={16} /></button></div>}
        {notice && <div className="message success" role="status">{notice}</div>}
        {loading && <div className="loading">Cargando datos…</div>}

        {view === 'resumen' && <>
          <section className="stat-grid" aria-label="Indicadores"><Stat icon={Users} label="Clientes" value={summary?.clientes ?? '—'} />
            <Stat icon={CalendarDays} label="Activas" value={summary?.activas ?? '—'} />
            <Stat icon={AlertCircle} label="Vencen en 7 días" value={summary?.proximas ?? '—'} tone="warning" />
            <Stat icon={Wallet} label="Margen registrado este mes" value={summary ? money(summary.margenMesCentimos) : '—'} tone="green" /></section>
          <section className="panel"><div className="panel-head"><div><h2>Próximos vencimientos</h2><p>Prioriza clientes que necesitan seguimiento.</p></div><button className="text-button" onClick={() => setView('clientes')}>Ver directorio <ArrowRight size={16} /></button></div>
            <div className="list">{upcoming.map((c) => <ClientRow key={c.id} client={c} onClick={() => selectClient(c.id)} />)}
              {!upcoming.length && <p className="empty">No hay próximos vencimientos.</p>}</div></section>
        </>}

        {view === 'clientes' && <section className="panel"><form className="toolbar" onSubmit={searchClients}><div className="search-box"><Search size={18} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar nombre o teléfono" aria-label="Buscar nombre o teléfono" /></div><button className="secondary" type="submit">Buscar</button></form>
          <div className="list">{clients.map((c) => <ClientRow key={c.id} client={c} onClick={() => selectClient(c.id)} />)}
            {!clients.length && !loading && <p className="empty">No se encontraron clientes.</p>}</div>
          <div className="pagination"><span>{total} clientes · Página {page}</span><div><button className="secondary" disabled={page <= 1} onClick={async () => { const next = page - 1; setPage(next); await loadClients(next); }}>Anterior</button><button className="secondary" disabled={page * 25 >= total} onClick={async () => { const next = page + 1; setPage(next); await loadClients(next); }}>Siguiente</button></div></div>
        </section>}

        {view === 'detalle' && selected && <><button className="text-button back" onClick={() => setView('clientes')}>← Volver al directorio</button>
          <section className="panel"><div className="panel-head"><div><h2>Datos del cliente</h2><p>{selected.prefijo} {selected.telefono || 'Sin teléfono'}</p></div></div>
            <div className="list">{selected.suscripciones.map((s) => <div className="detail-row" key={s.id}><div><strong>{s.plataforma}</strong><small>{s.perfil || 'Sin perfil'} · Vence {s.venceEl}</small>{s.cuentaOriginal && <small>Cuenta en Excel: {s.cuentaOriginal}{!s.cuentaId ? ' · pendiente de vincular' : ''}</small>}<small>Precio: compra {s.precioCompraCentimos == null ? '—' : money(s.precioCompraCentimos)} · venta {s.precioVentaCentimos == null ? '—' : money(s.precioVentaCentimos)}</small><small>Histórico: ingresos {s.ingresosHistoricosCentimos == null ? 'Por conciliar' : money(s.ingresosHistoricosCentimos)} · costos {s.costosHistoricosCentimos == null ? 'Por conciliar' : money(s.costosHistoricosCentimos)} · renovaciones {s.renovacionesHistoricas ?? 'Por conciliar'}</small>{s.historialOriginal && <details className="legacy-history"><summary>Ver historial del Excel</summary><pre>{s.historialOriginal}</pre></details>}</div><span className={`pill ${status(s.venceEl).className}`}>{status(s.venceEl).text}</span><button className="secondary" onClick={() => openRenew(s)}>Renovar</button></div>)}</div></section>
          <section className="panel"><div className="panel-head"><div><h2>Movimientos recientes</h2><p>Cobros y costos posteriores a la migración.</p></div></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cobro</th><th>Costo</th><th>Margen</th></tr></thead><tbody>{selected.movimientos.map((m) => <tr key={m.id}><td>{m.fechaCobro}</td><td>{m.tipo}</td><td>{money(m.ingresosCentimos)}</td><td>{money(m.costosCentimos)}</td><td>{money(m.ingresosCentimos - m.costosCentimos)}</td></tr>)}</tbody></table>{!selected.movimientos.length && <p className="empty">Sin movimientos nuevos.</p>}</div></section>
        </>}

        {view === 'cuentas' && <section className="panel"><div className="panel-head"><div><h2>Inventario de cuentas</h2><p>Fecha de compra y días hasta vencer. Las credenciales se revelan sólo a administradores.</p></div></div><div className="list">{accounts.map((a) => <div className="account-row" key={a.id}><span className="account-mark"><KeyRound size={18} /></span><div className="account-info"><strong>{a.plataforma}</strong><small>{a.identificador} · {a.perfilesAsignados} perfiles</small><small>Compra: {a.fechaCompra || 'Sin fecha'} · Vence: {a.venceEl || 'Sin fecha'}</small>{a.codigosUrl && <a href={a.codigosUrl} target="_blank" rel="noopener noreferrer" className="account-link">Abrir web de códigos ↗</a>}{a.nota && <p className="account-note">{a.nota}</p>}</div><span className={`pill ${accountStatus(a.venceEl).className}`}>{accountStatus(a.venceEl).text}</span><button className="secondary" onClick={() => editAccount(a)}>Editar</button><button className="secondary" onClick={() => reveal(a.id)}>{revealed?.accountId === a.id ? <EyeOff size={16} /> : <Eye size={16} />}{revealed?.accountId === a.id ? 'Ocultar en 20 s' : 'Revelar'}</button>{revealed?.accountId === a.id && <p className="revealed">Contraseña: <strong>{revealed.password}</strong>{revealed.codePassword && <> · Contraseña web de códigos: <strong>{revealed.codePassword}</strong></>}</p>}</div>)}
            {!accounts.length && !loading && <p className="empty">No hay cuentas cargadas.</p>}</div></section>}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Navegación móvil">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>

    {modal && <div className="overlay" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><h2 id="dialog-title">{modal === 'cliente' ? 'Nuevo cliente' : modal === 'cuenta' ? editingAccountId ? 'Editar cuenta' : 'Nueva cuenta' : `Renovar ${renewForm?.nombre}`}</h2><button className="icon-button" onClick={() => { setModal(null); setError(''); }} aria-label="Cerrar"><X size={19} /></button></div>
      {error && <div className="message error dialog-error" role="alert"><AlertCircle size={17} />{error}</div>}
      {modal === 'cliente' && <form onSubmit={saveClient} className="form"><Field label="Nombre"><input required maxLength="150" value={clientForm.nombre} onChange={(e) => setClientForm({ ...clientForm, nombre: e.target.value })} /></Field><div className="form-grid"><Field label="Prefijo"><input required value={clientForm.prefijo} onChange={(e) => setClientForm({ ...clientForm, prefijo: e.target.value })} /></Field><Field label="Teléfono"><input inputMode="tel" value={clientForm.telefono} onChange={(e) => setClientForm({ ...clientForm, telefono: e.target.value })} /></Field></div><Field label="Plataforma"><select required value={clientForm.plataformaId} onChange={(e) => setClientForm({ ...clientForm, plataformaId: e.target.value, cuentaId: '' })}><option value="">Selecciona</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Field><Field label="Cuenta (opcional)"><select value={clientForm.cuentaId} onChange={(e) => setClientForm({ ...clientForm, cuentaId: e.target.value })}><option value="">Sin asignar</option>{accounts.filter((a) => a.plataformaId === clientForm.plataformaId).map((a) => <option key={a.id} value={a.id}>{a.identificador}</option>)}</select></Field><div className="form-grid"><Field label="Perfil"><input value={clientForm.perfil} onChange={(e) => setClientForm({ ...clientForm, perfil: e.target.value })} /></Field><Field label="PIN"><input inputMode="numeric" value={clientForm.pin} onChange={(e) => setClientForm({ ...clientForm, pin: e.target.value })} /></Field></div><div className="form-grid"><Field label="Inicio"><input required type="date" value={clientForm.fechaInicio} onChange={(e) => setClientForm({ ...clientForm, fechaInicio: e.target.value })} /></Field><Field label="Vencimiento"><input required type="date" value={clientForm.venceEl} onChange={(e) => setClientForm({ ...clientForm, venceEl: e.target.value })} /></Field></div><div className="form-grid"><Field label="Cobro (S/)"><input required inputMode="decimal" value={clientForm.ingresos} onChange={(e) => setClientForm({ ...clientForm, ingresos: e.target.value })} /></Field><Field label="Costo (S/)"><input required inputMode="decimal" value={clientForm.costos} onChange={(e) => setClientForm({ ...clientForm, costos: e.target.value })} /></Field></div><button className="primary submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cliente'}</button></form>}
      {modal === 'renovar' && <form onSubmit={saveRenew} className="form"><div className="form-grid"><Field label="Fecha de cobro"><input required type="date" value={renewForm.fechaCobro} onChange={(e) => setRenewForm({ ...renewForm, fechaCobro: e.target.value })} /></Field><Field label="Nuevo vencimiento"><input required type="date" value={renewForm.venceEl} onChange={(e) => setRenewForm({ ...renewForm, venceEl: e.target.value })} /></Field></div><div className="form-grid"><Field label="Cobro (S/)"><input required inputMode="decimal" value={renewForm.ingresos} onChange={(e) => setRenewForm({ ...renewForm, ingresos: e.target.value })} /></Field><Field label="Costo (S/)"><input required inputMode="decimal" value={renewForm.costos} onChange={(e) => setRenewForm({ ...renewForm, costos: e.target.value })} /></Field></div><button className="primary submit" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar renovación'}</button></form>}
      {modal === 'cuenta' && <form onSubmit={saveAccount} className="form"><Field label="Plataforma"><select required disabled={!!editingAccountId} value={accountForm.plataformaId} onChange={(e) => setAccountForm({ ...accountForm, plataformaId: e.target.value })}><option value="">Selecciona</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Field><Field label="Correo o identificador"><input required disabled={!!editingAccountId} value={accountForm.identificador} onChange={(e) => setAccountForm({ ...accountForm, identificador: e.target.value })} /></Field><Field label={editingAccountId ? 'Nueva contraseña (opcional)' : 'Contraseña'}><input required={!editingAccountId} type="password" autoComplete="new-password" value={accountForm.contrasena} onChange={(e) => setAccountForm({ ...accountForm, contrasena: e.target.value })} /></Field><div className="form-grid"><Field label="Fecha de compra"><input required={!editingAccountId} type="date" value={accountForm.fechaCompra} onChange={(e) => setAccountForm({ ...accountForm, fechaCompra: e.target.value })} /></Field><Field label="Fecha de vencimiento"><input required={!editingAccountId} type="date" value={accountForm.venceEl} onChange={(e) => setAccountForm({ ...accountForm, venceEl: e.target.value })} /></Field></div><Field label="Web de códigos (URL)"><input type="url" placeholder="https://" maxLength="2048" value={accountForm.codigosUrl} onChange={(e) => setAccountForm({ ...accountForm, codigosUrl: e.target.value })} /></Field><Field label="Contraseña de la web de códigos"><input type="password" autoComplete="new-password" maxLength="500" value={accountForm.codigoPassword} onChange={(e) => setAccountForm({ ...accountForm, codigoPassword: e.target.value })} /></Field><Field label="Nota libre"><textarea maxLength="4000" rows="3" value={accountForm.nota} onChange={(e) => setAccountForm({ ...accountForm, nota: e.target.value })} /></Field><button className="primary submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cuenta'}</button></form>}
    </div></div>}
  </div>;
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }

function Stat({ icon: Icon, label, value, tone = '' }) { return <div className={`stat ${tone}`}><span className="stat-label">{label}<Icon size={17} /></span><strong>{value}</strong></div>; }

function ClientRow({ client, onClick }) {
  const state = status(client.venceEl);
  return <button className="client-row" onClick={onClick}><span className="initials">{client.nombre?.slice(0, 2).toUpperCase()}</span><span className="client-name"><strong>{client.nombre}</strong><small>{client.plataforma || 'Sin suscripción'} · {client.prefijo} {client.telefono || 'Sin teléfono'}</small></span><span className="expires">{client.venceEl || '—'}</span><span className={`pill ${state.className}`}>{state.text}</span><ArrowRight size={17} className="row-arrow" /></button>;
}
