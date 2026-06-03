-- ============================================================
--  CRM Aphernzz — Esquema de base de datos
--  Motor: MySQL 8+ / MariaDB 10.6+
--  Charset: utf8mb4 (soporte completo Unicode + emojis)
-- ============================================================

-- ============================================================
--  MÓDULO: USUARIOS Y ROLES
-- ============================================================

CREATE TABLE roles (
  id            TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(50)  NOT NULL UNIQUE,
  descripcion   VARCHAR(200),
  permisos      JSON         NOT NULL DEFAULT '{}',
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- permisos JSON estructura:
-- {
--   "clientes":     {"ver":true,"crear":true,"editar":true,"eliminar":false},
--   "prospectos":   {"ver":true,"crear":true,"editar":true,"eliminar":false},
--   "cotizaciones": {"ver":true,"crear":true,"editar":true,"eliminar":false},
--   "ventas":       {"ver":true,"crear":true,"editar":false,"eliminar":false},
--   "facturas":     {"ver":true,"crear":false,"editar":false,"eliminar":false},
--   "actividades":  {"ver":true,"crear":true,"editar":true,"eliminar":true},
--   "usuarios":     {"ver":false,"crear":false,"editar":false,"eliminar":false},
--   "reportes":     {"ver":false}
-- }

CREATE TABLE usuarios (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  rol_id         TINYINT UNSIGNED NOT NULL,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  avatar_color   VARCHAR(20)  DEFAULT 'purple',   -- purple|teal|blue|coral
  ultimo_acceso  TIMESTAMP    NULL,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id) REFERENCES roles(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================
--  MÓDULO: CLIENTES
-- ============================================================

CREATE TABLE clientes (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(150) NOT NULL,
  empresa           VARCHAR(150),
  rfc               VARCHAR(20),
  email             VARCHAR(150),
  telefono          VARCHAR(30),
  celular           VARCHAR(30),
  ciudad            VARCHAR(100),
  estado_rep        VARCHAR(60),   -- estado de la república
  pais              VARCHAR(60)   DEFAULT 'México',
  codigo_postal     VARCHAR(10),
  segmento          ENUM('Pequeño','Mediano','Grande','Gobierno','Corporativo') DEFAULT 'Pequeño',
  estado            ENUM('Activo','Inactivo','Bloqueado') DEFAULT 'Activo',
  sitio_web         VARCHAR(200),
  notas             TEXT,
  usuario_asignado  INT UNSIGNED NULL,   -- asesor responsable
  fecha_primer_contacto DATE NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_asignado) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_empresa  (empresa),
  INDEX idx_email    (email),
  INDEX idx_segmento (segmento),
  INDEX idx_estado   (estado)
) ENGINE=InnoDB;

-- ============================================================
--  MÓDULO: PROSPECTOS (PIPELINE)
-- ============================================================

CREATE TABLE prospectos (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre                  VARCHAR(150) NOT NULL,
  empresa                 VARCHAR(150),
  rfc                     VARCHAR(20),
  email                   VARCHAR(150),
  telefono                VARCHAR(30),
  celular                 VARCHAR(30),
  ciudad                  VARCHAR(100),
  valor_estimado          DECIMAL(14,2) DEFAULT 0.00,
  moneda                  CHAR(3)       DEFAULT 'MXN',
  fuente                  ENUM('Referido','Redes sociales','Llamada fría','WhatsApp','Web','Evento','Email','Otro') DEFAULT 'Otro',
  etapa                   ENUM('Contacto','Interés','Propuesta','Negociación','Cerrado') DEFAULT 'Contacto',
  probabilidad            TINYINT UNSIGNED DEFAULT 20,  -- % 0-100
  fecha_cierre_estimada   DATE NULL,
  notas                   TEXT,
  razon_perdida           VARCHAR(300) NULL,   -- si etapa = Cerrado (perdido)
  convertido_cliente_id   INT UNSIGNED NULL,   -- FK si se convirtió
  usuario_asignado        INT UNSIGNED NULL,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_asignado)      REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (convertido_cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  INDEX idx_etapa  (etapa),
  INDEX idx_fuente (fuente)
) ENGINE=InnoDB;

-- ============================================================
--  MÓDULO: COTIZACIONES
-- ============================================================

CREATE TABLE cotizaciones (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  folio           VARCHAR(20)  NOT NULL UNIQUE,
  cliente_id      INT UNSIGNED NULL,
  prospecto_id    INT UNSIGNED NULL,
  cliente_nombre  VARCHAR(150) NOT NULL,   -- snapshot del nombre al crear
  vinculo         VARCHAR(50),             -- 'Cliente' | 'Prospecto' | 'Externo'
  fecha_emision   DATE         NOT NULL,
  fecha_vigencia  DATE         NOT NULL,
  estado          ENUM('Borrador','Enviada','Aceptada','Rechazada','Facturada') DEFAULT 'Borrador',
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  iva_pct         DECIMAL(5,2)  NOT NULL DEFAULT 16.00,
  iva             DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  moneda          CHAR(3)       DEFAULT 'MXN',
  tipo_cambio     DECIMAL(10,4) DEFAULT 1.0000,
  notas           TEXT,
  usuario_id      INT UNSIGNED NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id)   REFERENCES clientes(id)   ON DELETE SET NULL,
  FOREIGN KEY (prospecto_id) REFERENCES prospectos(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)   ON DELETE SET NULL,
  INDEX idx_estado         (estado),
  INDEX idx_fecha_emision  (fecha_emision),
  INDEX idx_cliente_nombre (cliente_nombre)
) ENGINE=InnoDB;

