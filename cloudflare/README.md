# DoroStream en Cloudflare

La nueva PWA se sirve desde un Cloudflare Worker con D1. El despliegue está en [dorostream-api.juaca12314-2bf.workers.dev](https://dorostream-api.juaca12314-2bf.workers.dev). La aplicación anterior con Apps Script permanece en la raíz del repositorio.

## Datos y seguridad

- Se importaron 456 clientes, 66 cuentas, 18 plataformas, 456 suscripciones, 395 historiales y 6 ajustes de configuración.
- El XLSX original se guarda en cinco bloques cifrados con AES-GCM. `scripts/verify_export.py` comprobó que la exportación remota reconstruye sus 73 376 bytes y su SHA-256 original.
- Las 66 cuentas importadas quedan «Sin fecha», porque el Excel no contiene fechas de cuenta. Las cuentas nuevas exigen compra y vencimiento.
- 206 referencias de cuenta se vincularon sin ambigüedad. Las 24 no resueltas conservan el texto original en `legacy_cuenta`; 226 estaban vacías.
- 62 saldos históricos requieren revisión por celdas vacías o un valor de fecha en una columna monetaria. Once residuos decimales de coma flotante se redondearon a céntimos; el archivo cifrado conserva el valor original.
- Contraseñas y PIN se cifran antes de almacenarse. La revelación de contraseñas se audita.
- La sesión usa cookie firmada `HttpOnly`, `Secure`, `SameSite=Strict`, de 12 horas; cinco intentos fallidos bloquean temporalmente la IP.
- El service worker sólo cachea archivos estáticos. No cachea `/api/*`, navegación ni datos privados.

## Indicadores y operación

- Las cuentas aparecen agrupadas por plataforma; cada grupo se puede abrir o cerrar.
- «Ganancia del mes» suma las ventas importadas cuya fecha de compra cae en el mes actual y los movimientos registrados después de la migración en ese mes. El desglose aparece bajo la cifra. Las ventas importadas usan `precio_venta_centimos - precio_compra_centimos`, igual que el cálculo mensual de la aplicación anterior.
- «Histórico verificado» suma los saldos del Excel marcados como verificados y los movimientos nuevos. Los 62 saldos pendientes quedan fuera de esa cifra hasta conciliarlos; no se convierten en cero.
- El botón «Avisar» del directorio y «Enviar renovación» del detalle abren WhatsApp con el recordatorio preescrito. No envían el mensaje automáticamente. Si falta un teléfono válido, el enlace queda deshabilitado.

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
