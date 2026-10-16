-- DoroStream: esquema inicial para D1/SQLite.
-- Diseño preparatorio: revisar con el código del Worker antes de aplicar.
-- El Worker debe ejecutar PRAGMA foreign_keys = ON y validar entradas/autorización.

CREATE TABLE operadores (
  access_subject TEXT PRIMARY KEY,
  correo TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'operador')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE plataformas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  condiciones TEXT NOT NULL DEFAULT ''
);

CREATE TABLE clientes (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  prefijo TEXT NOT NULL DEFAULT '+51',
  telefono TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE cuentas_servicio (
  id TEXT PRIMARY KEY,
  plataforma_id TEXT NOT NULL REFERENCES plataformas(id),
  identificador TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'retirada')),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sólo rutas administrativas acceden a esta tabla. AES-GCM se aplica en el Worker.
CREATE TABLE secretos_cuenta (
  cuenta_id TEXT PRIMARY KEY REFERENCES cuentas_servicio(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  clave_version INTEGER NOT NULL CHECK (clave_version > 0),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE suscripciones (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES clientes(id),
  plataforma_id TEXT NOT NULL REFERENCES plataformas(id),
  cuenta_id TEXT REFERENCES cuentas_servicio(id),
  perfil TEXT,
  pin_ciphertext TEXT,
  pin_nonce TEXT,
  pin_clave_version INTEGER,
  fecha_inicio TEXT,
  vence_el TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'cancelada')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  legacy_cliente_id TEXT UNIQUE,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((pin_ciphertext IS NULL AND pin_nonce IS NULL AND pin_clave_version IS NULL)
      OR (pin_ciphertext IS NOT NULL AND pin_nonce IS NOT NULL AND pin_clave_version > 0))
);

-- NULL indica que el saldo histórico necesita conciliación; no equivale a cero.
CREATE TABLE saldos_iniciales (
  suscripcion_id TEXT PRIMARY KEY REFERENCES suscripciones(id),
  ingresos_centimos INTEGER,
  costos_centimos INTEGER,
  renovaciones INTEGER,
  estado_revision TEXT NOT NULL CHECK (estado_revision IN ('verificado', 'pendiente')),
  fuente TEXT NOT NULL DEFAULT 'DoroStream Database.xlsx',
  importado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE historial_legacy (
  suscripcion_id TEXT PRIMARY KEY REFERENCES suscripciones(id),
  json_original TEXT NOT NULL CHECK (json_valid(json_original))
);

CREATE TABLE movimientos (
  id TEXT PRIMARY KEY,
  suscripcion_id TEXT NOT NULL REFERENCES suscripciones(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('alta', 'renovacion', 'ajuste')),
  operation_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  fecha_cobro TEXT NOT NULL,
  ingresos_centimos INTEGER NOT NULL,
  costos_centimos INTEGER NOT NULL,
  vencimiento_anterior TEXT,
  vencimiento_nuevo TEXT,
  creado_por TEXT NOT NULL REFERENCES operadores(access_subject),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER validar_version_movimiento
BEFORE INSERT ON movimientos
BEGIN
  SELECT CASE
    WHEN COALESCE((SELECT version FROM suscripciones WHERE id = NEW.suscripcion_id), -1) <> NEW.expected_version
    THEN RAISE(ABORT, 'version conflict')
  END;
END;

CREATE TABLE auditoria (
  id TEXT PRIMARY KEY,
  actor_subject TEXT NOT NULL REFERENCES operadores(access_subject),
  accion TEXT NOT NULL,
  objeto_tipo TEXT NOT NULL,
  objeto_id TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE INDEX idx_clientes_nombre ON clientes(nombre COLLATE NOCASE);
CREATE INDEX idx_clientes_telefono ON clientes(telefono);
CREATE INDEX idx_suscripciones_vence ON suscripciones(vence_el, estado);
CREATE INDEX idx_suscripciones_cliente ON suscripciones(cliente_id, vence_el);
CREATE INDEX idx_suscripciones_cuenta ON suscripciones(cuenta_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha_cobro);
CREATE INDEX idx_movimientos_suscripcion ON movimientos(suscripcion_id, creado_en);
CREATE INDEX idx_auditoria_objeto ON auditoria(objeto_tipo, objeto_id, creado_en);
