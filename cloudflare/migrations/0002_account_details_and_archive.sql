ALTER TABLE cuentas_servicio ADD COLUMN fecha_compra TEXT;
ALTER TABLE cuentas_servicio ADD COLUMN vence_el TEXT;
ALTER TABLE cuentas_servicio ADD COLUMN codigos_url TEXT;
ALTER TABLE cuentas_servicio ADD COLUMN nota TEXT;

ALTER TABLE secretos_cuenta ADD COLUMN codigo_password_ciphertext TEXT;
ALTER TABLE secretos_cuenta ADD COLUMN codigo_password_nonce TEXT;
ALTER TABLE secretos_cuenta ADD COLUMN codigo_password_clave_version INTEGER;

ALTER TABLE suscripciones ADD COLUMN legacy_cuenta TEXT;
ALTER TABLE suscripciones ADD COLUMN precio_compra_centimos INTEGER;
ALTER TABLE suscripciones ADD COLUMN precio_venta_centimos INTEGER;
ALTER TABLE suscripciones ADD COLUMN fecha_compra TEXT;

CREATE INDEX idx_cuentas_vence ON cuentas_servicio(vence_el);

-- Conserva los bytes originales cifrados para comprobar o reconstruir toda la importación.
CREATE TABLE legacy_workbook_meta (
  sha256 TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  importado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE legacy_workbook_chunks (
  sha256 TEXT NOT NULL REFERENCES legacy_workbook_meta(sha256),
  chunk_index INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  clave_version INTEGER NOT NULL,
  PRIMARY KEY (sha256, chunk_index)
);
