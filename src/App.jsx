// ... existing code ...
  const getDaysBadgeColor = (dias) => {
    if (dias < 0) return 'bg-red-100 text-red-800 border-red-200';
    if (dias <= 3) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (dias <= 7) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };

  const stats = useMemo(() => {
    const activos = clients.filter(c => calcularDiasRestantes(c.diaExpiracion) >= 0);
    
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    // NUEVA LÓGICA: Ganancia Mensual (Solo ventas/renovaciones cuyo "diaCompra" es del mes actual)
    const ventasDelMes = clients.filter(c => {
      if (!c.diaCompra) return false;
      const fechaCompra = new Date(String(c.diaCompra).split('T')[0] + 'T00:00:00');
      return fechaCompra.getMonth() === mesActual && fechaCompra.getFullYear() === anioActual;
    });
    
    const gananciaMensual = ventasDelMes.reduce((acc, c) => acc + ((parseFloat(c.precioVenta)||0) - (parseFloat(c.precioCompra)||0)), 0);
    
    // Ganancia Histórica Total (Acumulado de todas las renovaciones desde el inicio)
    const gananciaHistorica = clients.reduce((acc, c) => {
      const ingresos = parseFloat(c.ingresosTotales) || parseFloat(c.precioVenta) || 0;
      const costos = parseFloat(c.costosTotales) || parseFloat(c.precioCompra) || 0;
      return acc + (ingresos - costos);
    }, 0);

    return {
      activos: activos.length,
      gananciaMensual,
      gananciaHistorica,
      total: clients.length
    };
  }, [clients]);

  // ================= ACCIONES DE CLIENTES =================
// ... existing code ...
