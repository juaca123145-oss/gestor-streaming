ALTER TABLE clientes ADD COLUMN archivado_en TEXT;
ALTER TABLE auditoria ADD COLUMN detalle_json TEXT;

CREATE INDEX idx_clientes_archivado ON clientes(archivado_en);

-- La edición de una suscripción y su cliente se aplica en un único batch.
-- Rechaza una versión obsoleta antes de modificar cualquiera de los dos.
CREATE TRIGGER validar_version_edicion_cliente
BEFORE INSERT ON auditoria
WHEN NEW.accion = 'editar_cliente'
BEGIN
  SELECT CASE WHEN COALESCE((SELECT version FROM suscripciones
    WHERE id = json_extract(NEW.detalle_json, '$.suscripcionId')
      AND cliente_id = NEW.objeto_id), -1)
    <> COALESCE(json_extract(NEW.detalle_json, '$.expectedVersion'), -2)
    THEN RAISE(ABORT, 'version conflict') END;
END;

CREATE TRIGGER impedir_retirar_cuenta_asignada
BEFORE UPDATE OF estado ON cuentas_servicio
WHEN NEW.estado = 'retirada' AND OLD.estado <> 'retirada'
  AND EXISTS (SELECT 1 FROM suscripciones WHERE cuenta_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'account assigned');
END;

CREATE TRIGGER impedir_asignar_cuenta_retirada_insert
BEFORE INSERT ON suscripciones
WHEN NEW.cuenta_id IS NOT NULL
  AND (SELECT estado FROM cuentas_servicio WHERE id = NEW.cuenta_id) <> 'activa'
BEGIN
  SELECT RAISE(ABORT, 'account retired');
END;

CREATE TRIGGER impedir_asignar_cuenta_retirada_update
BEFORE UPDATE OF cuenta_id ON suscripciones
WHEN NEW.cuenta_id IS NOT NULL
  AND (SELECT estado FROM cuentas_servicio WHERE id = NEW.cuenta_id) <> 'activa'
BEGIN
  SELECT RAISE(ABORT, 'account retired');
END;
