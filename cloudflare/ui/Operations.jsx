import { useEffect, useState } from 'react';

const tabs = [['vencimientos', 'Vencimientos'], ['cupos', 'Perfiles libres'], ['pagos', 'Pagos'], ['rentabilidad', 'Rentabilidad'], ['revision', 'Revisión de datos']];
const money = (n) => `S/ ${(Number(n || 0) / 100).toFixed(2)}`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const cents = (value) => /^\d+(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : NaN;
const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
const days = (date, now) => date ? Math.round((Date.parse(date) - Date.parse(now)) / 86400000) : null;
const buckets = ['Vencidos', 'Hoy', 'En 1 a 3 días', 'En 4 a 7 días', 'Sin fecha'];
const bucket = (date, now) => { const d = days(date, now); return d === null ? 'Sin fecha' : d < 0 ? 'Vencidos' : d === 0 ? 'Hoy' : d <= 3 ? 'En 1 a 3 días' : 'En 4 a 7 días'; };

export function Operations({ revision, api, onClient, onAccount, RenewalButton, onChanged }) {
  const [tab, setTab] = useState('vencimientos');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('Hoy'), [search, setSearch] = useState('');
  const [debt, setDebt] = useState({ suscripcionId: '', concepto: '', importe: '', fecha: today(), key: crypto.randomUUID() });
  const [payment, setPayment] = useState(null), [review, setReview] = useState(null);
  async function load() { setData(await api(`/operaciones/${tab}${tab === 'rentabilidad' ? `?mes=${month}` : ''}`)); }
  useEffect(() => {
    let active = true; setData(null); setError('');
    api(`/operaciones/${tab}${tab === 'rentabilidad' ? `?mes=${month}` : ''}`).then((value) => { if (active) setData(value); })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [tab, month, revision]);
  async function action(path, body, method = 'POST', key) {
    setBusy(true); setError('');
    try { await api(`/operaciones/${path}`, { method, body: JSON.stringify(body), headers: key ? { 'Idempotency-Key': key } : {} });
      await load(); await onChanged(); return true;
    } catch (cause) { setError(cause.message); return false; }
    finally { setBusy(false); }
  }
  return <div className="operations"><div className="operation-tabs" role="tablist">{tabs.map(([id, label]) =>
    <button role="tab" aria-selected={tab === id} className={tab === id ? 'primary' : 'secondary'} key={id} disabled={busy} onClick={() => { if (tab === id) return; setData(null); setTab(id); setPayment(null); setReview(null); }}>{label}</button>)}</div>
    {error && <div className="message error" role="alert">{error}</div>}
    {!data && !error && <p className="empty">Cargando…</p>}
    {data && tab === 'vencimientos' && <>
      <div className="operation-tabs">{buckets.map((name) => <button key={name} className={filter === name ? 'primary' : 'secondary'} onClick={() => setFilter(name)}>{name} ({[...data.clientes, ...data.cuentas].filter((r) => bucket(r.venceEl, data.fecha) === name).length})</button>)}</div>
      <div className="operations-grid">{[['clientes', 'Clientes'], ['cuentas', 'Cuentas proveedoras']].map(([type, label]) => <section className="panel" key={type}><div className="panel-head"><h2>{label} · {filter}</h2></div>
        {data[type].filter((r) => bucket(r.venceEl, data.fecha) === filter).map((r) => <div className="operation-row" key={r.suscripcionId || r.id}><div><strong>{r.nombre || r.identificador}</strong><small>{r.plataforma} · {r.venceEl || 'Sin fecha'}</small></div>
          {type === 'clientes' ? <><RenewalButton client={r} compact /><button className="secondary" onClick={() => onClient(r.id)}>Ver / renovar</button></>
            : <button className="secondary" onClick={() => onAccount(r.id)}>Editar / renovar cuenta</button>}</div>)}
        {!data[type].some((r) => bucket(r.venceEl, data.fecha) === filter) && <p className="empty">Sin registros en este grupo.</p>}</section>)}</div>
    </>}
    {data && tab === 'cupos' && <><p className="sub">Define la capacidad real de cada cuenta. Cada asignación ocupa un espacio hasta que la desasignes, aunque el cliente esté vencido o retirado.</p>
      <Field label="Buscar plataforma o cuenta"><input value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      {data.items.filter((r) => `${r.plataforma} ${r.identificador}`.toLowerCase().includes(search.toLowerCase())).map((r) => <section className="panel" key={r.id}><div className="panel-head"><div><h2>{r.plataforma} · {r.identificador}</h2><p>{r.ocupados} asignados · {r.capacidad === null ? 'Capacidad sin definir' : `${r.capacidad - r.ocupados} libres de ${r.capacidad}`}{!r.tieneCredencial && ' · Sin credenciales'}{r.estado !== 'activa' && ` · ${r.estado}`}</p></div><button className="secondary" onClick={() => onAccount(r.id)}>Editar cuenta</button></div>
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const value = new FormData(e.currentTarget).get('capacidad'); action(`cupos/${r.id}`, { capacidad: value === '' ? null : Number(value) }, 'PATCH'); }}><Field label="Capacidad"><input key={`${r.id}-${r.capacidad}`} name="capacidad" type="number" min={Math.max(1, r.ocupados)} max="1000" defaultValue={r.capacidad ?? ''} placeholder="Sin definir" /></Field><button className="secondary" disabled={busy}>Guardar capacidad</button></form>
        <details className="member-list"><summary>Ver quién ocupa los perfiles ({r.miembros.length})</summary>{r.miembros.map((m) => <button className="member" key={`${m.clienteId}-${m.perfil}-${m.venceEl}`} onClick={() => onClient(m.clienteId)}>{m.nombre} · {m.perfil || 'Sin perfil'} · {m.venceEl}{m.archivadoEn ? ' · Retirado' : ''}</button>)}</details></section>)}
    </>}
    {data && tab === 'pagos' && <>
      <section className="panel"><div className="panel-head"><div><h2>Pendiente de cobrar: {money(data.items.reduce((sum, d) => sum + d.importe_centimos - d.pagado, 0))}</h2><p>Los abonos suman ingresos una sola vez, en la fecha en que los recibes.</p></div></div>
        <details className="member-list"><summary>Registrar una deuda adicional</summary><p className="form-note">Úsalo para importes aún no registrados como cobrados. Las altas y renovaciones marcadas «Pago pendiente» ya aparecen aquí.</p>
          <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await action('pagos', { ...debt, importeCentimos: cents(debt.importe) }, 'POST', debt.key)) setDebt({ suscripcionId: '', concepto: '', importe: '', fecha: today(), key: crypto.randomUUID() }); }}>
            <Field label="Cliente y servicio"><select required value={debt.suscripcionId} onChange={(e) => setDebt({ ...debt, suscripcionId: e.target.value })}><option value="">Selecciona</option>{data.suscripciones.map((s) => <option value={s.id} key={s.id}>{s.nombre} · {s.plataforma}</option>)}</select></Field>
            <Field label="Concepto"><input required maxLength="200" value={debt.concepto} onChange={(e) => setDebt({ ...debt, concepto: e.target.value })} /></Field><div className="form-grid"><Field label="Importe (S/)"><input required inputMode="decimal" value={debt.importe} onChange={(e) => setDebt({ ...debt, importe: e.target.value })} /></Field><Field label="Fecha"><input required type="date" value={debt.fecha} onChange={(e) => setDebt({ ...debt, fecha: e.target.value })} /></Field></div><button className="primary" disabled={busy}>Registrar deuda</button>
          </form></details></section>
      {data.items.map((d) => <section className="panel" key={d.id}><div className="panel-head"><div><h2>{d.nombre} · {d.plataforma}</h2><p>{d.concepto} · Total {money(d.importe_centimos)} · Abonado {money(d.pagado)}</p><strong>{d.pagado === d.importe_centimos ? 'Pagado' : `Falta ${money(d.importe_centimos - d.pagado)}`}</strong></div>{d.pagado < d.importe_centimos && <button className="primary" onClick={() => setPayment({ id: d.id, importe: ((d.importe_centimos - d.pagado) / 100).toFixed(2), fecha: today(), metodo: 'Yape', key: crypto.randomUUID() })}>Registrar abono</button>}</div>
        {payment?.id === d.id && <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await action(`pagos/${d.id}/abonos`, { importeCentimos: cents(payment.importe), fecha: payment.fecha, metodo: payment.metodo }, 'POST', payment.key)) setPayment(null); }}><div className="form-grid"><Field label="Abono (S/)"><input required value={payment.importe} onChange={(e) => setPayment({ ...payment, importe: e.target.value })} /></Field><Field label="Fecha del abono"><input required type="date" value={payment.fecha} onChange={(e) => setPayment({ ...payment, fecha: e.target.value })} /></Field></div><Field label="Método"><select value={payment.metodo} onChange={(e) => setPayment({ ...payment, metodo: e.target.value })}>{['Yape', 'Plin', 'Transferencia', 'Efectivo', 'Otro'].map((m) => <option key={m}>{m}</option>)}</select></Field><button className="primary" disabled={busy}>Guardar abono</button></form>}
        {data.abonos.filter((a) => a.deuda_id === d.id).map((a) => <div className="operation-row" key={a.id}>{a.fecha} · {a.metodo} · {money(a.importe_centimos)}</div>)}</section>)}
      {!data.items.length && <p className="empty">No hay deudas registradas.</p>}
    </>}
    {data && tab === 'rentabilidad' && <section className="panel"><div className="panel-head"><div><h2>Rentabilidad por plataforma</h2><p>Ventas importadas y movimientos del mes, con el mismo criterio del resumen. Los abonos se cuentan al cobrarse.</p></div><Field label="Mes"><input type="month" value={month} onChange={(e) => { setData(null); setMonth(e.target.value); }} /></Field></div>
      <div className="table-wrap"><table><thead><tr><th>Plataforma</th><th>Ingresos</th><th>Costos</th><th>Ganancia</th><th>Registros</th></tr></thead><tbody>{data.items.map((r) => <tr key={r.nombre}><td>{r.nombre}{r.incompletos > 0 && <small> · {r.incompletos} incompletos</small>}</td><td>{money(r.ingresos)}</td><td>{money(r.costos)}</td><td>{r.incompletos ? 'Por conciliar' : money(r.ingresos - r.costos)}</td><td>{r.registros}</td></tr>)}</tbody></table></div>
      <div className="profit-bars">{data.items.filter((r) => r.registros && !r.incompletos).map((r) => <div key={r.nombre}><span>{r.nombre} · {money(r.ingresos - r.costos)}</span><meter min={Math.min(0, ...data.items.map((x) => x.ingresos - x.costos))} max={Math.max(1, ...data.items.map((x) => x.ingresos - x.costos))} value={r.ingresos - r.costos} /></div>)}</div></section>}
    {data && tab === 'revision' && <>
      <section className="panel"><div className="panel-head"><div><h2>Revisión de la migración</h2><p>{data.saldos.filter((r) => r.estado_revision === 'pendiente').length} saldos pendientes · {data.referencias.length} referencias sin vincular · {data.sinCredenciales.length} cuentas sin credenciales</p></div></div><p className="review-note">Los saldos reconstruidos reproducen el cálculo de la app anterior; no prueban el historial completo. Las filas originales del Excel se conservan en el respaldo.</p></section>
      {data.sinCredenciales.length > 0 && <section className="panel"><div className="panel-head"><h2>Completar contraseñas de cuentas reconstruidas</h2></div>{data.sinCredenciales.map((a) => <div className="operation-row" key={a.id}><div><strong>{a.plataforma}</strong><small>{a.identificador}</small></div><button className="secondary" onClick={() => onAccount(a.id)}>Añadir contraseña</button></div>)}</section>}
      {data.referencias.map((r) => <div className="panel operation-row" key={r.id}>{r.nombre} · {r.plataforma} · {r.legacy_cuenta}<button className="secondary" onClick={() => onClient(r.clienteId)}>Vincular cuenta</button></div>)}
      {data.saldos.map((r) => <section className="panel" key={r.suscripcion_id}><div className="panel-head"><div><h2>{r.nombre} · {r.plataforma}</h2><p>{r.resolucion === 'base_legacy' ? 'Saldo reconstruido de la app anterior' : r.estado_revision === 'pendiente' ? 'Pendiente' : 'Conciliado con evidencia'} · Ingresos {r.ingresos_centimos === null ? 'Sin dato' : money(r.ingresos_centimos)} · Costos {r.costos_centimos === null ? 'Sin dato' : money(r.costos_centimos)}</p></div><button className="secondary" onClick={() => setReview({ id: r.suscripcion_id, ingresos: r.ingresos_centimos === null ? '' : (r.ingresos_centimos / 100).toFixed(2), costos: r.costos_centimos === null ? '' : (r.costos_centimos / 100).toFixed(2), renovaciones: r.resolucion === 'base_legacy' ? '' : r.renovaciones ?? '', evidencia: '' })}>Confirmar con datos reales</button></div><p className="review-note">{r.evidencia || 'Faltan datos en el Excel.'}</p>
        {review?.id === r.suscripcion_id && <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await action(`revision/${r.suscripcion_id}`, { ingresos: cents(review.ingresos), costos: cents(review.costos), renovaciones: Number(review.renovaciones), evidencia: review.evidencia }, 'PATCH')) setReview(null); }}><div className="form-grid"><Field label="Ingresos acumulados (S/)"><input required value={review.ingresos} onChange={(e) => setReview({ ...review, ingresos: e.target.value })} /></Field><Field label="Costos acumulados (S/)"><input required value={review.costos} onChange={(e) => setReview({ ...review, costos: e.target.value })} /></Field></div><Field label="Renovaciones confirmadas"><input required type="number" min="0" value={review.renovaciones} onChange={(e) => setReview({ ...review, renovaciones: e.target.value })} /></Field><Field label="Fuente o comprobante de los datos"><textarea required maxLength="2000" value={review.evidencia} onChange={(e) => setReview({ ...review, evidencia: e.target.value })} /></Field><button className="primary" disabled={busy}>Guardar conciliación</button></form>}</section>)}
    </>}
  </div>;
}

