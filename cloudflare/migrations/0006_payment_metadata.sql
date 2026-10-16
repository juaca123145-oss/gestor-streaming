ALTER TABLE movimientos ADD COLUMN metodo_pago TEXT CHECK(metodo_pago IS NULL OR metodo_pago IN ('Yape','Plin','Transferencia','Efectivo','Otro'));
ALTER TABLE deudas ADD COLUMN operation_key TEXT;
CREATE UNIQUE INDEX idx_deuda_operation ON deudas(operation_key) WHERE operation_key IS NOT NULL;
