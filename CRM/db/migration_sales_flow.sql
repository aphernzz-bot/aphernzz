-- ============================================================
--  Migración: Flujo de ventas profesional
--  Ejecutar en phpMyAdmin sobre fbbeaaem_crm_aphernzz
--  Es seguro correr múltiples veces (IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- 1. Ampliar estados de facturas (agrega Emitida, Validada, Enviada, Parcial)
--    MariaDB permite redefinir ENUM sin perder datos existentes
ALTER TABLE facturas
  MODIFY COLUMN estado
    ENUM('Borrador','Emitida','Validada','Enviada','Parcial','Pendiente','Pagada','Vencida','Cancelada')
    NOT NULL DEFAULT 'Emitida';

-- Migrar registros "Pendiente" anteriores → "Emitida" para homologar
UPDATE facturas SET estado = 'Emitida' WHERE estado = 'Pendiente';

-- 2. Añadir columnas de control financiero a facturas
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS monto_pagado   DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER monto,
  ADD COLUMN IF NOT EXISTS saldo          DECIMAL(14,2) GENERATED ALWAYS AS (monto - monto_pagado) STORED AFTER monto_pagado,
  ADD COLUMN IF NOT EXISTS dias_credito   SMALLINT UNSIGNED NULL AFTER fecha_vencimiento,
  ADD COLUMN IF NOT EXISTS validado_por   INT UNSIGNED NULL AFTER notas,
  ADD COLUMN IF NOT EXISTS validado_at    TIMESTAMP NULL AFTER validado_por,
  ADD CONSTRAINT fk_factura_validador FOREIGN KEY IF NOT EXISTS (validado_por) REFERENCES usuarios(id) ON DELETE SET NULL;

-- Sync monto_pagado para facturas ya marcadas como Pagadas
UPDATE facturas SET monto_pagado = monto WHERE estado = 'Pagada';

-- 3. Ampliar estados de ventas (Orden de Venta)
ALTER TABLE ventas
  MODIFY COLUMN estado
    ENUM('Borrador','Confirmada','En proceso','Completada','Pendiente','Cancelada')
    NOT NULL DEFAULT 'Confirmada';

UPDATE ventas SET estado = 'Completada' WHERE estado = 'Pendiente' AND origen LIKE 'Cotización%';

-- 4. Tabla de pagos
CREATE TABLE IF NOT EXISTS pagos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  factura_id    INT UNSIGNED NOT NULL,
  monto         DECIMAL(14,2) NOT NULL,
  moneda        CHAR(3)       NOT NULL DEFAULT 'MXN',
  tipo_cambio   DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
  metodo_pago   ENUM('Transferencia','SPEI','Efectivo','Cheque','Tarjeta','Otro') NOT NULL DEFAULT 'Transferencia',
  referencia    VARCHAR(100)  NULL,
  fecha_pago    DATE          NOT NULL,
  estado        ENUM('Confirmado','Rechazado') NOT NULL DEFAULT 'Confirmado',
  notas         TEXT          NULL,
  usuario_id    INT UNSIGNED  NULL,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE RESTRICT,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_factura (factura_id),
  INDEX idx_fecha   (fecha_pago)
) ENGINE=InnoDB;

-- 5. Trigger: al insertar un pago confirmado, actualizar monto_pagado y estado de factura
DROP TRIGGER IF EXISTS trg_pago_insert;
DELIMITER ;;
CREATE TRIGGER trg_pago_insert
AFTER INSERT ON pagos
FOR EACH ROW
BEGIN
  IF NEW.estado = 'Confirmado' THEN
    UPDATE facturas
      SET monto_pagado = monto_pagado + NEW.monto,
          estado = CASE
            WHEN (monto_pagado + NEW.monto) >= monto THEN 'Pagada'
            WHEN (monto_pagado + NEW.monto) > 0       THEN 'Parcial'
            ELSE estado
          END,
          fecha_pago = CASE
            WHEN (monto_pagado + NEW.monto) >= monto THEN NEW.fecha_pago
            ELSE fecha_pago
          END
      WHERE id = NEW.factura_id;
  END IF;
END;;
DELIMITER ;

-- 6. Trigger: al rechazar un pago, revertir monto_pagado
DROP TRIGGER IF EXISTS trg_pago_update;
DELIMITER ;;
CREATE TRIGGER trg_pago_update
AFTER UPDATE ON pagos
FOR EACH ROW
BEGIN
  IF OLD.estado = 'Confirmado' AND NEW.estado = 'Rechazado' THEN
    UPDATE facturas
      SET monto_pagado = GREATEST(0, monto_pagado - OLD.monto),
          estado = CASE
            WHEN GREATEST(0, monto_pagado - OLD.monto) = 0 THEN 'Validada'
            ELSE 'Parcial'
          END
      WHERE id = OLD.factura_id;
  END IF;
END;;
DELIMITER ;
