import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Users, RefreshCw, KeyRound, Plus, Search, X,
  ArrowRight, Eye, EyeOff, CalendarDays, AlertCircle, Wallet, MessageCircle, Settings, Archive, RotateCcw,
} from 'lucide-react';
import { demoApi } from './demo.js';
import { Operations, Security } from './Operations.jsx';
import { normalizePhone } from '../src/validation.js';

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

function renewalWhatsAppUrl(client, subscription = client) {
  if (client.archivadoEn) return null;
  const phone = `${client.prefijo || '+51'}${client.telefono || ''}`.replace(/\D/g, '');
  if (phone.length < 8 || !subscription.venceEl) return null;
  const days = Math.round((Date.parse(`${subscription.venceEl}T00:00:00Z`) - Date.parse(`${limaToday()}T00:00:00Z`)) / 86_400_000);
  const expiry = days > 1 ? `vence en *${days} días*` : days === 1 ? 'vence *mañana*'
    : days === 0 ? 'vence *hoy*' : `*venció* hace *${-days} días*`;
  const account = subscription.cuentaOriginal ? ` (Cuenta: ${subscription.cuentaOriginal})` : '';
  const message = `¡Hola ${client.nombre}! 😊 Te escribo para recordarte que tu suscripción de *${subscription.plataforma}*${account} ${expiry} (${subscription.venceEl}). ¿Deseas renovar tu servicio con nosotros para no perder el acceso? ¡Quedo atento/a!`;
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

function RenewalButton({ client, subscription, compact = false }) {
  const url = renewalWhatsAppUrl(client, subscription);
  return <a className={`secondary renewal-button${compact ? ' compact' : ''}${!url ? ' disabled' : ''}`}
    href={url || undefined} target="_blank" rel="noopener noreferrer"
    aria-disabled={!url} title={url ? 'Abrir mensaje de renovación en WhatsApp' : 'Este cliente no tiene un teléfono válido'}
    onClick={url ? undefined : (event) => event.preventDefault()}><MessageCircle size={16} />{compact ? 'Avisar' : 'Enviar renovación'}</a>;
}

function emptyAccount() { return { plataformaId: '', identificador: '', contrasena: '', fechaCompra: limaToday(), venceEl: addMonth(limaToday()), codigosUrl: '', codigoPassword: '', nota: '' }; }

function emptyClient() { return { nombre: '', prefijo: '+51', telefono: '', plataformaId: '', cuentaId: '', perfil: '', pin: '', fechaInicio: limaToday(), venceEl: addMonth(limaToday()), ingresos: '', costos: '' }; }

export default function App() {
  const [view, setView] = useState('resumen');
  const [operationsRevision, setOperationsRevision] = useState(0);
  const [signedIn, setSignedIn] = useState(DEMO);
  const [loginPassword, setLoginPassword] = useState('');
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [clients, setClients] = useState([]);
  const [showArchivedClients, setShowArchivedClients] = useState(false);
  const [upcoming, setUpcoming] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showRetiredAccounts, setShowRetiredAccounts] = useState(false);
  const [platforms, setPlatforms] = useState([]);
  const [settingsDraft, setSettingsDraft] = useState({ moneda: 'S/.', prefijoDefecto: '+51', proveedorNombre: '', proveedorTelefono: '', condiciones: {} });
  const [newPlatformName, setNewPlatformName] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [editForm, setEditForm] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const deliveryTimer = useRef(null);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [renewForm, setRenewForm] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadOverview() {
    const [s, a, p, u, charts, config] = await Promise.all([api('/resumen'), api('/cuentas'), api('/plataformas'), api('/proximos'), api('/estadisticas'), api('/configuracion')]);
    setSummary(s);
    setAnalytics(charts);
    setAccounts(a.items);
    setPlatforms(p.items);
    setSettingsDraft(config);
    setUpcoming(u.items);
  }

  async function loadClients(nextPage = page, nextSearch = search, archived = showArchivedClients) {
    const data = await api(`/clientes?pagina=${nextPage}&limite=25&buscar=${encodeURIComponent(nextSearch)}&archivados=${archived ? '1' : '0'}`);
    setClients(data.items);
    setTotal(data.total);
  }

  useEffect(() => {
    let active = true;
    (DEMO ? Promise.resolve() : api('/session'))
      .then(() => Promise.all([api('/resumen'), api('/cuentas'), api('/plataformas'), api('/proximos'), api('/clientes?pagina=1&limite=25'), api('/estadisticas'), api('/configuracion')]))
      .then(([s, a, p, u, c, charts, config]) => {
        if (!active) return;
        setSignedIn(true);
        setSummary(s); setAnalytics(charts); setAccounts(a.items); setPlatforms(p.items); setSettingsDraft(config); setUpcoming(u.items); setClients(c.items); setTotal(c.total);
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
    finally { clearPreparedDelivery(); setSignedIn(false); setAccounts([]); setClients([]); setSelected(null); setRevealed(null); }
  }

  function clearPreparedDelivery() {
    if (deliveryTimer.current) window.clearTimeout(deliveryTimer.current);
    deliveryTimer.current = null;
    setDelivery(null);
  }

  async function refresh() {
    setError(''); setLoading(true);
    try { await Promise.all([loadOverview(), loadClients()]); setOperationsRevision((value) => value + 1); }
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
    setClientForm({ ...emptyClient(), prefijo: settingsDraft.prefijoDefecto, plataformaId: platforms[0]?.id || '' });
    setModal('cliente');
  }

  async function saveClient(event) {
    event.preventDefault();
    const contact = normalizePhone(clientForm.telefono, clientForm.prefijo);
    if (!contact) return setError('Revisa el teléfono y su prefijo de país.');
    const ingresosCentimos = toCents(clientForm.ingresos);
    const costosCentimos = toCents(clientForm.costos);
    if (ingresosCentimos == null || costosCentimos == null) return setError('Escribe importes válidos con hasta dos decimales.');
    setBusy(true); setError('');
    try {
      await api('/clientes', { method: 'POST', body: JSON.stringify({
        nombre: clientForm.nombre, ...contact,
        plataformaId: clientForm.plataformaId, cuentaId: clientForm.cuentaId || null,
        perfil: clientForm.perfil, pin: clientForm.pin, fechaInicio: clientForm.fechaInicio,
        venceEl: clientForm.venceEl, ingresosCentimos, costosCentimos, pendiente: !!clientForm.pendiente, metodoPago: clientForm.metodoPago || 'Otro',
      }) });
      setModal(null); flash('Cliente guardado.'); await refresh(); setView('clientes');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  function openEditClient(subscription) {
    setEditForm({ clienteId: selected.id, suscripcionId: subscription.id,
      expectedVersion: subscription.version, nombre: selected.nombre,
      prefijo: selected.prefijo, telefono: selected.telefono || '',
      plataformaId: subscription.plataformaId, cuentaId: subscription.cuentaId || '',
      perfil: subscription.perfil || '', fechaInicio: subscription.fechaInicio || '',
      venceEl: subscription.venceEl, pin: '', quitarPin: false });
    setModal('editar-cliente');
  }

  async function saveEditClient(event) {
    event.preventDefault();
    const contact = normalizePhone(editForm.telefono, editForm.prefijo);
    if (!contact) return setError('Revisa el teléfono y su prefijo de país.');
    setBusy(true); setError('');
    try {
      await api(`/clientes/${editForm.clienteId}`, { method: 'PATCH', body: JSON.stringify({ ...editForm, ...contact }) });
      const id = editForm.clienteId;
      setEditForm(null); setModal(null); flash('Datos del cliente actualizados.');
      await refresh(); await selectClient(id);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function changeClientArchive(archived) {
    if (archived && !window.confirm(`¿Retirar a ${selected.nombre}? Podrás restaurarlo sin perder cobros ni historial.`)) return;
    setBusy(true); setError('');
    try {
      const id = selected.id;
      await api(`/clientes/${id}/${archived ? 'archivar' : 'restaurar'}`, { method: 'POST' });
      flash(archived ? 'Cliente retirado.' : 'Cliente restaurado.');
      await refresh(); await selectClient(id);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function changeAccountArchive(account, retired) {
    if (retired && !window.confirm(`¿Retirar la cuenta de ${account.plataforma}? Primero deben estar desasignados todos sus perfiles.`)) return;
    setBusy(true); setError('');
    try {
      await api(`/cuentas/${account.id}/${retired ? 'retirar' : 'restaurar'}`, { method: 'POST' });
      flash(retired ? 'Cuenta retirada.' : 'Cuenta restaurada.'); await refresh();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function openDelivery(subscription) {
    setBusy(true); setError(''); clearPreparedDelivery();
    try {
      const prepared = await api(`/suscripciones/${subscription.id}/entrega`, { method: 'POST' });
      setDelivery(prepared); setModal('entrega');
      deliveryTimer.current = window.setTimeout(() => { clearPreparedDelivery(); setModal((current) => current === 'entrega' ? null : current); }, 120_000);
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
          ingresosCentimos, costosCentimos, pendiente: !!renewForm.pendiente, metodoPago: renewForm.metodoPago || 'Otro' }),
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
      setModal(null); flash('Cuenta guardada.'); await refresh(); setOperationsRevision((value) => value + 1);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function saveSettings(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/configuracion', { method: 'PATCH', body: JSON.stringify(settingsDraft) });
      flash('Ajustes guardados.');
      await loadOverview();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function createPlatform(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/plataformas', { method: 'POST', body: JSON.stringify({ nombre: newPlatformName }) });
      setNewPlatformName(''); flash('Plataforma añadida.'); await loadOverview();
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
    { id: 'operaciones', label: 'Operación', icon: CalendarDays },
    { id: 'ajustes', label: 'Ajustes', icon: Settings },
  ];

  const title = view === 'resumen' ? 'Resumen de suscripciones'
    : view === 'clientes' ? 'Directorio de clientes'
      : view === 'cuentas' ? 'Cuentas de servicio' : view === 'ajustes' ? 'Configuración' : view === 'operaciones' ? 'Control de operaciones' : selected?.nombre || 'Cliente';
  const accountGroups = platforms.map((platform) => ({ ...platform,
    items: accounts.filter((account) => account.plataformaId === platform.id
      && (showRetiredAccounts ? account.estado === 'retirada' : account.estado !== 'retirada')),
  })).filter((group) => group.items.length);

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
              : view === 'cuentas' ? 'Gestiona el acceso a tus cuentas de servicio.'
                : view === 'ajustes' ? 'Edita datos del proveedor, prefijo y condiciones por plataforma.' : 'Suscripciones y movimientos registrados.'}</p></div>
          {view === 'clientes' && <button className="primary" onClick={openClientForm}><Plus size={17} />Nuevo cliente</button>}
          {view === 'cuentas' && <button className="primary" onClick={() => { setEditingAccountId(null); setAccountForm({ ...emptyAccount(), plataformaId: platforms[0]?.id || '' }); setModal('cuenta'); }}><Plus size={17} />Nueva cuenta</button>}
        </div>

        {error && <div className="message error" role="alert"><AlertCircle size={18} />{error}<button onClick={() => setError('')} aria-label="Cerrar error"><X size={16} /></button></div>}
        {notice && <div className="message success" role="status">{notice}</div>}
        {loading && <div className="loading">Cargando datos…</div>}

        {view === 'resumen' && <>
          <section className="stat-grid" aria-label="Indicadores"><Stat icon={Users} label="Clientes" value={summary?.clientes ?? '—'} />
            <Stat icon={CalendarDays} label="Activas" value={summary?.activas ?? '—'} />
            <Stat icon={Wallet} label="Ganancia del mes" value={summary ? money(summary.margenMesCentimos) : '—'} tone="green"
              detail={summary ? `${summary.ventasExcelMes} ventas del Excel: ${money(summary.margenExcelMesCentimos)} · Movimientos nuevos: ${money(summary.margenMovimientosMesCentimos)}` : ''} />
            <Stat icon={Wallet} label="Histórico verificado" value={summary ? money(summary.margenHistoricoVerificadoCentimos) : '—'}
              detail={summary?.saldosPendientes ? `${summary.saldosPendientes} saldos del Excel por conciliar` : 'Todos los saldos conciliados'} />
            <Stat icon={AlertCircle} label="Vencen en 7 días" value={summary?.proximas ?? '—'} tone="warning" />
            <Stat icon={AlertCircle} label="Vencidas" value={summary?.vencidas ?? '—'} tone="warning" /></section>
          <section className="charts-grid" aria-label="Gráficas del negocio">
            <div className="panel chart-panel"><div className="panel-head"><div><h2>Ganancia por mes</h2><p>Últimos 12 meses · ventas del Excel y movimientos nuevos</p></div></div><MonthlyChart months={analytics?.meses || []} /></div>
            <div className="panel chart-panel"><div className="panel-head"><div><h2>Suscripciones por plataforma</h2><p>Distribución de las suscripciones registradas</p></div></div><PlatformChart platforms={analytics?.plataformas || []} /></div>
          </section>
          <section className="panel"><div className="panel-head"><div><h2>Próximos vencimientos</h2><p>Prioriza clientes que necesitan seguimiento.</p></div><button className="text-button" onClick={() => setView('clientes')}>Ver directorio <ArrowRight size={16} /></button></div>
            <div className="list">{upcoming.map((c) => <ClientRow key={c.id} client={c} onClick={() => selectClient(c.id)} />)}
              {!upcoming.length && <p className="empty">No hay próximos vencimientos.</p>}</div></section>
        </>}

        {view === 'resumen' && summary?.margenReconstruidoCentimos > 0 && <p className="review-note">Saldo reconstruido de la app anterior: {money(summary.margenReconstruidoCentimos)}. Se muestra separado del histórico verificado; revisa la evidencia en Operación → Revisión de datos.</p>}
        {view === 'operaciones' && <Operations revision={operationsRevision} api={api} onClient={selectClient} onAccount={(id) => { const account = accounts.find((a) => a.id === id); if (account) editAccount(account); }} RenewalButton={RenewalButton} onChanged={loadOverview} />}
        {view === 'ajustes' && <Security api={api} onLogout={signOut} demo={DEMO} />}
        {view === 'clientes' && <section className="panel"><form className="toolbar" onSubmit={searchClients}><div className="search-box"><Search size={18} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar nombre o teléfono" aria-label="Buscar nombre o teléfono" /></div><button className="secondary" type="submit">Buscar</button><button className="secondary" type="button" onClick={async () => { const next = !showArchivedClients; setShowArchivedClients(next); setPage(1); await loadClients(1, search, next); }}>{showArchivedClients ? 'Ver activos' : 'Ver retirados'}</button></form>
          <div className="list">{clients.map((c) => <div className="client-entry" key={c.id}><ClientRow client={c} onClick={() => selectClient(c.id)} /><RenewalButton client={c} compact /></div>)}
            {!clients.length && !loading && <p className="empty">No se encontraron clientes.</p>}</div>
          <div className="pagination"><span>{total} clientes {showArchivedClients ? 'retirados' : 'activos'} · Página {page}</span><div><button className="secondary" disabled={page <= 1} onClick={async () => { const next = page - 1; setPage(next); await loadClients(next); }}>Anterior</button><button className="secondary" disabled={page * 25 >= total} onClick={async () => { const next = page + 1; setPage(next); await loadClients(next); }}>Siguiente</button></div></div>
        </section>}

        {view === 'detalle' && selected && <><button className="text-button back" onClick={() => setView('clientes')}>← Volver al directorio</button>
          <section className="panel"><div className="panel-head"><div><h2>Datos del cliente {selected.archivadoEn && <span className="pill neutral">Retirado</span>}</h2><p>{selected.prefijo} {selected.telefono || 'Sin teléfono'}</p></div><button className="secondary" disabled={busy} onClick={() => changeClientArchive(!selected.archivadoEn)}>{selected.archivadoEn ? <RotateCcw size={16} /> : <Archive size={16} />}{selected.archivadoEn ? 'Restaurar' : 'Retirar cliente'}</button></div>
            <div className="list">{selected.suscripciones.map((s) => <div className="detail-row" key={s.id}><div><strong>{s.plataforma}</strong><small>{s.perfil || 'Sin perfil'} · Vence {s.venceEl}</small>{s.cuentaOriginal && <small>Cuenta en Excel: {s.cuentaOriginal}{!s.cuentaId ? ' · pendiente de vincular' : ''}</small>}<small>Precio: compra {s.precioCompraCentimos == null ? '—' : money(s.precioCompraCentimos)} · venta {s.precioVentaCentimos == null ? '—' : money(s.precioVentaCentimos)}</small><small>{s.resolucion === 'base_legacy' ? 'Saldo reconstruido: ingresos' : 'Histórico: ingresos'} {s.ingresosHistoricosCentimos == null ? 'Por conciliar' : money(s.ingresosHistoricosCentimos)} · costos {s.costosHistoricosCentimos == null ? 'Por conciliar' : money(s.costosHistoricosCentimos)} · renovaciones {s.resolucion === 'base_legacy' ? 'Desconocidas' : s.renovacionesHistoricas ?? 'Por conciliar'}</small>{s.historialOriginal && <details className="legacy-history"><summary>Ver historial del Excel</summary><pre>{s.historialOriginal}</pre></details>}</div><span className={`pill ${selected.archivadoEn ? 'neutral' : status(s.venceEl).className}`}>{selected.archivadoEn ? 'Retirado' : status(s.venceEl).text}</span><div className="detail-actions"><button className="secondary" disabled={busy || !!selected.archivadoEn} onClick={() => openEditClient(s)}>Editar datos</button><button className="secondary" disabled={busy || !!selected.archivadoEn} onClick={() => openDelivery(s)}>Entregar acceso</button><RenewalButton client={selected} subscription={s} /><button className="secondary" disabled={!!selected.archivadoEn} onClick={() => openRenew(s)}>Registrar renovación</button></div></div>)}</div></section>
          <section className="panel"><div className="panel-head"><div><h2>Movimientos recientes</h2><p>Cobros y costos posteriores a la migración.</p></div></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Método</th><th>Cobro</th><th>Costo</th><th>Margen</th></tr></thead><tbody>{selected.movimientos.map((m) => <tr key={m.id}><td>{m.fechaCobro}</td><td>{m.tipo}</td><td>{m.metodoPago || 'Sin dato'}</td><td>{money(m.ingresosCentimos)}</td><td>{money(m.costosCentimos)}</td><td>{money(m.ingresosCentimos - m.costosCentimos)}</td></tr>)}</tbody></table>{!selected.movimientos.length && <p className="empty">Sin movimientos nuevos.</p>}</div></section>
        </>}

        {view === 'cuentas' && <section className="panel"><div className="panel-head"><div><h2>Inventario de cuentas</h2><p>{accounts.filter((account) => account.estado !== 'retirada').length} cuentas activas agrupadas por plataforma.</p></div><button className="secondary" onClick={() => setShowRetiredAccounts(!showRetiredAccounts)}>{showRetiredAccounts ? 'Ver activas' : 'Ver retiradas'}</button></div><div className="account-groups">{accountGroups.map((group, index) => <details className="account-group" key={group.id} open={index === 0}><summary><span>{group.nombre}</span><span className="group-count">{group.items.length} {group.items.length === 1 ? 'cuenta' : 'cuentas'}</span></summary><div className="list">{group.items.map((a) => <div className="account-row" key={a.id}><span className="account-mark"><KeyRound size={18} /></span><div className="account-info"><strong>{a.identificador}</strong><small>{a.perfilesAsignados} perfiles · {a.capacidad == null ? 'Capacidad sin definir' : `${a.capacidad - a.perfilesAsignados} libres de ${a.capacidad}`} · {a.tieneCredencial === 0 ? 'Sin credenciales · ' : ''}Compra: {a.fechaCompra || 'Sin fecha'} · Vence: {a.venceEl || 'Sin fecha'}</small>{a.codigosUrl && <a href={a.codigosUrl} target="_blank" rel="noopener noreferrer" className="account-link">Abrir web de códigos ↗</a>}{a.nota && <p className="account-note">{a.nota}</p>}</div><span className={`pill ${a.estado === 'retirada' ? 'neutral' : accountStatus(a.venceEl).className}`}>{a.estado === 'retirada' ? 'Retirada' : accountStatus(a.venceEl).text}</span><button className="secondary" onClick={() => editAccount(a)}>Editar</button><button className="secondary" onClick={() => reveal(a.id)}>{revealed?.accountId === a.id ? <EyeOff size={16} /> : <Eye size={16} />}{revealed?.accountId === a.id ? 'Ocultar en 20 s' : 'Revelar'}</button><button className="secondary" disabled={busy} onClick={() => changeAccountArchive(a, a.estado !== 'retirada')}>{a.estado === 'retirada' ? 'Restaurar' : 'Retirar'}</button>{revealed?.accountId === a.id && <p className="revealed">Contraseña: <strong>{revealed.password}</strong>{revealed.codePassword && <> · Contraseña web de códigos: <strong>{revealed.codePassword}</strong></>}</p>}</div>)}</div></details>)}
            {!accountGroups.length && !loading && <p className="empty">{showRetiredAccounts ? 'No hay cuentas retiradas.' : 'No hay cuentas activas.'}</p>}</div></section>}
        {view === 'ajustes' && <div className="settings-grid"><section className="panel"><div className="panel-head"><div><h2>Preferencias y proveedor</h2><p>Valores migrados desde la hoja Configuración.</p></div></div>
          <form className="form" onSubmit={saveSettings}><Field label="Moneda de los importes migrados"><input value={settingsDraft.moneda} readOnly aria-describedby="currency-note" /></Field><p id="currency-note" className="form-note">Los importes están guardados en soles. Cambiar la etiqueta no convertiría las cifras.</p>
            <Field label="Prefijo de país por defecto"><input required pattern="\+\d{1,4}" maxLength="5" value={settingsDraft.prefijoDefecto} onChange={(event) => setSettingsDraft({ ...settingsDraft, prefijoDefecto: event.target.value })} /></Field>
            <Field label="Nombre o empresa del proveedor"><input maxLength="150" value={settingsDraft.proveedorNombre} onChange={(event) => setSettingsDraft({ ...settingsDraft, proveedorNombre: event.target.value })} /></Field>
            <Field label="Teléfono de soporte"><input maxLength="50" value={settingsDraft.proveedorTelefono} onChange={(event) => setSettingsDraft({ ...settingsDraft, proveedorTelefono: event.target.value })} /></Field>
            <h3>Condiciones por plataforma</h3><p className="form-note">Condiciones migradas del sistema anterior; el mensaje de entrega aún está pendiente.</p>
            {platforms.map((platform) => <details className="settings-condition" key={platform.id}><summary>{platform.nombre}</summary><Field label={`Condiciones de ${platform.nombre}`}><textarea rows="5" maxLength="4000" value={settingsDraft.condiciones?.[platform.nombre] || ''} onChange={(event) => setSettingsDraft({ ...settingsDraft, condiciones: { ...settingsDraft.condiciones, [platform.nombre]: event.target.value } })} /></Field></details>)}
            <button className="primary submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar ajustes'}</button></form></section>
          <section className="panel settings-side"><div className="panel-head"><div><h2>Plataformas</h2><p>{platforms.length} plataformas disponibles para cuentas y clientes.</p></div></div><form className="form" onSubmit={createPlatform}><Field label="Añadir plataforma"><input required maxLength="80" placeholder="Ej. Vix" value={newPlatformName} onChange={(event) => setNewPlatformName(event.target.value)} /></Field><button className="secondary" disabled={busy}>Añadir plataforma</button></form></section></div>}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Navegación móvil">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>

    {modal && <div className="overlay" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><h2 id="dialog-title">{modal === 'cliente' ? 'Nuevo cliente' : modal === 'editar-cliente' ? 'Editar cliente' : modal === 'entrega' ? 'Revisar entrega de acceso' : modal === 'cuenta' ? editingAccountId ? 'Editar cuenta' : 'Nueva cuenta' : `Renovar ${renewForm?.nombre}`}</h2><button className="icon-button" onClick={() => { setModal(null); clearPreparedDelivery(); setError(''); }} aria-label="Cerrar"><X size={19} /></button></div>
      {error && <div className="message error dialog-error" role="alert"><AlertCircle size={17} />{error}</div>}
      {modal === 'cliente' && <form onSubmit={saveClient} className="form"><Field label="Nombre"><input required maxLength="150" value={clientForm.nombre} onChange={(e) => setClientForm({ ...clientForm, nombre: e.target.value })} /></Field><div className="form-grid"><Field label="Prefijo"><input required value={clientForm.prefijo} onChange={(e) => setClientForm({ ...clientForm, prefijo: e.target.value })} /></Field><Field label="Teléfono"><input inputMode="tel" placeholder="+51 903 242 961" onBlur={() => { const contact = normalizePhone(clientForm.telefono, clientForm.prefijo); if (contact) setClientForm({ ...clientForm, ...contact, telefono: contact.telefono || '' }); }} value={clientForm.telefono} onChange={(e) => setClientForm({ ...clientForm, telefono: e.target.value })} /></Field></div><Field label="Plataforma"><select required value={clientForm.plataformaId} onChange={(e) => setClientForm({ ...clientForm, plataformaId: e.target.value, cuentaId: '' })}><option value="">Selecciona</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Field><Field label="Cuenta (opcional)"><select value={clientForm.cuentaId} onChange={(e) => setClientForm({ ...clientForm, cuentaId: e.target.value })}><option value="">Sin asignar</option>{accounts.filter((a) => a.estado === 'activa' && a.plataformaId === clientForm.plataformaId).map((a) => <option key={a.id} value={a.id}>{a.identificador}</option>)}</select></Field><div className="form-grid"><Field label="Perfil"><input value={clientForm.perfil} onChange={(e) => setClientForm({ ...clientForm, perfil: e.target.value })} /></Field><Field label="PIN"><input inputMode="numeric" value={clientForm.pin} onChange={(e) => setClientForm({ ...clientForm, pin: e.target.value })} /></Field></div><div className="form-grid"><Field label="Inicio"><input required type="date" value={clientForm.fechaInicio} onChange={(e) => setClientForm({ ...clientForm, fechaInicio: e.target.value })} /></Field><Field label="Vencimiento"><input required type="date" value={clientForm.venceEl} onChange={(e) => setClientForm({ ...clientForm, venceEl: e.target.value })} /></Field></div><div className="form-grid"><Field label="Cobro (S/)"><input required inputMode="decimal" value={clientForm.ingresos} onChange={(e) => setClientForm({ ...clientForm, ingresos: e.target.value })} /></Field><Field label="Costo (S/)"><input required inputMode="decimal" value={clientForm.costos} onChange={(e) => setClientForm({ ...clientForm, costos: e.target.value })} /></Field></div>{!clientForm.pendiente && <Field label="Método de pago"><select value={clientForm.metodoPago || 'Otro'} onChange={(e) => setClientForm({ ...clientForm, metodoPago: e.target.value })}>{['Yape','Plin','Transferencia','Efectivo','Otro'].map((m) => <option key={m}>{m}</option>)}</select></Field>}<label className="checkbox-field"><input type="checkbox" checked={!!clientForm.pendiente} onChange={(e) => setClientForm({ ...clientForm, pendiente: e.target.checked })} />Pago pendiente: registrar el importe como deuda</label><button className="primary submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cliente'}</button></form>}
      {modal === 'renovar' && <form onSubmit={saveRenew} className="form"><div className="form-grid"><Field label="Fecha de cobro"><input required type="date" value={renewForm.fechaCobro} onChange={(e) => setRenewForm({ ...renewForm, fechaCobro: e.target.value })} /></Field><Field label="Nuevo vencimiento"><input required type="date" value={renewForm.venceEl} onChange={(e) => setRenewForm({ ...renewForm, venceEl: e.target.value })} /></Field></div><div className="form-grid"><Field label="Cobro (S/)"><input required inputMode="decimal" value={renewForm.ingresos} onChange={(e) => setRenewForm({ ...renewForm, ingresos: e.target.value })} /></Field><Field label="Costo (S/)"><input required inputMode="decimal" value={renewForm.costos} onChange={(e) => setRenewForm({ ...renewForm, costos: e.target.value })} /></Field></div>{!renewForm.pendiente && <Field label="Método de pago"><select value={renewForm.metodoPago || 'Otro'} onChange={(e) => setRenewForm({ ...renewForm, metodoPago: e.target.value })}>{['Yape','Plin','Transferencia','Efectivo','Otro'].map((m) => <option key={m}>{m}</option>)}</select></Field>}<label className="checkbox-field"><input type="checkbox" checked={!!renewForm.pendiente} onChange={(e) => setRenewForm({ ...renewForm, pendiente: e.target.checked })} />Pago pendiente: registrar el importe como deuda</label><button className="primary submit" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar renovación'}</button></form>}
      {modal === 'cuenta' && <form onSubmit={saveAccount} className="form"><Field label="Plataforma"><select required disabled={!!editingAccountId} value={accountForm.plataformaId} onChange={(e) => setAccountForm({ ...accountForm, plataformaId: e.target.value })}><option value="">Selecciona</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Field><Field label="Correo o identificador"><input required disabled={!!editingAccountId} value={accountForm.identificador} onChange={(e) => setAccountForm({ ...accountForm, identificador: e.target.value })} /></Field><Field label={editingAccountId ? 'Nueva contraseña (opcional)' : 'Contraseña'}><input required={!editingAccountId} type="password" autoComplete="new-password" value={accountForm.contrasena} onChange={(e) => setAccountForm({ ...accountForm, contrasena: e.target.value })} /></Field><div className="form-grid"><Field label="Fecha de compra"><input required={!editingAccountId} type="date" value={accountForm.fechaCompra} onChange={(e) => setAccountForm({ ...accountForm, fechaCompra: e.target.value })} /></Field><Field label="Fecha de vencimiento"><input required={!editingAccountId} type="date" value={accountForm.venceEl} onChange={(e) => setAccountForm({ ...accountForm, venceEl: e.target.value })} /></Field></div><Field label="Web de códigos (URL)"><input type="url" placeholder="https://" maxLength="2048" value={accountForm.codigosUrl} onChange={(e) => setAccountForm({ ...accountForm, codigosUrl: e.target.value })} /></Field><Field label="Contraseña de la web de códigos"><input type="password" autoComplete="new-password" maxLength="500" value={accountForm.codigoPassword} onChange={(e) => setAccountForm({ ...accountForm, codigoPassword: e.target.value })} /></Field><Field label="Nota libre"><textarea maxLength="4000" rows="3" value={accountForm.nota} onChange={(e) => setAccountForm({ ...accountForm, nota: e.target.value })} /></Field><button className="primary submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cuenta'}</button></form>}
      {modal === 'editar-cliente' && editForm && <form onSubmit={saveEditClient} className="form"><p className="form-note">Los cobros y costos registrados se conservan como historial. Aquí puedes corregir datos del cliente, asignación y fechas.</p>
        <Field label="Nombre"><input required maxLength="150" value={editForm.nombre} onChange={(event) => setEditForm({ ...editForm, nombre: event.target.value })} /></Field>
        <div className="form-grid"><Field label="Prefijo"><input required value={editForm.prefijo} onChange={(event) => setEditForm({ ...editForm, prefijo: event.target.value })} /></Field><Field label="Teléfono"><input inputMode="tel" placeholder="+51 903 242 961" onBlur={() => { const contact = normalizePhone(editForm.telefono, editForm.prefijo); if (contact) setEditForm({ ...editForm, ...contact, telefono: contact.telefono || '' }); }} value={editForm.telefono} onChange={(event) => setEditForm({ ...editForm, telefono: event.target.value })} /></Field></div>
        <Field label="Plataforma"><select required value={editForm.plataformaId} onChange={(event) => setEditForm({ ...editForm, plataformaId: event.target.value, cuentaId: '' })}>{platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.nombre}</option>)}</select></Field>
        <Field label="Cuenta asignada"><select value={editForm.cuentaId} onChange={(event) => setEditForm({ ...editForm, cuentaId: event.target.value })}><option value="">Sin asignar</option>{accounts.filter((account) => account.estado === 'activa' && account.plataformaId === editForm.plataformaId).map((account) => <option key={account.id} value={account.id}>{account.identificador}</option>)}</select></Field>
        <div className="form-grid"><Field label="Perfil"><input maxLength="100" value={editForm.perfil} onChange={(event) => setEditForm({ ...editForm, perfil: event.target.value })} /></Field><Field label="Nuevo PIN (opcional)"><input inputMode="numeric" pattern="[0-9]*" maxLength="50" disabled={editForm.quitarPin} value={editForm.pin} onChange={(event) => setEditForm({ ...editForm, pin: event.target.value })} /></Field></div>
        <label className="checkbox-field"><input type="checkbox" checked={editForm.quitarPin} onChange={(event) => setEditForm({ ...editForm, quitarPin: event.target.checked, pin: '' })} />Quitar PIN actual</label>
        <div className="form-grid"><Field label="Fecha de inicio"><input type="date" value={editForm.fechaInicio} onChange={(event) => setEditForm({ ...editForm, fechaInicio: event.target.value })} /></Field><Field label="Vencimiento"><input required type="date" value={editForm.venceEl} onChange={(event) => setEditForm({ ...editForm, venceEl: event.target.value })} /></Field></div>
        <button className="primary submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></form>}
      {modal === 'entrega' && delivery && <div className="form"><p className="form-note">Revisa el número y el contenido antes de abrir WhatsApp. Este mensaje incluye contraseñas y, si existe, el PIN.</p><Field label="Número de destino"><input readOnly value={`+${delivery.telefono}`} /></Field><Field label="Mensaje preparado"><textarea readOnly rows="13" value={delivery.mensaje} /></Field><a className="primary submit" href={`https://api.whatsapp.com/send?phone=${delivery.telefono}&text=${encodeURIComponent(delivery.mensaje)}`} target="_blank" rel="noopener noreferrer" onClick={() => { clearPreparedDelivery(); setModal(null); }}>Abrir WhatsApp para enviar</a></div>}
    </div></div>}
  </div>;
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }

function Stat({ icon: Icon, label, value, tone = '', detail = '' }) { return <div className={`stat ${tone}`}><span className="stat-label">{label}<Icon size={17} /></span><strong>{value}</strong>{detail && <small className="stat-detail">{detail}</small>}</div>; }

function MonthlyChart({ months }) {
  if (!months.length) return <p className="empty">Cargando gráfica…</p>;
  const width = 720; const left = 67; const right = 18; const top = 26; const plotHeight = 180;
  const values = months.map((item) => item.margenCentimos);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const scale = (value) => top + (maximum - value) * plotHeight / (maximum - minimum);
  const baseline = scale(0);
  const step = (width - left - right) / months.length;
  const ticks = [minimum, (minimum + maximum) / 2, maximum];
  return <div className="monthly-chart"><svg viewBox="0 0 720 252" role="img" aria-label="Ganancia mensual de los últimos doce meses, en soles">
    {ticks.map((tick, index) => <g key={index}><line x1={left} x2={width - right} y1={scale(tick)} y2={scale(tick)} className="chart-gridline" /><text x={left - 9} y={scale(tick) + 4} textAnchor="end" className="chart-axis">{Math.round(tick / 100)}</text></g>)}
    <line x1={left} x2={width - right} y1={baseline} y2={baseline} className="chart-baseline" />
    {months.map((item, index) => {
      const barY = scale(item.margenCentimos);
      const x = left + index * step + step * 0.18;
      const label = `${item.mes.slice(5)}/${item.mes.slice(2, 4)}`;
      return <g key={item.mes}><rect x={x} y={Math.min(barY, baseline)} width={step * 0.64}
        height={Math.max(2, Math.abs(baseline - barY))} rx="5"
        className={item.margenCentimos < 0 ? 'chart-bar negative' : index === months.length - 1 ? 'chart-bar current' : 'chart-bar'}>
        <title>{item.mes}: {money(item.margenCentimos)}</title></rect>
        <text x={x + step * 0.32} y="234" textAnchor="middle" className="chart-axis">{label}</text></g>;
    })}
    <text x="8" y="16" className="chart-axis">S/</text>
  </svg><p className="chart-footnote">Pasa el cursor sobre una barra para ver el importe exacto.</p></div>;
}

function PlatformChart({ platforms }) {
  if (!platforms.length) return <p className="empty">Cargando gráfica…</p>;
  const maximum = Math.max(1, ...platforms.map((item) => item.suscripciones));
  return <div className="platform-chart"><ol>{platforms.map((item) => <li key={item.id}>
    <div className="platform-chart-label"><span>{item.nombre}</span><strong>{item.suscripciones}</strong></div>
    <div className="platform-track"><span style={{ width: `${100 * item.suscripciones / maximum}%` }} /></div>
  </li>)}</ol></div>;
}

function ClientRow({ client, onClick }) {
  const state = client.archivadoEn ? { text: 'Retirado', className: 'neutral' } : status(client.venceEl);
  return <button className="client-row" onClick={onClick}><span className="initials">{client.nombre?.slice(0, 2).toUpperCase()}</span><span className="client-name"><strong>{client.nombre}</strong><small>{client.plataforma || 'Sin suscripción'} · {client.prefijo} {client.telefono || 'Sin teléfono'}</small></span><span className="expires">{client.venceEl || '—'}</span><span className={`pill ${state.className}`}>{state.text}</span><ArrowRight size={17} className="row-arrow" /></button>;
}
