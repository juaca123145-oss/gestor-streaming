# DoroStream en Cloudflare

La nueva PWA se sirve desde un Cloudflare Worker con D1. El despliegue está en [dorostream-api.juaca12314-2bf.workers.dev](https://dorostream-api.juaca12314-2bf.workers.dev). La aplicación anterior con Apps Script permanece en la raíz del repositorio.

## Datos y seguridad

- Se importaron 456 clientes, 66 cuentas, 18 plataformas, 456 suscripciones, 395 historiales y 6 ajustes de configuración.
- El XLSX original se guarda en cinco bloques cifrados con AES-GCM. `scripts/verify_export.py` comprobó que la exportación remota reconstruye sus 73 376 bytes y su SHA-256 original.
- Las 66 cuentas importadas quedan «Sin fecha», porque el Excel no contiene fechas de cuenta. Las cuentas nuevas exigen compra y vencimiento.
- 206 referencias de cuenta se vincularon sin ambigüedad. Las 24 no resueltas conservan el texto original en `legacy_cuenta`; 226 estaban vacías.
- Los 62 saldos originalmente pendientes se conciliaron: 61 reproducen el fallback de la app antigua, autorizado por el usuario y etiquetado `base_legacy`; no equivalen a un historial completo. El restante se reconstruyó con costo acumulado y ganancias del historial, contrastado con cuatro ventas. Once residuos decimales de coma flotante se redondearon a céntimos; el archivo cifrado conserva el valor original.
- Las 24 referencias se vincularon conservando el texto original: 4 apuntaban a duplicados equivalentes con la misma credencial y 20 dieron lugar a 19 fichas adicionales sin credenciales. El inventario total pasa de 66 a 85; ninguna cuenta original fue eliminada. Las contraseñas desconocidas se completan desde Revisión de datos.
- Contraseñas y PIN se cifran antes de almacenarse. La revelación de contraseñas se audita.
- La sesión usa cookie firmada `HttpOnly`, `Secure`, `SameSite=Strict`, de 12 horas; cinco intentos fallidos bloquean temporalmente la IP.
- El service worker sólo cachea archivos estáticos. No cachea `/api/*`, navegación ni datos privados.

## Indicadores y operación

- Las cuentas aparecen agrupadas por plataforma; cada grupo se puede abrir o cerrar.
- «Ganancia del mes» suma las ventas importadas cuya fecha de compra cae en el mes actual y los movimientos registrados después de la migración en ese mes. El desglose aparece bajo la cifra. Las ventas importadas usan `precio_venta_centimos - precio_compra_centimos`, igual que el cálculo mensual de la aplicación anterior.
- «Histórico verificado» suma los saldos contrastados y los movimientos nuevos. Los 61 saldos `base_legacy` se muestran por separado como margen reconstruido y sus renovaciones previas son desconocidas. La evidencia y los valores anteriores quedan en la auditoría.
- El resumen incluye gráficas de ganancia mensual (12 meses) y suscripciones por plataforma. La barra del mes actual usa el mismo cálculo que «Ganancia del mes». Las cifras de las gráficas se obtienen de `/api/estadisticas`, sin enviar contraseñas ni datos personales.
- El botón «Avisar» del directorio y «Enviar renovación» del detalle abren WhatsApp con el recordatorio preescrito. No envían el mensaje automáticamente. Si falta un teléfono válido, el enlace queda deshabilitado.
- «Editar datos» permite corregir contacto, plataforma, cuenta, perfil, PIN y fechas. Exige la versión actual de la suscripción y registra un resumen del cambio en auditoría; los importes y movimientos históricos permanecen intactos.
- Clientes y cuentas pueden retirarse y restaurarse. Los clientes retirados se separan del directorio activo y los indicadores operativos. Una cuenta asignada no se puede retirar hasta desasignar sus perfiles. Las filas, cobros y auditoría se conservan.
- «Entregar acceso» prepara un mensaje con credenciales, fechas, web de códigos, condiciones y proveedor. El administrador ve el contenido antes de abrir WhatsApp; la vista previa se cierra a los dos minutos. La preparación se audita sin guardar el texto ni las contraseñas en la auditoría.
- «Ajustes» recupera las condiciones por plataforma, datos del proveedor y prefijo predeterminado que guardaba Apps Script. Permite añadir plataformas. La moneda importada se muestra sin permitir cambiar sólo su etiqueta, porque los importes guardados están en soles.

## Comparación con Apps Script

El Apps Script original exponía lectura de clientes, cuentas y configuración, guardado o actualización de filas completas y borrado físico de clientes y cuentas. Las estadísticas, mensajes de WhatsApp y formularios estaban implementados en la antigua interfaz React. La nueva app ofrece edición de clientes, retirada reversible y mensajes de entrega. El borrado físico de una fila se sustituyó por la retirada reversible para conservar referencias financieras y de auditoría.

## Desarrollo

```powershell
cd cloudflare
npm ci
npm test
npm run build:ui
npx wrangler d1 migrations apply dorostream --local
npm run dev
```

`http://127.0.0.1:8787/?demo=1` muestra datos ficticios locales. El directorio `.migration/` está excluido de Git: contiene el SQL con datos personales, la clave de cifrado, el archivo exportado y la contraseña administrativa. No se debe publicar.

## Importación reproducible

```powershell
python scripts/import_excel.py "C:\ruta\DoroStream Database.xlsx"
npx wrangler d1 migrations apply dorostream --remote
npx wrangler d1 execute dorostream --remote --file=.migration/import.sql
npx wrangler d1 export dorostream --remote --output .migration/remote-export.sql -y
python scripts/verify_export.py "C:\ruta\DoroStream Database.xlsx"
```

El importador también genera `referencias_pendientes.csv` y `saldos_pendientes.csv` dentro de `.migration/` para revisar los casos que el Excel no permite conciliar. El SQL generado se aplica únicamente sobre una base vacía. Antes de importar otro Excel, exporta D1 y planifica una conciliación incremental.

## Despliegue

El Worker usa el binding `DB` y cuatro secretos: `AUTHORIZED_ADMIN_EMAIL`, `ACCOUNT_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH`, `SESSION_SIGNING_KEY`. `npm run build:ui` y `npx wrangler deploy` publican UI y API. Cloudflare Zero Trust Access no se activó: el alta del plan Free en esta cuenta solicitó una tarjeta y autorización de cargos futuros.

## Operación diaria

- Vencimientos: clientes y cuentas en grupos vencidos, hoy, 1–3 días, 4–7 días y sin fecha; acceso al aviso de WhatsApp y a la renovación.
- Perfiles libres: capacidad opcional, ocupación y clientes asignados. Los triggers rechazan sobreasignaciones y reducir la capacidad por debajo de la ocupación. Un cliente retirado o vencido ocupa espacio hasta desasignarlo explícitamente.
- Pagos: altas y renovaciones pueden quedar pendientes. Su importe no entra como ingreso hasta cobrarlo; el costo sí se registra al dar el servicio. Abonos parciales con Yape, Plin, transferencia, efectivo u otro método. Los abonos y deudas manuales usan claves de idempotencia; un trigger rechaza sobrepagos. El método se conserva también para cobros inmediatos. No se deducen deudas del Excel porque no contenía ese dato.
- Rentabilidad: ingresos, costos y margen por plataforma y mes, usando el mismo criterio del resumen y marcando importes incompletos.
- Revisión: evidencia de los saldos reconstruidos y conciliados, referencias pendientes y cuentas sin contraseña. La conciliación manual exige cifras y una explicación de la fuente.
- Seguridad: cambio de contraseña con verificación de la actual, PBKDF2 con sal aleatoria y cierre de todas las sesiones mediante versión de sesión. Después del primer cambio desde la interfaz, el hash de D1 prevalece sobre el secreto inicial `ADMIN_PASSWORD_HASH`.

## Respaldo y recuperación

En Ajustes se descarga un respaldo cifrado con una clave elegida por el usuario. Incluye una instantánea de las tablas, esquema, Excel cifrado y los secretos necesarios para recuperar las credenciales. El archivo usa PBKDF2-SHA256 (100 000 iteraciones) y AES-GCM. La clave del respaldo no se guarda en el servidor.

Para comprobar o preparar una recuperación, usa una carpeta nueva y privada:

```powershell
python scripts/restore_backup.py "C:\ruta\dorostream.backup.json" ".migration\recuperacion-nueva"
```

El script solicita la clave sin mostrarla, crea `recovered.sqlite`, valida integridad y claves foráneas y genera `restore.sql` y `worker-secrets.json`. No modifica producción. Para recuperar en Cloudflare, crea una D1 vacía, importa el SQL, configura su binding y carga los secretos con Wrangler. Usa una base vacía: importar sobre la actual produciría conflictos. El script crea una nueva clave de sesión y aumenta su versión para invalidar sesiones anteriores. Conserva estos archivos privados fuera de Git.

## Verificación de operaciones

`scripts/smoke_operations.mjs` prueba sobre `127.0.0.1:8789` una D1 local con plataforma `test-platform` y cuenta sin secretos `test-reference-account`: cupos, pagos diferidos, abonos, duplicados, sobrepagos, método de pago, completar credenciales, cambio de contraseña y revocación de sesiones. Cambia y restaura la contraseña únicamente en la base local. Comprueba el cifrado y descifrado del respaldo. `reconcile_legacy.py` genera SQL privado desde un export y el XLSX cuyo SHA-256 debe coincidir con la importación; nunca publica datos personales en el repositorio.