CREATE TABLE cotizacion_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id   INT UNSIGNED NOT NULL,
  descripcion     VARCHAR(500) NOT NULL,
  unidad          VARCHAR(30)  DEFAULT 'pieza',
  cantidad        DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  precio_unitario DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  descuento_pct   DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  orden           TINYINT UNSIGNED DEFAULT 0,
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
  INDEX idx_cotizacion (cotizacion_id)
) ENGINE=InnoDB;

-- ============================================================
--  MÓDULO: VENTAS
-- ============================================================

CREATE TABLE ventas (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  folio          VARCHAR(20)   NOT NULL UNIQUE,
  cliente_id     INT UNSIGNED  NULL,
  cliente_nombre VARCHAR(150)  NOT NULL,
  descripcion    VARCHAR(500),
  monto          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  moneda         CHAR(3)       DEFAULT 'MXN',
  fecha          DATE          NOT NULL,
  estado         ENUM('Completada','Pendiente','Cancelada') DEFAULT 'Completada',
  origen         VARCHAR(100)  DEFAULT 'Manual',
  cotizacion_id  INT UNSIGNED  NULL,
  usuario_id     INT UNSIGNED  NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id)    REFERENCES clientes(id)    ON DELETE SET NULL,
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id)    REFERENCES usuarios(id)    ON DELETE SET NULL,
  INDEX idx_fecha  (fecha),
  INDEX idx_estado (estado)
) ENGINE=InnoDB;

-- ============================================================
--  MÓDULO: FACTURAS
-- ============================================================

CREATE TABLE facturas (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  folio             VARCHAR(20)   NOT NULL UNIQUE,
  cliente_id        INT UNSIGNED  NULL,
  cliente_nombre    VARCHAR(150)  NOT NULL,
  venta_id          INT UNSIGNED  NULL,
  cotizacion_id     INT UNSIGNED  NULL,
  concepto          VARCHAR(500)  NOT NULL,
  subtotal          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  iva               DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  monto             DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  moneda            CHAR(3)       DEFAULT 'MXN',
  fecha_emision     DATE          NOT NULL,
  fecha_vencimiento DATE          NULL,
  fecha_pago        DATE          NULL,
  estado            ENUM('Pendiente','Pagada','Vencida','Cancelada') DEFAULT 'Pendiente',
  metodo_pago       VARCHAR(60)   NULL,    -- Transferencia | Efectivo | Cheque | etc.
  referencia_pago   VARCHAR(100)  NULL,
  notas             TEXT,
  usuario_id        INT UNSIGNED  NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id)    REFERENCES clientes(id)    ON DELETE SET NULL,
  FOREIGN KEY (venta_id)      REFERENCES ventas(id)      ON DELETE SET NULL,
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id)    REFERENCES usuarios(id)    ON DELETE SET NULL,
  INDEX idx_estado           (estado),
  INDEX idx_fecha_vencimiento (fecha_vencimiento)
) ENGINE=InnoDB;

