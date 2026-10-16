# DoroStream

La nueva aplicación privada está publicada en [DoroStream Cloudflare](https://dorostream-api.juaca12314-2bf.workers.dev). Usa una PWA React, un Cloudflare Worker y una base D1. El código, las migraciones y la auditoría reproducible de importación están en [cloudflare/](cloudflare/README.md).

La aplicación React anterior en `src/` sigue disponible como referencia durante la transición desde Apps Script. Los datos del Excel y las claves no están en Git. La importación de D1 fue verificada contra el XLSX original mediante recuentos, claves foráneas y un respaldo cifrado idéntico byte por byte.
