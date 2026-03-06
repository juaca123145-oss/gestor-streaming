import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, Plus, MessageCircle, Trash2, CalendarDays, MonitorPlay, 
  Phone, Pencil, Loader2, Home, UserPlus, FolderOpen, KeyRound, 
  ChevronLeft, Lock, Copy, ArrowLeft, Settings, X, Globe, DollarSign, Save,
  Search, Send, FileText
} from 'lucide-react';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzvRVGHXL-qVswcXn8QTyAQxdUjcojd7WPReX_ABQtMVLeUWxkH5EPnCjUd_BZdZxA/exec';

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [clients, setClients] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  
  const [editingId, setEditingId] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  
  // Estado para el buscador
  const [searchTerm, setSearchTerm] = useState('');
  
  // ================= CONFIGURACIONES GLOBALES =================
  const prefijos = [
    { code: '+54', country: 'Argentina' }, { code: '+501', country: 'Belice' },
    { code: '+591', country: 'Bolivia' }, { code: '+55', country: 'Brasil' },
    { code: '+1', country: 'Canadá' }, { code: '+56', country: 'Chile' },
    { code: '+57', country: 'Colombia' }, { code: '+506', country: 'Costa Rica' },
    { code: '+53', country: 'Cuba' }, { code: '+593', country: 'Ecuador' },
    { code: '+503', country: 'El Salvador' }, { code: '+1', country: 'Estados Unidos' },
    { code: '+502', country: 'Guatemala' }, { code: '+504', country: 'Honduras' },
    { code: '+52', country: 'México' }, { code: '+505', country: 'Nicaragua' },
    { code: '+507', country: 'Panamá' }, { code: '+595', country: 'Paraguay' },
    { code: '+51', country: 'Perú' }, { code: '+1', country: 'Puerto Rico' },
    { code: '+1', country: 'Rep. Dominicana' }, { code: '+598', country: 'Uruguay' },
    { code: '+58', country: 'Venezuela' }
  ];

  const defaultConditionStr = "Reglas del servicio:📵 Usar en un dispositivo. 📵 No eliminar los perfiles.📵 No tocar el plan de pago. 📵 No cambiar el acceso.📵 No modificar nada sin avisar.📵 No forzar la contraseña si no ingresa, comunicar de inmediato. ⭕ Si desea continuar con el mismo perfil avisar un día antes que cumpla los 30 dias.📝 Si incumple se detectará y perderá la garantía. ❌ En caso de algún inconveniente la solución se dará entre 1 a 24 horas en el peor de los casos, de presentarse una caída masiva y no se pueda solucionar dentro de las 24 horas, al día siguiente se procederá a reembolsar en su Billetera el saldo pendiente.";

  // Estados iniciales temporales (se sobreescriben al cargar de Sheets)
  const [plataformas, setPlataformas] = useState(['Netflix', 'Disney+', 'Max', 'Prime Video', 'Spotify', 'YouTube Premium', 'Crunchyroll', 'Otro']);
  const [currency, setCurrency] = useState('S/.');
  const [defaultPrefix, setDefaultPrefix] = useState('+51');
  const [newPlatformName, setNewPlatformName] = useState('');
  
  // Nuevos estados para condiciones y proveedor
  const [providerName, setProviderName] = useState('valezka_rondon');
  const [providerPhone, setProviderPhone] = useState('+ 51903242961');
  const [platformConditions, setPlatformConditions] = useState({});
  const [editingPlatformCondition, setEditingPlatformCondition] = useState('Netflix');

  // ================= ESTADOS DE FORMULARIOS =================
  const [formData, setFormData] = useState({
    nombre: '', prefijo: defaultPrefix, telefono: '', plataforma: plataformas[0] || 'Netflix', 
    cuenta: '', pin: '', precioCompra: '', precioVenta: '', 
    diaCompra: '', diaExpiracion: ''
  });

  const [newAccountData, setNewAccountData] = useState({ plataforma: plataformas[0] || 'Netflix', correo: '', contrasena: '' });

  // Cargar datos de Google Sheets (incluyendo Configuración)
  useEffect(() => {
    fetch(SCRIPT_URL)
      .then(res => res.json())
      .then(data => {
        if (data.clients) setClients(data.clients);
        if (data.accounts) setAccounts(data.accounts);
        
        // Cargar ajustes desde Sheets
        if (data.settings && Object.keys(data.settings).length > 0) {
          const loadedPlat = data.settings.plataformas ? JSON.parse(data.settings.plataformas) : plataformas;
          const loadedCurr = data.settings.moneda || currency;
          const loadedPref = data.settings.prefijo_defecto || defaultPrefix;
          const loadedProvName = data.settings.proveedor_nombre || providerName;
          const loadedProvPhone = data.settings.proveedor_telefono || providerPhone;
          const loadedConds = data.settings.condiciones_plataformas ? JSON.parse(data.settings.condiciones_plataformas) : {};
          
          setPlataformas(loadedPlat);
          setCurrency(loadedCurr);
          setDefaultPrefix(loadedPref);
          setProviderName(loadedProvName);
          setProviderPhone(loadedProvPhone);
          setPlatformConditions(loadedConds);
          setEditingPlatformCondition(loadedPlat[0] || 'Netflix');
          
          setFormData(prev => ({
            ...prev,
            prefijo: loadedPref,
            plataforma: prev.plataforma === 'Netflix' && loadedPlat.length > 0 ? loadedPlat[0] : prev.plataforma
          }));
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Error cargando datos:", error);
        setIsLoading(false);
      });
  }, []);

  // Guardar Configuraciones en la Nube
  const handleSaveSettings = async () => {
    setIsSavingConfig(true);
    
    const settingsData = {
      plataformas: JSON.stringify(plataformas),
      moneda: currency,
      prefijo_defecto: defaultPrefix,
      proveedor_nombre: providerName,
      proveedor_telefono: providerPhone,
      condiciones_plataformas: JSON.stringify(platformConditions)
    };

    try {
      await fetch(SCRIPT_URL, { 
        method: 'POST', mode: 'no-cors', 
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save_settings', data: settingsData }) 
      });
      alert("¡Ajustes guardados en la nube con éxito!");
    } catch (error) { 
      console.error("Error guardando ajustes:", error);
      alert("Hubo un error al guardar los ajustes.");
    }
    
    setIsSavingConfig(false);
  };

  // ================= UTILIDADES =================
  const copyToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert("¡Datos copiados al portapapeles!");
    } catch (err) {
      console.error('Error al copiar', err);
    }
    document.body.removeChild(textArea);
  };

  const calcularDiasRestantes = (fechaExpiracion) => {
    if (!fechaExpiracion) return 0;
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const expDate = new Date(String(fechaExpiracion).split('T')[0] + 'T00:00:00');
    return Math.ceil((expDate.getTime() - hoy.getTime()) / (1000 * 3600 * 24));
  };

  const getDaysBadgeColor = (dias) => {
    if (dias < 0) return 'bg-red-100 text-red-800 border-red-200';
    if (dias <= 3) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (dias <= 7) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };

  const stats = useMemo(() => {
    return {
      activos: clients.filter(c => calcularDiasRestantes(c.diaExpiracion) >= 0).length,
      ganancia: clients.reduce((acc, c) => acc + (c.precioVenta - c.precioCompra), 0),
      total: clients.length
    };
  }, [clients]);

  // ================= ACCIONES DE CLIENTES =================
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if (name === 'diaCompra' && value) {
        const fechaCompra = new Date(value + 'T00:00:00');
        fechaCompra.setMonth(fechaCompra.getMonth() + 1);
        newData.diaExpiracion = fechaCompra.toISOString().split('T')[0];
      }
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const clientData = {
      ...formData,
      id: editingId || crypto.randomUUID(),
      precioCompra: parseFloat(formData.precioCompra) || 0,
      precioVenta: parseFloat(formData.precioVenta) || 0,
    };

    if (editingId) {
      setClients(clients.map(c => c.id === editingId ? clientData : c));
      setEditingId(null);
      setCurrentView('directory');
    } else {
      setClients([...clients, clientData]);
      alert("¡Cliente registrado con éxito!");
    }
    
    try {
      await fetch(SCRIPT_URL, { 
        method: 'POST', mode: 'no-cors', 
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save_client', data: clientData }) 
      });
    } catch (error) { console.error("Error guardando cliente:", error); }
    
    if (!editingId) {
      setFormData({
        nombre: '', prefijo: defaultPrefix, telefono: '',
        plataforma: formData.plataforma, cuenta: formData.cuenta, pin: '',
        precioCompra: '', precioVenta: '', diaCompra: '', diaExpiracion: ''
      });
    }
  };

  const handleEdit = (client) => {
    setFormData({
      ...client,
      diaCompra: client.diaCompra ? String(client.diaCompra).split('T')[0] : '',
      diaExpiracion: client.diaExpiracion ? String(client.diaExpiracion).split('T')[0] : ''
    });
    setEditingId(client.id);
    setCurrentView('add');
    setSelectedAccount(null);
  };

  const cancelEdit = () => {
    setFormData({
      nombre: '', prefijo: defaultPrefix, telefono: '', plataforma: plataformas[0] || 'Netflix', cuenta: '', pin: '',
      precioCompra: '', precioVenta: '', diaCompra: '', diaExpiracion: ''
    });
    setEditingId(null);
    setCurrentView('directory');
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este cliente?")) return;
    setClients(clients.filter(client => client.id !== id));
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete_client', data: { id: id } })
      });
    } catch (error) { console.error("Error eliminando cliente:", error); }
  };

  // Botón: Avisar Vencimiento
  const sendWhatsApp = (client) => {
    if (!client.telefono) return alert("Este cliente no tiene teléfono.");
    
    let numero = (String(client.prefijo || defaultPrefix) + String(client.telefono)).replace(/\D/g, '');
    const fechaLimpia = client.diaExpiracion ? String(client.diaExpiracion).split('T')[0] : '';
    const dias = calcularDiasRestantes(client.diaExpiracion);
    
    let fraseVencimiento = dias > 1 ? `vence en *${dias} días* (${fechaLimpia})` : 
                           dias === 1 ? `vence *mañana* (${fechaLimpia})` : 
                           dias === 0 ? `vence *hoy* (${fechaLimpia})` : 
                           `*venció* hace *${Math.abs(dias)} días* (${fechaLimpia})`;
                           
    const textoPin = client.pin ? `, PIN: *${client.pin}*` : '';
    const mensaje = `¡Hola ${client.nombre}! 🎬 Te escribo para recordarte que tu suscripción de *${client.plataforma}* (Cuenta: ${client.cuenta}${textoPin}) ${fraseVencimiento}. ¿Deseas renovar tu servicio con nosotros para no perder el acceso? ¡Quedo atento/a!`;
    window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer');
  };

  // Botón: Enviar Credenciales y Condiciones
  const sendConditionsWhatsApp = (client) => {
    if (!client.telefono) return alert("Este cliente no tiene teléfono registrado.");
    
    // Buscar la contraseña de la cuenta maestra
    const cuentaAsociada = accounts.find(a => a.correo === client.cuenta);
    const password = cuentaAsociada?.contrasena ? cuentaAsociada.contrasena : '';
    
    let numero = (String(client.prefijo || defaultPrefix) + String(client.telefono)).replace(/\D/g, '');
    const dias = calcularDiasRestantes(client.diaExpiracion);
    const condicionActual = platformConditions[client.plataforma] || defaultConditionStr;
    const fechaCompraLimpia = client.diaCompra ? String(client.diaCompra).split('T')[0] : '';
    const fechaExpLimpia = client.diaExpiracion ? String(client.diaExpiracion).split('T')[0] : '';

    const mensaje = `*${client.plataforma}* 📌\n` +
      `Correo: ${client.cuenta || ''}\n` +
      `Contraseña: ${password}\n` +
      `Perfil/usuario: ${client.nombre}\n` +
      `PIN: ${client.pin || ''}\n` +
      `⏳ Contratado: ${dias} días restantes\n` +
      `🗓 Compra: ${fechaCompraLimpia}\n` +
      `🗓 Vencimiento: ${fechaExpLimpia}\n\n` +
      `⚠️ *Condiciones de uso:*\n${condicionActual}\n\n` +
      `👤 Proveedor: ${providerName}\n` +
      `📞 Teléfono: ${providerPhone}\n` +
      `🎬🍿🎬🍿🎬🍿🎬🍿🎬🍿🎬\n` +
      `¡¡Muchas gracias por su compra!!`;

    window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer');
  };

  // ================= ACCIONES DE CUENTAS MAESTRAS =================
  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!newAccountData.correo) return alert("Ingresa un correo o identificador de cuenta.");
    
    const accData = { ...newAccountData, id: crypto.randomUUID() };
    setAccounts([...accounts, accData]);
    
    try {
      await fetch(SCRIPT_URL, { 
        method: 'POST', mode: 'no-cors', 
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save_account', data: accData }) 
      });
    } catch (error) { console.error("Error guardando cuenta:", error); }
    
    setNewAccountData({ plataforma: plataformas[0] || 'Netflix', correo: '', contrasena: '' });
    setShowAddAccount(false);
  };

  const handleDeleteAccount = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta cuenta maestra? Los clientes asociados NO se borrarán, pero perderán su vínculo.")) return;
    setAccounts(accounts.filter(a => a.id !== id));
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete_account', data: { id: id } })
      });
    } catch (error) { console.error("Error eliminando cuenta:", error); }
  };

  // ================= VISTAS =================
  const renderHome = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center">
          <p className="text-sm text-slate-500 font-bold uppercase">Clientes</p>
          <p className="text-4xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex flex-col items-center">
          <p className="text-sm text-indigo-600 font-bold uppercase">Perfiles Activos</p>
          <p className="text-4xl font-bold text-indigo-900">{stats.activos}</p>
        </div>
        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 flex flex-col items-center col-span-2 md:col-span-1">
          <p className="text-sm text-emerald-600 font-bold uppercase">Ganancia Est.</p>
          <p className="text-4xl font-bold text-emerald-900">{currency} {stats.ganancia.toFixed(2)}</p>
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-800 mb-4 mt-8">Navegación</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button onClick={() => { setCurrentView('accounts'); setSelectedAccount(null); }} className="group bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-purple-300 transition-all flex flex-col items-center text-center gap-4">
          <div className="bg-purple-100 p-4 rounded-full group-hover:bg-purple-600 group-hover:text-white text-purple-600"><KeyRound className="w-8 h-8" /></div>
          <div><h3 className="text-lg font-bold text-slate-800">Cuentas</h3><p className="text-xs text-slate-500 mt-1">Tus correos principales.</p></div>
        </button>
        <button onClick={() => { setEditingId(null); setCurrentView('add'); }} className="group bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-indigo-300 transition-all flex flex-col items-center text-center gap-4">
          <div className="bg-indigo-100 p-4 rounded-full group-hover:bg-indigo-600 group-hover:text-white text-indigo-600"><UserPlus className="w-8 h-8" /></div>
          <div><h3 className="text-lg font-bold text-slate-800">Vender</h3><p className="text-xs text-slate-500 mt-1">Asigna perfiles nuevos.</p></div>
        </button>
        <button onClick={() => setCurrentView('directory')} className="group bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-blue-300 transition-all flex flex-col items-center text-center gap-4">
          <div className="bg-blue-100 p-4 rounded-full group-hover:bg-blue-600 group-hover:text-white text-blue-600"><FolderOpen className="w-8 h-8" /></div>
          <div><h3 className="text-lg font-bold text-slate-800">Directorio</h3><p className="text-xs text-slate-500 mt-1">Cobros y WhatsApp.</p></div>
        </button>
        <button onClick={() => setCurrentView('settings')} className="group bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-slate-400 transition-all flex flex-col items-center text-center gap-4">
          <div className="bg-slate-100 p-4 rounded-full group-hover:bg-slate-600 group-hover:text-white text-slate-600"><Settings className="w-8 h-8" /></div>
          <div><h3 className="text-lg font-bold text-slate-800">Ajustes</h3><p className="text-xs text-slate-500 mt-1">Reglas, Moneda y +.</p></div>
        </button>
      </div>
    </div>
  );

  const renderAdd = () => (
    <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in zoom-in-95 duration-300">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-slate-800">
        {editingId ? <Pencil className="w-6 h-6 text-indigo-500" /> : <UserPlus className="w-6 h-6 text-indigo-500" />}
        {editingId ? 'Editar Cliente / Perfil' : 'Registrar Venta de Perfil'}
      </h2>
      
      {accounts.length === 0 && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl text-sm font-medium flex items-start gap-2">
          No tienes cuentas maestras guardadas. Puedes añadirlas en la pestaña "Cuentas" o ingresar el correo manualmente aquí abajo.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <h3 className="text-sm font-bold text-slate-500 uppercase">1. Datos del Cliente</h3>
          <div><label className="block text-sm font-medium mb-1">Nombre Completo</label><input type="text" name="nombre" value={formData.nombre} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp</label>
            <div className="flex gap-2">
              <select name="prefijo" value={formData.prefijo} onChange={handleChange} className="w-1/3 px-2 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                {prefijos.map(p => <option key={p.country} value={p.code}>{p.code}</option>)}
              </select>
              <input type="text" name="telefono" value={formData.telefono} onChange={handleChange} className="w-2/3 px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <h3 className="text-sm font-bold text-slate-500 uppercase">2. Asignación de Cuenta y PIN</h3>
          
          <div>
            <label className="block text-sm font-medium mb-1">Cuenta / Correo Asociado</label>
            <div className="space-y-2">
              <select 
                onChange={(e) => {
                  const selectedAcc = accounts.find(a => a.correo === e.target.value);
                  setFormData(prev => ({ 
                    ...prev, 
                    cuenta: e.target.value, 
                    plataforma: selectedAcc ? selectedAcc.plataforma : prev.plataforma 
                  }));
                }}
                value={accounts.some(a => a.correo === formData.cuenta) ? formData.cuenta : ""}
                className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm text-slate-600"
              >
                <option value="">-- Ingresar manualmente --</option>
                {accounts.map(acc => <option key={acc.id} value={acc.correo}>{acc.plataforma} - {acc.correo}</option>)}
              </select>
              
              <input 
                type="text" 
                name="cuenta" 
                value={formData.cuenta} 
                onChange={handleChange} 
                placeholder="Escribe el correo manualmente..." 
                className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">PIN del Perfil</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input type="text" name="pin" value={formData.pin} onChange={handleChange} className="w-full pl-9 pr-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. 1234" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Plataforma</label>
              <select name="plataforma" value={formData.plataforma} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                {plataformas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Costo</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 font-bold">{currency}</span>
                <input type="number" step="0.01" name="precioCompra" value={formData.precioCompra} onChange={handleChange} className="w-full pl-10 pr-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cobro</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 font-bold">{currency}</span>
                <input type="number" step="0.01" name="precioVenta" value={formData.precioVenta} onChange={handleChange} className="w-full pl-10 pr-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <h3 className="text-sm font-bold text-slate-500 uppercase">3. Fechas</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Día de Compra</label><input type="date" name="diaCompra" value={formData.diaCompra} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border outline-none" /></div>
            <div><label className="block text-sm font-medium mb-1">Día de Expiración</label><input type="date" name="diaExpiracion" value={formData.diaExpiracion} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border outline-none" /></div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2">
            <Plus className="w-5 h-5" /> {editingId ? 'Actualizar Cliente' : 'Guardar Venta'}
          </button>
          {editingId && <button type="button" onClick={cancelEdit} className="px-6 py-3 bg-white border rounded-xl font-bold text-slate-600">Cancelar</button>}
        </div>
      </form>
    </div>
  );

  const renderDirectory = () => {
    // Filtrar clientes basados en la búsqueda
    const filteredClients = clients.filter(client => {
      const searchLower = searchTerm.toLowerCase();
      const fullName = (client.nombre || '').toLowerCase();
      const fullPhone = `${client.prefijo || ''}${client.telefono || ''}`.toLowerCase();
      
      return fullName.includes(searchLower) || fullPhone.includes(searchLower);
    });

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="p-6 border-b bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FolderOpen className="text-indigo-500" /> Directorio
          </h2>
          {/* BARRA DE BÚSQUEDA */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por nombre o teléfono..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          {filteredClients.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              No se encontraron clientes que coincidan con tu búsqueda.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white text-slate-500 text-xs uppercase border-b">
                  <th className="px-6 py-4 whitespace-nowrap">Cliente</th>
                  <th className="px-6 py-4 whitespace-nowrap">Servicio & PIN</th>
                  <th className="px-6 py-4 whitespace-nowrap">Fechas</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map(client => (
                  <tr key={client.id} className="hover:bg-slate-50 group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{client.nombre}</div>
                      <div className="text-sm text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3"/> {client.prefijo} {client.telefono}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-700 mb-1">{client.plataforma}</div>
                      <div className="text-sm text-slate-600 truncate max-w-[200px]">{client.cuenta}</div>
                      {client.pin && <div className="text-xs text-indigo-600 font-bold mt-1 bg-indigo-50 inline-block px-2 py-0.5 rounded border border-indigo-100"><Lock className="w-3 h-3 inline mr-1 -mt-0.5"/>PIN: {client.pin}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${getDaysBadgeColor(calcularDiasRestantes(client.diaExpiracion))}`}>{calcularDiasRestantes(client.diaExpiracion)} días</div>
                      <div className="text-xs text-slate-400 mt-2 flex items-center gap-1"><CalendarDays className="w-3 h-3"/> Expira: {client.diaExpiracion ? String(client.diaExpiracion).split('T')[0] : 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => sendConditionsWhatsApp(client)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg" title="Enviar Cuenta y Condiciones">
                          <Send className="w-4 h-4"/>
                        </button>
                        <button onClick={() => sendWhatsApp(client)} className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg" title="Recordatorio de Vencimiento">
                          <MessageCircle className="w-4 h-4"/>
                        </button>
                        <button onClick={() => handleEdit(client)} className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg" title="Editar">
                          <Pencil className="w-4 h-4"/>
                        </button>
                        <button onClick={() => handleDelete(client.id)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg" title="Eliminar">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  const renderAccounts = () => {
    if (selectedAccount) {
      const perfilesAsociados = clients.filter(c => c.cuenta === selectedAccount.correo);
      return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <button onClick={() => setSelectedAccount(null)} className="flex items-center gap-2 text-purple-600 font-bold hover:text-purple-800 transition-colors">
            <ArrowLeft className="w-5 h-5" /> Volver al listado de cuentas
          </button>

          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-6 md:p-8 rounded-2xl shadow-sm border border-purple-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="inline-block px-3 py-1 bg-white text-purple-700 text-xs font-bold rounded shadow-sm mb-3">{selectedAccount.plataforma}</span>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><KeyRound className="w-6 h-6 text-purple-500" /> Detalles de la Cuenta</h2>
              </div>
              <button onClick={() => copyToClipboard(`Plataforma: ${selectedAccount.plataforma}\nCorreo: ${selectedAccount.correo}\nContraseña: ${selectedAccount.contrasena || 'No registrada'}`)} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm">
                <Copy className="w-4 h-4" /> Copiar Datos
              </button>
            </div>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-white">
                <p className="text-sm text-slate-500 font-bold mb-1">Correo Electrónico</p>
                <p className="font-medium text-slate-800">{selectedAccount.correo}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-white">
                <p className="text-sm text-slate-500 font-bold mb-1">Contraseña</p>
                <p className="font-medium text-slate-800">{selectedAccount.contrasena || <span className="text-slate-400 italic">Sin registrar</span>}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b bg-slate-50">
              <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800"><Users className="w-5 h-5 text-indigo-500" /> Perfiles Asignados ({perfilesAsociados.length})</h3>
            </div>
            <div className="overflow-x-auto">
              {perfilesAsociados.length === 0 ? (
                <div className="p-8 text-center text-slate-400">Esta cuenta aún no tiene clientes asignados.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white text-slate-500 text-xs uppercase border-b">
                      <th className="px-6 py-4 whitespace-nowrap">Cliente</th>
                      <th className="px-6 py-4 whitespace-nowrap">PIN</th>
                      <th className="px-6 py-4 whitespace-nowrap">Días Restantes</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {perfilesAsociados.map(client => (
                      <tr key={client.id} className="hover:bg-slate-50 group">
                        <td className="px-6 py-4 font-bold text-slate-800 whitespace-nowrap">{client.nombre}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{client.pin ? <div className="text-sm text-indigo-600 font-bold bg-indigo-50 inline-block px-3 py-1 rounded border border-indigo-100"><Lock className="w-3 h-3 inline mr-1 -mt-0.5"/>{client.pin}</div> : <span className="text-slate-400 text-sm">N/A</span>}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${getDaysBadgeColor(calcularDiasRestantes(client.diaExpiracion))}`}>{calcularDiasRestantes(client.diaExpiracion)} días</div>
                          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1"><CalendarDays className="w-3 h-3"/> Expira: {client.diaExpiracion ? String(client.diaExpiracion).split('T')[0] : 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => sendConditionsWhatsApp(client)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg" title="Enviar Cuenta y Condiciones">
                              <Send className="w-4 h-4"/>
                            </button>
                            <button onClick={() => sendWhatsApp(client)} className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg" title="Recordatorio de Vencimiento">
                              <MessageCircle className="w-4 h-4"/>
                            </button>
                            <button onClick={() => handleEdit(client)} className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg" title="Editar">
                              <Pencil className="w-4 h-4"/>
                            </button>
                            <button onClick={() => handleDelete(client.id)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg" title="Eliminar">
                              <Trash2 className="w-4 h-4"/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white p-6 rounded-2xl shadow-sm border flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2"><KeyRound className="text-purple-500" /> Cuentas Maestras</h2>
            <p className="text-slate-500 text-sm mt-1">Selecciona una cuenta para ver sus contraseñas y perfiles asignados.</p>
          </div>
          <button onClick={() => setShowAddAccount(!showAddAccount)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold flex gap-2">
            <Plus className="w-5 h-5" /> Añadir Cuenta
          </button>
        </div>

        {showAddAccount && (
          <form onSubmit={handleAddAccount} className="bg-purple-50 p-6 rounded-2xl border border-purple-100 flex gap-4 items-end flex-wrap animate-in fade-in slide-in-from-top-4">
            <div className="flex-1 min-w-[150px]"><label className="block text-sm font-bold text-purple-900 mb-1">Plataforma</label><select name="plataforma" value={newAccountData.plataforma} onChange={e => setNewAccountData({...newAccountData, plataforma: e.target.value})} className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-purple-500 bg-white">{plataformas.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div className="flex-1 min-w-[200px]"><label className="block text-sm font-bold text-purple-900 mb-1">Correo</label><input type="text" value={newAccountData.correo} onChange={e => setNewAccountData({...newAccountData, correo: e.target.value})} className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-purple-500" placeholder="correo@ejemplo.com" /></div>
            <div className="flex-1 min-w-[200px]"><label className="block text-sm font-bold text-purple-900 mb-1">Contraseña</label><input type="text" value={newAccountData.contrasena} onChange={e => setNewAccountData({...newAccountData, contrasena: e.target.value})} className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-purple-500" placeholder="Clave de acceso" /></div>
            <button type="submit" className="bg-purple-600 hover:bg-purple-700 transition-colors text-white px-6 py-2 rounded-lg font-bold h-[42px]">Guardar</button>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.length === 0 ? (
            <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
              <KeyRound className="w-12 h-12 mx-auto text-slate-200 mb-3" />
              <p>No tienes cuentas maestras. Añade la primera.</p>
            </div>
          ) : accounts.map(acc => {
            const perfilesAsociados = clients.filter(c => c.cuenta === acc.correo);
            const ingreso = perfilesAsociados.reduce((sum, c) => sum + c.precioVenta, 0);
            const costo = perfilesAsociados.reduce((sum, c) => sum + c.precioCompra, 0);
            return (
              <div key={acc.id} onClick={() => setSelectedAccount(acc)} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer relative group">
                <button onClick={(e) => handleDeleteAccount(acc.id, e)} className="absolute top-4 right-4 text-red-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Eliminar Cuenta Maestra"><Trash2 className="w-4 h-4" /></button>
                <div className="flex justify-between items-start mb-3"><span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded">{acc.plataforma}</span></div>
                <h3 className="font-bold text-slate-800 truncate mb-4">{acc.correo}</h3>
                <div className="space-y-2 text-sm bg-slate-50 p-3 rounded-lg">
                  <div className="flex justify-between"><span>Perfiles vendidos:</span><span className="font-bold text-purple-700">{perfilesAsociados.length}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Costo invertido:</span><span>{currency} {costo.toFixed(2)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Ingreso total:</span><span>{currency} {ingreso.toFixed(2)}</span></div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-bold">Ganancia Neta:</span>
                    <span className={`font-bold ${(ingreso-costo) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{currency} {(ingreso-costo).toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-4 text-center text-xs font-bold text-purple-600">Click para ver detalles y contraseñas ➔</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
      
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800"><Settings className="w-7 h-7 text-slate-500" /> Configuración en la Nube</h2>
          <p className="text-slate-500 text-sm mt-1">Estos cambios se guardarán en tu Google Sheets para todos tus dispositivos.</p>
        </div>
        <button 
          onClick={handleSaveSettings}
          disabled={isSavingConfig}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
        >
          {isSavingConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isSavingConfig ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800 mb-4 border-b pb-2"><Globe className="w-5 h-5 text-indigo-500" /> Preferencias Generales</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Moneda Local</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="S/.">Soles (S/.)</option>
                    <option value="$">Dólares ($)</option>
                    <option value="€">Euros (€)</option>
                    <option value="Mex$">Pesos Mexicanos (Mex$)</option>
                    <option value="Col$">Pesos Colombianos (Col$)</option>
                    <option value="Arg$">Pesos Argentinos (Arg$)</option>
                    <option value="CLP$">Pesos Chilenos (CLP$)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Prefijo de País por Defecto</label>
                <select value={defaultPrefix} onChange={(e) => setDefaultPrefix(e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  {prefijos.map(p => <option key={p.country} value={p.code}>{p.country} ({p.code})</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800 mb-4 border-b pb-2"><Users className="w-5 h-5 text-indigo-500" /> Datos del Proveedor</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nombre / Empresa</label>
                <input type="text" value={providerName} onChange={(e) => setProviderName(e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. valezka_rondon" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Teléfono de Soporte</label>
                <input type="text" value={providerPhone} onChange={(e) => setProviderPhone(e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. +51 987654321" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800 mb-4 border-b pb-2"><MonitorPlay className="w-5 h-5 text-indigo-500" /> Plataformas y Condiciones</h3>
            
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if(newPlatformName.trim() && !plataformas.includes(newPlatformName.trim())) {
                  setPlataformas([...plataformas, newPlatformName.trim()]);
                  setNewPlatformName('');
                }
              }} 
              className="flex gap-2 mb-4"
            >
              <input type="text" value={newPlatformName} onChange={(e) => setNewPlatformName(e.target.value)} placeholder="Añadir plataforma (ej. Vix)" className="flex-1 px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
              <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg font-bold text-sm transition-colors">Añadir</button>
            </form>

            <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-1 mb-6">
              {plataformas.map(plat => (
                <div key={plat} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
                  {plat}
                  <button 
                    onClick={() => {
                      if(plataformas.length > 1) {
                        setPlataformas(plataformas.filter(p => p !== plat));
                      } else {
                        alert("Debes tener al menos una plataforma configurada.");
                      }
                    }} 
                    className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
                    title="Eliminar plataforma"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500"/> Editar Condiciones de:</label>
              <select 
                value={editingPlatformCondition} 
                onChange={(e) => setEditingPlatformCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500 bg-white mb-3 text-sm font-bold text-indigo-700"
              >
                {plataformas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <textarea 
                rows="8"
                value={platformConditions[editingPlatformCondition] !== undefined ? platformConditions[editingPlatformCondition] : defaultConditionStr}
                onChange={(e) => setPlatformConditions({...platformConditions, [editingPlatformCondition]: e.target.value})}
                className="w-full px-3 py-3 rounded-lg border outline-none focus:ring-2 focus:ring-indigo-500 text-sm leading-relaxed"
                placeholder="Escribe aquí las condiciones específicas para esta plataforma..."
              />
              <p className="text-xs text-slate-500 mt-2">Este texto se incluirá automáticamente cuando envíes los accesos de una cuenta de <b>{editingPlatformCondition}</b>.</p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      <nav className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('home')}>
            <div className="bg-indigo-600 p-2 rounded-lg"><MonitorPlay className="w-6 h-6 text-white" /></div>
            <h1 className="text-xl font-bold hidden sm:block">Gestor<span className="text-indigo-600">Stream</span></h1>
          </div>
          <div className="flex items-center gap-4">
            {currentView !== 'home' && <button onClick={() => setCurrentView('home')} className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold"><ChevronLeft className="w-4 h-4"/> Inicio</button>}
            {isLoading && <div className="flex items-center gap-2 text-indigo-600 text-sm font-bold"><Loader2 className="w-4 h-4 animate-spin"/> Sincronizando...</div>}
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {currentView === 'home' && renderHome()}
        {currentView === 'add' && renderAdd()}
        {currentView === 'directory' && renderDirectory()}
        {currentView === 'accounts' && renderAccounts()}
        {currentView === 'settings' && renderSettings()}
      </main>
    </div>
  );
}