-- ============================================================
--  MÓDULO: ACTIVIDADES Y TAREAS
-- ============================================================

CREATE TABLE actividades (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo            ENUM('Llamada','WhatsApp','Email','Reunión','Tarea','Visita') DEFAULT 'Tarea',
  titulo          VARCHAR(200) NOT NULL,
  relacion_tipo   ENUM('cliente','prospecto') NULL,
  relacion_id     INT UNSIGNED NULL,
  relacion_nombre VARCHAR(150),
  fecha           DATE         NOT NULL,
  hora            TIME         NULL,
  duracion_min    SMALLINT UNSIGNED NULL,   -- duración en minutos
  estado          ENUM('Pendiente','Completada','Cancelada') DEFAULT 'Pendiente',
  prioridad       ENUM('Baja','Normal','Alta','Urgente') DEFAULT 'Normal',
  notas           TEXT,
  resultado       TEXT NULL,   -- resultado/resumen después de completar
  usuario_id      INT UNSIGNED NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_fecha    (fecha),
  INDEX idx_estado   (estado),
  INDEX idx_tipo     (tipo),
  INDEX idx_relacion (relacion_tipo, relacion_id)
) ENGINE=InnoDB;

-- ============================================================
--  AUDITORÍA — Historial de cambios
-- ============================================================

CREATE TABLE historial_cambios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tabla         VARCHAR(50)  NOT NULL,
  registro_id   INT UNSIGNED NOT NULL,
  accion        ENUM('crear','editar','eliminar','cambio_estado') NOT NULL,
  datos_antes   JSON NULL,
  datos_despues JSON NULL,
  usuario_id    INT UNSIGNED NULL,
  usuario_nombre VARCHAR(100),
  ip            VARCHAR(45),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tabla_registro (tabla, registro_id),
  INDEX idx_usuario        (usuario_id),
  INDEX idx_created        (created_at)
) ENGINE=InnoDB;

-- ============================================================
--  DATOS INICIALES — Roles
-- ============================================================

INSERT INTO roles (nombre, descripcion, permisos) VALUES

('superadmin', 'Acceso total al sistema, incluye gestión de usuarios',
 '{"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "prospectos":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "cotizaciones":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "ventas":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "facturas":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "actividades":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "usuarios":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "reportes":{"ver":true}}'),

('admin', 'Administrador del CRM — acceso completo excepto gestión de usuarios',
 '{"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "prospectos":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "cotizaciones":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "ventas":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "facturas":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "actividades":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "usuarios":{"ver":false,"crear":false,"editar":false,"eliminar":false},
   "reportes":{"ver":true}}'),

('vendedor', 'Ejecutivo de ventas — gestiona sus prospectos y cotizaciones',
 '{"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":false},
   "prospectos":{"ver":true,"crear":true,"editar":true,"eliminar":false},
   "cotizaciones":{"ver":true,"crear":true,"editar":true,"eliminar":false},
   "ventas":{"ver":true,"crear":true,"editar":false,"eliminar":false},
   "facturas":{"ver":true,"crear":false,"editar":false,"eliminar":false},
   "actividades":{"ver":true,"crear":true,"editar":true,"eliminar":true},
   "usuarios":{"ver":false,"crear":false,"editar":false,"eliminar":false},
   "reportes":{"ver":false}}'),

('soporte', 'Consulta y registro de actividades solamente',
 '{"clientes":{"ver":true,"crear":false,"editar":false,"eliminar":false},
   "prospectos":{"ver":true,"crear":false,"editar":false,"eliminar":false},
   "cotizaciones":{"ver":true,"crear":false,"editar":false,"eliminar":false},
   "ventas":{"ver":true,"crear":false,"editar":false,"eliminar":false},
   "facturas":{"ver":true,"crear":false,"editar":false,"eliminar":false},
   "actividades":{"ver":true,"crear":true,"editar":true,"eliminar":false},
   "usuarios":{"ver":false,"crear":false,"editar":false,"eliminar":false},
   "reportes":{"ver":false}}');

-- El usuario administrador inicial se crea via: node db/seed.js