export function Security({ api, onLogout, demo }) {
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [repeat, setRepeat] = useState('');
  const [passphrase, setPassphrase] = useState(''), [backupRepeat, setBackupRepeat] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function run(path, body, download = false) {
    if (demo) return setNotice('Las acciones de seguridad están disponibles al iniciar sesión en la aplicación real.');
    setBusy(true); setNotice('');
    try {
      const result = await api(`/operaciones/${path}`, { method: 'POST', body: JSON.stringify(body) });
      if (download) {
        const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: 'application/json' }));
        link.href = url; link.download = `dorostream-${today()}.backup.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        setPassphrase(''); setBackupRepeat(''); setNotice('Respaldo descargado. Guarda su clave para poder recuperarlo.');
      } else { setCurrent(''); setNext(''); setRepeat(''); await onLogout(); }
    } catch (cause) { setNotice(cause.message); }
    finally { setBusy(false); }
  }
  return <section className="panel security-panel"><div className="panel-head"><h2>Seguridad y respaldo</h2></div>{notice && <p className="review-note" role="status">{notice}</p>}
    <form className="form" onSubmit={(e) => { e.preventDefault(); if (next !== repeat) return setNotice('Las contraseñas nuevas no coinciden.'); run('password', { currentPassword: current, newPassword: next }); }}>
      <Field label="Contraseña actual"><input required type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field><div className="form-grid"><Field label="Nueva contraseña"><input required type="password" autoComplete="new-password" minLength="6" maxLength="200" value={next} onChange={(e) => setNext(e.target.value)} /></Field><Field label="Repite la nueva contraseña"><input required type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></Field></div><p className="form-note">Cambiar la contraseña cierra todas las sesiones. Después entrarás con la nueva.</p><button className="primary" disabled={busy}>Cambiar contraseña</button>
      <button className="secondary" type="button" disabled={busy} onClick={() => { if (window.confirm('¿Cerrar todas las sesiones, incluida esta?')) run('cerrar-sesiones', {}); }}>Cerrar todas las sesiones</button></form>
    <form className="form" onSubmit={(e) => { e.preventDefault(); if (passphrase !== backupRepeat) return setNotice('Las claves del respaldo no coinciden.'); run('respaldo', { passphrase }, true); }}><h3>Descargar respaldo cifrado</h3><p className="form-note">Incluye clientes, cuentas, historial, pagos y el Excel original. Para recuperarlo necesitas el archivo y esta clave. La clave del respaldo no cambia tu contraseña de entrada.</p><Field label="Clave para este respaldo (mínimo 12 caracteres)"><input required type="password" minLength="12" maxLength="200" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></Field><Field label="Repite la clave del respaldo"><input required type="password" autoComplete="new-password" value={backupRepeat} onChange={(e) => setBackupRepeat(e.target.value)} /></Field><button className="secondary" disabled={busy}>{busy ? 'Procesando…' : 'Descargar respaldo'}</button></form>
  </section>;
}
