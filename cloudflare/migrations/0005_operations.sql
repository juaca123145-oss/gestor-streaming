ALTER TABLE cuentas_servicio ADD COLUMN capacidad INTEGER CHECK(capacidad IS NULL OR capacidad BETWEEN 1 AND 1000);
ALTER TABLE saldos_iniciales ADD COLUMN resolucion TEXT;
ALTER TABLE saldos_iniciales ADD COLUMN evidencia TEXT;
CREATE TABLE seguridad_admin (
 id INTEGER PRIMARY KEY CHECK(id=1), password_hash TEXT, salt TEXT,
 session_version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO seguridad_admin(id) VALUES(1);
CREATE TABLE deudas (
 id TEXT PRIMARY KEY, suscripcion_id TEXT NOT NULL REFERENCES suscripciones(id),
 concepto TEXT NOT NULL, importe_centimos INTEGER NOT NULL CHECK(importe_centimos>0),
 fecha TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE abonos (
 id TEXT PRIMARY KEY, deuda_id TEXT NOT NULL REFERENCES deudas(id),
 importe_centimos INTEGER NOT NULL CHECK(importe_centimos>0), fecha TEXT NOT NULL,
 metodo TEXT NOT NULL CHECK(metodo IN ('Yape','Plin','Transferencia','Efectivo','Otro')),
 operation_key TEXT NOT NULL UNIQUE, movimiento_id TEXT NOT NULL UNIQUE REFERENCES movimientos(id)
);
CREATE INDEX idx_deudas_suscripcion ON deudas(suscripcion_id);
CREATE INDEX idx_abonos_deuda ON abonos(deuda_id);
CREATE TRIGGER evitar_sobrepago BEFORE INSERT ON abonos
WHEN NEW.importe_centimos + COALESCE((SELECT SUM(importe_centimos) FROM abonos WHERE deuda_id=NEW.deuda_id),0)
 > (SELECT importe_centimos FROM deudas WHERE id=NEW.deuda_id)
BEGIN SELECT RAISE(ABORT,'overpayment'); END;
CREATE TRIGGER cupo_insert BEFORE INSERT ON suscripciones
WHEN NEW.cuenta_id IS NOT NULL AND (SELECT capacidad FROM cuentas_servicio WHERE id=NEW.cuenta_id) IS NOT NULL
 AND (SELECT COUNT(*) FROM suscripciones WHERE cuenta_id=NEW.cuenta_id) >= (SELECT capacidad FROM cuentas_servicio WHERE id=NEW.cuenta_id)
BEGIN SELECT RAISE(ABORT,'account full'); END;
CREATE TRIGGER cupo_update BEFORE UPDATE OF cuenta_id ON suscripciones
WHEN NEW.cuenta_id IS NOT NULL AND NEW.cuenta_id IS NOT OLD.cuenta_id
 AND (SELECT capacidad FROM cuentas_servicio WHERE id=NEW.cuenta_id) IS NOT NULL
 AND (SELECT COUNT(*) FROM suscripciones WHERE cuenta_id=NEW.cuenta_id) >= (SELECT capacidad FROM cuentas_servicio WHERE id=NEW.cuenta_id)
BEGIN SELECT RAISE(ABORT,'account full'); END;
CREATE TRIGGER cupo_reducir BEFORE UPDATE OF capacidad ON cuentas_servicio
WHEN NEW.capacidad IS NOT NULL AND NEW.capacidad < (SELECT COUNT(*) FROM suscripciones WHERE cuenta_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'capacity below occupancy'); END;
