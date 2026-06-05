'use strict';
require('dotenv').config();

const express  = require('express');
const mysql    = require('mysql2/promise');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');
const { authMiddleware, requirePerm } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname)));   // sirve el HTML

// ─── Pool de conexiones MySQL ─────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || process.env.MYSQL_HOST     || 'localhost',
  port:               process.env.DB_PORT     || process.env.MYSQL_PORT     || 3306,
  user:               process.env.DB_USER     || process.env.MYSQL_USER     || 'root',
  password:           process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
  database:           process.env.DB_NAME     || process.env.MYSQL_DATABASE || 'crm_aphernzz',
  waitForConnections: true,
  connectionLimit:    10,
  charset:            'utf8mb4',
});

// ─── Helpers ──────────────────────────────────────────────
const db = (sql, params) => pool.execute(sql, params);

async function audit(tabla, registro_id, accion, antes, despues, usuario, ip) {
  await db(
    `INSERT INTO historial_cambios
       (tabla, registro_id, accion, datos_antes, datos_despues, usuario_id, usuario_nombre, ip)
     VALUES (?,?,?,?,?,?,?,?)`,
    [tabla, registro_id, accion,
     antes   ? JSON.stringify(antes)   : null,
     despues ? JSON.stringify(despues) : null,
     usuario?.id || null, usuario?.nombre || null, ip || null]
  );
}

function nextFolio(prefix, count) {
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const [[user]] = await db(
    `SELECT u.*, r.nombre AS rol_nombre, r.permisos
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.email = ? AND u.activo = 1`, [email]
  );

  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  await db('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [user.id]);

  const permisos = typeof user.permisos === 'string'
    ? JSON.parse(user.permisos) : user.permisos;

  const token = jwt.sign(
    { id: user.id, nombre: user.nombre, email: user.email,
      rol: user.rol_nombre, permisos },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '8h' }
  );

  res.json({
    token,
    usuario: { id: user.id, nombre: user.nombre, email: user.email,
               rol: user.rol_nombre, avatar_color: user.avatar_color, permisos }
  });
});

// ═══════════════════════════════════════════════════════════
//  CLIENTES
// ═══════════════════════════════════════════════════════════

app.get('/api/clientes', authMiddleware, requirePerm('clientes','ver'), async (req, res) => {
  const { q, segmento, estado } = req.query;
  let sql = `SELECT c.*, u.nombre AS asesor
             FROM clientes c LEFT JOIN usuarios u ON u.id = c.usuario_asignado
             WHERE 1=1`;
  const p = [];
  if (q)        { sql += ' AND (c.nombre LIKE ? OR c.empresa LIKE ? OR c.email LIKE ?)'; p.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (segmento) { sql += ' AND c.segmento = ?'; p.push(segmento); }
  if (estado)   { sql += ' AND c.estado = ?';   p.push(estado);   }
  sql += ' ORDER BY c.nombre';
  const [rows] = await db(sql, p);
  res.json(rows);
});

app.get('/api/clientes/:id', authMiddleware, requirePerm('clientes','ver'), async (req, res) => {
  const [[row]] = await db('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

app.post('/api/clientes', authMiddleware, requirePerm('clientes','crear'), async (req, res) => {
  const { nombre, empresa='', rfc='', email='', telefono='', celular='',
          ciudad='', estado_rep='', pais='México', codigo_postal='',
          segmento='Pequeño', sitio_web='', notas='',
          fecha_primer_contacto=null } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

  const [r] = await db(
    `INSERT INTO clientes
       (nombre,empresa,rfc,email,telefono,celular,ciudad,estado_rep,pais,
        codigo_postal,segmento,sitio_web,notas,fecha_primer_contacto,
        usuario_asignado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [nombre,empresa,rfc,email,telefono,celular,ciudad,estado_rep,pais,
     codigo_postal,segmento,sitio_web,notas,fecha_primer_contacto||null,
     req.user.id]
  );
  const [[nuevo]] = await db('SELECT * FROM clientes WHERE id = ?', [r.insertId]);
  await audit('clientes', r.insertId, 'crear', null, nuevo, req.user, req.ip);
  res.status(201).json(nuevo);
});

app.put('/api/clientes/:id', authMiddleware, requirePerm('clientes','editar'), async (req, res) => {
  const [[antes]] = await db('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
  if (!antes) return res.status(404).json({ error: 'No encontrado' });

  const { nombre,empresa,rfc,email,telefono,celular,ciudad,estado_rep,pais,
          codigo_postal,segmento,estado,sitio_web,notas,
          usuario_asignado,fecha_primer_contacto } = req.body;

  await db(
    `UPDATE clientes SET
       nombre=?,empresa=?,rfc=?,email=?,telefono=?,celular=?,ciudad=?,
       estado_rep=?,pais=?,codigo_postal=?,segmento=?,estado=?,
       sitio_web=?,notas=?,usuario_asignado=?,fecha_primer_contacto=?
     WHERE id=?`,
    [nombre,empresa,rfc,email,telefono,celular,ciudad,estado_rep,pais,
     codigo_postal,segmento,estado,sitio_web,notas,
     usuario_asignado||null,fecha_primer_contacto||null, req.params.id]
  );
  const [[despues]] = await db('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
  await audit('clientes', +req.params.id, 'editar', antes, despues, req.user, req.ip);
  res.json(despues);
});

app.delete('/api/clientes/:id', authMiddleware, requirePerm('clientes','eliminar'), async (req, res) => {
  const [[row]] = await db('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  await db('DELETE FROM clientes WHERE id = ?', [req.params.id]);
  await audit('clientes', +req.params.id, 'eliminar', row, null, req.user, req.ip);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  PROSPECTOS
// ═══════════════════════════════════════════════════════════

app.get('/api/prospectos', authMiddleware, requirePerm('prospectos','ver'), async (req, res) => {
  const { etapa, fuente } = req.query;
  let sql = 'SELECT * FROM prospectos WHERE 1=1';
  const p = [];
  if (etapa)  { sql += ' AND etapa = ?';  p.push(etapa);  }
  if (fuente) { sql += ' AND fuente = ?'; p.push(fuente); }
  sql += ' ORDER BY FIELD(etapa,"Contacto","Interés","Propuesta","Negociación","Cerrado"), nombre';
  const [rows] = await db(sql, p);
  res.json(rows);
});

app.post('/api/prospectos', authMiddleware, requirePerm('prospectos','crear'), async (req, res) => {
  const { nombre, empresa='', rfc='', email='', telefono='', celular='',
          ciudad='', valor_estimado=0, moneda='MXN', fuente='Otro',
          etapa='Contacto', probabilidad=20, fecha_cierre_estimada=null, notas='' } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

  const [r] = await db(
    `INSERT INTO prospectos
       (nombre,empresa,rfc,email,telefono,celular,ciudad,valor_estimado,
        moneda,fuente,etapa,probabilidad,fecha_cierre_estimada,notas,usuario_asignado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [nombre,empresa,rfc,email,telefono,celular,ciudad,valor_estimado,
     moneda,fuente,etapa,probabilidad,fecha_cierre_estimada||null,notas,req.user.id]
  );
  const [[nuevo]] = await db('SELECT * FROM prospectos WHERE id = ?', [r.insertId]);
  await audit('prospectos', r.insertId, 'crear', null, nuevo, req.user, req.ip);
  res.status(201).json(nuevo);
});

app.put('/api/prospectos/:id', authMiddleware, requirePerm('prospectos','editar'), async (req, res) => {
  const [[antes]] = await db('SELECT * FROM prospectos WHERE id = ?', [req.params.id]);
  if (!antes) return res.status(404).json({ error: 'No encontrado' });

  const { nombre,empresa,rfc,email,telefono,celular,ciudad,valor_estimado,
          moneda,fuente,etapa,probabilidad,fecha_cierre_estimada,notas,razon_perdida } = req.body;

  await db(
    `UPDATE prospectos SET
       nombre=?,empresa=?,rfc=?,email=?,telefono=?,celular=?,ciudad=?,
       valor_estimado=?,moneda=?,fuente=?,etapa=?,probabilidad=?,
       fecha_cierre_estimada=?,notas=?,razon_perdida=?
     WHERE id=?`,
    [nombre,empresa,rfc,email,telefono,celular,ciudad,valor_estimado,
     moneda,fuente,etapa,probabilidad,fecha_cierre_estimada||null,notas,
     razon_perdida||null, req.params.id]
  );
  const [[despues]] = await db('SELECT * FROM prospectos WHERE id = ?', [req.params.id]);
  await audit('prospectos', +req.params.id, 'editar', antes, despues, req.user, req.ip);
  res.json(despues);
});

app.delete('/api/prospectos/:id', authMiddleware, requirePerm('prospectos','eliminar'), async (req, res) => {
  const [[row]] = await db('SELECT * FROM prospectos WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  await db('DELETE FROM prospectos WHERE id = ?', [req.params.id]);
  await audit('prospectos', +req.params.id, 'eliminar', row, null, req.user, req.ip);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  COTIZACIONES
// ═══════════════════════════════════════════════════════════

app.get('/api/cotizaciones', authMiddleware, requirePerm('cotizaciones','ver'), async (req, res) => {
  const { estado, q } = req.query;
  let sql = `SELECT c.*, u.nombre AS usuario_nombre
             FROM cotizaciones c LEFT JOIN usuarios u ON u.id = c.usuario_id
             WHERE 1=1`;
  const p = [];
  if (estado) { sql += ' AND c.estado = ?'; p.push(estado); }
  if (q)      { sql += ' AND (c.cliente_nombre LIKE ? OR c.folio LIKE ?)'; p.push(`%${q}%`,`%${q}%`); }
  sql += ' ORDER BY c.created_at DESC';
  const [cots] = await db(sql, p);

  // Adjuntar items a cada cotización
  for (const c of cots) {
    const [items] = await db(
      'SELECT * FROM cotizacion_items WHERE cotizacion_id = ? ORDER BY orden, id',
      [c.id]
    );
    c.items = items;
  }
  res.json(cots);
});

app.get('/api/cotizaciones/:id', authMiddleware, requirePerm('cotizaciones','ver'), async (req, res) => {
  const [[cot]] = await db('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
  if (!cot) return res.status(404).json({ error: 'No encontrado' });
  const [items] = await db(
    'SELECT * FROM cotizacion_items WHERE cotizacion_id = ? ORDER BY orden, id',
    [cot.id]
  );
  cot.items = items;
  res.json(cot);
});

app.post('/api/cotizaciones', authMiddleware, requirePerm('cotizaciones','crear'), async (req, res) => {
  const { cliente_id=null, prospecto_id=null, cliente_nombre, vinculo='',
          fecha_emision, fecha_vigencia, estado='Borrador',
          iva_pct=16, notas='', items=[], moneda='MXN' } = req.body;
  if (!cliente_nombre) return res.status(400).json({ error: 'El cliente es requerido' });
  if (!items.length)   return res.status(400).json({ error: 'Se requiere al menos un concepto' });

  // Calcular totales
  let subtotal = 0;
  items.forEach(it => {
    const st = Number(it.cantidad)*Number(it.precio_unitario)*(1-Number(it.descuento_pct||0)/100);
    it._subtotal = st;
    subtotal += st;
  });
  const iva   = subtotal * (iva_pct / 100);
  const total = subtotal + iva;

  // Folio
  const [[{cnt}]] = await db('SELECT COUNT(*) AS cnt FROM cotizaciones');
  const folio = nextFolio('COT', cnt);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [r] = await conn.execute(
      `INSERT INTO cotizaciones
         (folio,cliente_id,prospecto_id,cliente_nombre,vinculo,
          fecha_emision,fecha_vigencia,estado,subtotal,iva_pct,iva,total,
          moneda,notas,usuario_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [folio,cliente_id||null,prospecto_id||null,cliente_nombre,vinculo,
       fecha_emision,fecha_vigencia,estado,subtotal,iva_pct,iva,total,
       moneda,notas,req.user.id]
    );
    const cotId = r.insertId;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await conn.execute(
        `INSERT INTO cotizacion_items
           (cotizacion_id,descripcion,unidad,cantidad,precio_unitario,descuento_pct,subtotal,orden)
         VALUES (?,?,?,?,?,?,?,?)`,
        [cotId, it.descripcion||it.desc, it.unidad||'pieza',
         it.cantidad||it.cant||1, it.precio_unitario||it.pu||0,
         it.descuento_pct||it.desc_pct||0, it._subtotal, i]
      );
    }
    await conn.commit();
    conn.release();

    const [[nueva]] = await db('SELECT * FROM cotizaciones WHERE id = ?', [cotId]);
    const [nItems]  = await db('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?', [cotId]);
    nueva.items = nItems;
    await audit('cotizaciones', cotId, 'crear', null, nueva, req.user, req.ip);
    res.status(201).json(nueva);
  } catch (e) {
    await conn.rollback();
    conn.release();
    throw e;
  }
});

app.put('/api/cotizaciones/:id/estado', authMiddleware, requirePerm('cotizaciones','editar'), async (req, res) => {
  const { estado } = req.body;
  const [[cot]] = await db('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
  if (!cot) return res.status(404).json({ error: 'No encontrado' });
  await db('UPDATE cotizaciones SET estado = ? WHERE id = ?', [estado, req.params.id]);
  await audit('cotizaciones', +req.params.id, 'cambio_estado',
    { estado: cot.estado }, { estado }, req.user, req.ip);
  res.json({ ok: true, estado });
});

app.delete('/api/cotizaciones/:id', authMiddleware, requirePerm('cotizaciones','eliminar'), async (req, res) => {
  const [[row]] = await db('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  await db('DELETE FROM cotizaciones WHERE id = ?', [req.params.id]);  // items eliminados por CASCADE
  await audit('cotizaciones', +req.params.id, 'eliminar', row, null, req.user, req.ip);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  VENTAS
// ═══════════════════════════════════════════════════════════

app.get('/api/ventas', authMiddleware, requirePerm('ventas','ver'), async (req, res) => {
  const [rows] = await db(
    `SELECT v.*, u.nombre AS usuario_nombre
     FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id
     ORDER BY v.fecha DESC, v.id DESC`
  );
  res.json(rows);
});

app.post('/api/ventas', authMiddleware, requirePerm('ventas','crear'), async (req, res) => {
  const { cliente_id=null, cliente_nombre, descripcion='', monto,
          moneda='MXN', fecha, estado='Completada',
          origen='Manual', cotizacion_id=null } = req.body;
  if (!cliente_nombre) return res.status(400).json({ error: 'El cliente es requerido' });
  if (!monto)          return res.status(400).json({ error: 'El monto es requerido' });

  const [[{cnt}]] = await db('SELECT COUNT(*) AS cnt FROM ventas');
  const folio = nextFolio('VTA', cnt);

  const [r] = await db(
    `INSERT INTO ventas
       (folio,cliente_id,cliente_nombre,descripcion,monto,moneda,
        fecha,estado,origen,cotizacion_id,usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [folio,cliente_id||null,cliente_nombre,descripcion,monto,moneda,
     fecha,estado,origen,cotizacion_id||null,req.user.id]
  );
  const [[nueva]] = await db('SELECT * FROM ventas WHERE id = ?', [r.insertId]);
  await audit('ventas', r.insertId, 'crear', null, nueva, req.user, req.ip);
  res.status(201).json(nueva);
});

app.put('/api/ventas/:id', authMiddleware, requirePerm('ventas','editar'), async (req, res) => {
  const { estado } = req.body;
  const [[venta]] = await db('SELECT * FROM ventas WHERE id = ?', [req.params.id]);
  if (!venta) return res.status(404).json({ error: 'No encontrado' });
  await db('UPDATE ventas SET estado = ? WHERE id = ?', [estado, req.params.id]);
  await audit('ventas', +req.params.id, 'cambio_estado',
    { estado: venta.estado }, { estado }, req.user, req.ip);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  FACTURAS
// ═══════════════════════════════════════════════════════════

app.get('/api/facturas', authMiddleware, requirePerm('facturas','ver'), async (req, res) => {
  const [rows] = await db(
    `SELECT f.*, u.nombre AS usuario_nombre
     FROM facturas f LEFT JOIN usuarios u ON u.id = f.usuario_id
     ORDER BY f.fecha_emision DESC, f.id DESC`
  );
  res.json(rows);
});

app.post('/api/facturas', authMiddleware, requirePerm('facturas','crear'), async (req, res) => {
  const { cliente_id=null, cliente_nombre, venta_id=null, cotizacion_id=null,
          concepto, subtotal=0, iva=0, monto, moneda='MXN',
          fecha_emision, fecha_vencimiento=null, estado='Pendiente', notas='' } = req.body;
  if (!cliente_nombre) return res.status(400).json({ error: 'El cliente es requerido' });
  if (!monto)          return res.status(400).json({ error: 'El monto es requerido' });

  const [[{cnt}]] = await db('SELECT COUNT(*) AS cnt FROM facturas');
  const folio = nextFolio('FAC', cnt);

  const [r] = await db(
    `INSERT INTO facturas
       (folio,cliente_id,cliente_nombre,venta_id,cotizacion_id,concepto,
        subtotal,iva,monto,moneda,fecha_emision,fecha_vencimiento,estado,notas,usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [folio,cliente_id||null,cliente_nombre,venta_id||null,cotizacion_id||null,concepto,
     subtotal,iva,monto,moneda,fecha_emision,fecha_vencimiento||null,estado,notas,req.user.id]
  );
  const [[nueva]] = await db('SELECT * FROM facturas WHERE id = ?', [r.insertId]);
  await audit('facturas', r.insertId, 'crear', null, nueva, req.user, req.ip);
  res.status(201).json(nueva);
});

app.put('/api/facturas/:id', authMiddleware, requirePerm('facturas','editar'), async (req, res) => {
  const [[factura]] = await db('SELECT * FROM facturas WHERE id = ?', [req.params.id]);
  if (!factura) return res.status(404).json({ error: 'No encontrado' });

  const { estado, metodo_pago=null, referencia_pago=null, fecha_pago=null } = req.body;
  await db(
    'UPDATE facturas SET estado=?, metodo_pago=?, referencia_pago=?, fecha_pago=? WHERE id=?',
    [estado, metodo_pago, referencia_pago, fecha_pago||null, req.params.id]
  );
  await audit('facturas', +req.params.id, 'cambio_estado',
    { estado: factura.estado }, { estado }, req.user, req.ip);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  ACTIVIDADES
// ═══════════════════════════════════════════════════════════

app.get('/api/actividades', authMiddleware, requirePerm('actividades','ver'), async (req, res) => {
  const { estado, tipo, relacion_tipo, relacion_id } = req.query;
  let sql = `SELECT a.*, u.nombre AS usuario_nombre
             FROM actividades a LEFT JOIN usuarios u ON u.id = a.usuario_id
             WHERE 1=1`;
  const p = [];
  if (estado)       { sql += ' AND a.estado = ?';       p.push(estado); }
  if (tipo)         { sql += ' AND a.tipo = ?';         p.push(tipo); }
  if (relacion_tipo){ sql += ' AND a.relacion_tipo = ?'; p.push(relacion_tipo); }
  if (relacion_id)  { sql += ' AND a.relacion_id = ?';  p.push(relacion_id); }
  sql += ' ORDER BY a.fecha DESC, a.prioridad DESC';
  const [rows] = await db(sql, p);
  res.json(rows);
});

app.post('/api/actividades', authMiddleware, requirePerm('actividades','crear'), async (req, res) => {
  const { tipo='Tarea', titulo, relacion_tipo=null, relacion_id=null,
          relacion_nombre='', fecha, hora=null, duracion_min=null,
          estado='Pendiente', prioridad='Normal', notas='' } = req.body;
  if (!titulo) return res.status(400).json({ error: 'El título es requerido' });

  const [r] = await db(
    `INSERT INTO actividades
       (tipo,titulo,relacion_tipo,relacion_id,relacion_nombre,
        fecha,hora,duracion_min,estado,prioridad,notas,usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [tipo,titulo,relacion_tipo||null,relacion_id||null,relacion_nombre,
     fecha,hora||null,duracion_min||null,estado,prioridad,notas,req.user.id]
  );
  const [[nueva]] = await db('SELECT * FROM actividades WHERE id = ?', [r.insertId]);
  await audit('actividades', r.insertId, 'crear', null, nueva, req.user, req.ip);
  res.status(201).json(nueva);
});

app.put('/api/actividades/:id', authMiddleware, requirePerm('actividades','editar'), async (req, res) => {
  const [[act]] = await db('SELECT * FROM actividades WHERE id = ?', [req.params.id]);
  if (!act) return res.status(404).json({ error: 'No encontrado' });

  const { estado, resultado=null, notas } = req.body;
  await db(
    'UPDATE actividades SET estado=?, resultado=?, notas=? WHERE id=?',
    [estado, resultado, notas||act.notas, req.params.id]
  );
  await audit('actividades', +req.params.id, 'cambio_estado',
    { estado: act.estado }, { estado }, req.user, req.ip);
  res.json({ ok: true });
});

app.delete('/api/actividades/:id', authMiddleware, requirePerm('actividades','eliminar'), async (req, res) => {
  const [[row]] = await db('SELECT * FROM actividades WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  await db('DELETE FROM actividades WHERE id = ?', [req.params.id]);
  await audit('actividades', +req.params.id, 'eliminar', row, null, req.user, req.ip);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  USUARIOS (solo superadmin / admin con permiso)
// ═══════════════════════════════════════════════════════════

app.get('/api/usuarios', authMiddleware, requirePerm('usuarios','ver'), async (req, res) => {
  const [rows] = await db(
    `SELECT u.id, u.nombre, u.email, u.activo, u.avatar_color,
            u.ultimo_acceso, u.created_at, r.nombre AS rol_nombre, r.id AS rol_id
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     ORDER BY u.nombre`
  );
  res.json(rows);
});

app.post('/api/usuarios', authMiddleware, requirePerm('usuarios','crear'), async (req, res) => {
  const { nombre, email, password, rol_id, activo=1, avatar_color='purple' } = req.body;
  if (!nombre || !email || !password || !rol_id)
    return res.status(400).json({ error: 'Nombre, email, contraseña y rol son requeridos' });

  const [[exist]] = await db('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (exist) return res.status(409).json({ error: 'El email ya está registrado' });

  const hash = await bcrypt.hash(password, 10);
  const [r] = await db(
    'INSERT INTO usuarios (nombre,email,password_hash,rol_id,activo,avatar_color) VALUES (?,?,?,?,?,?)',
    [nombre, email, hash, rol_id, activo, avatar_color]
  );
  const [[nuevo]] = await db(
    'SELECT id,nombre,email,rol_id,activo,avatar_color,created_at FROM usuarios WHERE id=?',
    [r.insertId]
  );
  res.status(201).json(nuevo);
});

app.put('/api/usuarios/:id', authMiddleware, requirePerm('usuarios','editar'), async (req, res) => {
  const { nombre, email, rol_id, activo, avatar_color, password } = req.body;
  const [[user]] = await db('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'No encontrado' });

  let hash = user.password_hash;
  if (password) hash = await bcrypt.hash(password, 10);

  await db(
    'UPDATE usuarios SET nombre=?,email=?,rol_id=?,activo=?,avatar_color=?,password_hash=? WHERE id=?',
    [nombre,email,rol_id,activo,avatar_color,hash,req.params.id]
  );
  const [[updated]] = await db(
    'SELECT id,nombre,email,rol_id,activo,avatar_color,updated_at FROM usuarios WHERE id=?',
    [req.params.id]
  );
  res.json(updated);
});

app.delete('/api/usuarios/:id', authMiddleware, requirePerm('usuarios','eliminar'), async (req, res) => {
  if (+req.params.id === req.user.id)
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  const [[user]] = await db('SELECT id FROM usuarios WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  await db('UPDATE usuarios SET activo = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  ROLES
// ═══════════════════════════════════════════════════════════

app.get('/api/roles', authMiddleware, async (req, res) => {
  const [rows] = await db('SELECT id, nombre, descripcion FROM roles ORDER BY id');
  res.json(rows);
});

// ═══════════════════════════════════════════════════════════
//  HISTORIAL / AUDITORÍA
// ═══════════════════════════════════════════════════════════

app.get('/api/historial/:tabla/:id', authMiddleware, async (req, res) => {
  const [rows] = await db(
    `SELECT h.*, u.nombre AS usuario
     FROM historial_cambios h LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.tabla = ? AND h.registro_id = ?
     ORDER BY h.created_at DESC LIMIT 50`,
    [req.params.tabla, req.params.id]
  );
  res.json(rows);
});

// ═══════════════════════════════════════════════════════════
//  DASHBOARD — KPIs
// ═══════════════════════════════════════════════════════════

app.get('/api/dashboard', authMiddleware, async (req, res) => {
  const [[kClientes]]    = await db("SELECT COUNT(*) AS n FROM clientes WHERE estado='Activo'");
  const [[kProspectos]]  = await db("SELECT COUNT(*) AS n FROM prospectos WHERE etapa != 'Cerrado'");
  const [[kVentas]]      = await db("SELECT COALESCE(SUM(monto),0) AS n FROM ventas WHERE estado='Completada' AND MONTH(fecha)=MONTH(NOW()) AND YEAR(fecha)=YEAR(NOW())");
  const [[kCotTotal]]    = await db("SELECT COUNT(*) AS total, SUM(CASE WHEN estado IN ('Aceptada','Facturada') THEN 1 ELSE 0 END) AS aceptadas FROM cotizaciones");
  const [recientesCot]   = await db("SELECT * FROM cotizaciones ORDER BY created_at DESC LIMIT 5");
  const [pendActividades]= await db("SELECT * FROM actividades WHERE estado='Pendiente' ORDER BY fecha ASC LIMIT 5");
  const [ventasMes]      = await db(`
    SELECT MONTH(fecha) AS mes, SUM(monto) AS total
    FROM ventas WHERE estado='Completada' AND YEAR(fecha)=YEAR(NOW())
    GROUP BY MONTH(fecha) ORDER BY mes
  `);

  res.json({
    kClientes:   kClientes.n,
    kProspectos: kProspectos.n,
    kVentas:     kVentas.n,
    kConversion: kCotTotal.total
      ? Math.round((kCotTotal.aceptadas / kCotTotal.total) * 100) : 0,
    recientesCot,
    pendActividades,
    ventasMes,
  });
});

// ─── Error handler ─────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── Auto-setup DB ─────────────────────────────────────────
async function initDB() {
  const conn = await pool.getConnection();
  try {
    // Tablas
    await conn.execute(`CREATE TABLE IF NOT EXISTS roles (
      id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL UNIQUE, descripcion VARCHAR(200),
      permisos JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS usuarios (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
      rol_id TINYINT UNSIGNED NOT NULL, activo TINYINT(1) NOT NULL DEFAULT 1,
      avatar_color VARCHAR(20) DEFAULT 'purple', ultimo_acceso TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (rol_id) REFERENCES roles(id) ON UPDATE CASCADE) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS clientes (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(150) NOT NULL,
      empresa VARCHAR(150), rfc VARCHAR(20), email VARCHAR(150), telefono VARCHAR(30),
      ciudad VARCHAR(100), segmento ENUM('Pequeño','Mediano','Grande','Gobierno','Corporativo') DEFAULT 'Pequeño',
      estado ENUM('Activo','Inactivo','Bloqueado') DEFAULT 'Activo', notas TEXT,
      usuario_asignado INT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_asignado) REFERENCES usuarios(id) ON DELETE SET NULL) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS prospectos (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(150) NOT NULL,
      empresa VARCHAR(150), email VARCHAR(150), telefono VARCHAR(30),
      valor_estimado DECIMAL(14,2) DEFAULT 0.00,
      fuente ENUM('Referido','Redes sociales','Llamada fría','WhatsApp','Web','Evento','Email','Otro') DEFAULT 'Otro',
      etapa ENUM('Contacto','Interés','Propuesta','Negociación','Cerrado') DEFAULT 'Contacto',
      notas TEXT, usuario_asignado INT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_asignado) REFERENCES usuarios(id) ON DELETE SET NULL) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS cotizaciones (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, folio VARCHAR(20) NOT NULL UNIQUE,
      cliente_id INT UNSIGNED NULL, prospecto_id INT UNSIGNED NULL,
      cliente_nombre VARCHAR(150) NOT NULL, vinculo VARCHAR(50),
      fecha_emision DATE NOT NULL, fecha_vigencia DATE NOT NULL,
      estado ENUM('Borrador','Enviada','Aceptada','Rechazada','Facturada') DEFAULT 'Borrador',
      subtotal DECIMAL(14,2) DEFAULT 0, iva_pct DECIMAL(5,2) DEFAULT 16,
      iva DECIMAL(14,2) DEFAULT 0, total DECIMAL(14,2) DEFAULT 0,
      notas TEXT, usuario_id INT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS cotizacion_items (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, cotizacion_id INT UNSIGNED NOT NULL,
      descripcion VARCHAR(500) NOT NULL, cantidad DECIMAL(10,2) DEFAULT 1,
      precio_unitario DECIMAL(14,2) DEFAULT 0, descuento_pct DECIMAL(5,2) DEFAULT 0,
      subtotal DECIMAL(14,2) DEFAULT 0, orden TINYINT UNSIGNED DEFAULT 0,
      FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS ventas (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, folio VARCHAR(20) NOT NULL UNIQUE,
      cliente_id INT UNSIGNED NULL, cliente_nombre VARCHAR(150) NOT NULL,
      descripcion VARCHAR(500), monto DECIMAL(14,2) DEFAULT 0,
      fecha DATE NOT NULL, estado ENUM('Completada','Pendiente','Cancelada') DEFAULT 'Completada',
      origen VARCHAR(100) DEFAULT 'Manual', cotizacion_id INT UNSIGNED NULL,
      usuario_id INT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS facturas (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, folio VARCHAR(20) NOT NULL UNIQUE,
      cliente_id INT UNSIGNED NULL, cliente_nombre VARCHAR(150) NOT NULL,
      cotizacion_id INT UNSIGNED NULL, concepto VARCHAR(500) NOT NULL,
      subtotal DECIMAL(14,2) DEFAULT 0, iva DECIMAL(14,2) DEFAULT 0,
      monto DECIMAL(14,2) DEFAULT 0, fecha_emision DATE NOT NULL,
      fecha_vencimiento DATE NULL, fecha_pago DATE NULL,
      estado ENUM('Pendiente','Pagada','Vencida','Cancelada') DEFAULT 'Pendiente',
      usuario_id INT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS actividades (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      tipo ENUM('Llamada','WhatsApp','Email','Reunión','Tarea','Visita') DEFAULT 'Tarea',
      titulo VARCHAR(200) NOT NULL, relacion_nombre VARCHAR(150),
      fecha DATE NOT NULL, estado ENUM('Pendiente','Completada','Cancelada') DEFAULT 'Pendiente',
      notas TEXT, usuario_id INT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS historial_cambios (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tabla VARCHAR(50) NOT NULL,
      registro_id INT UNSIGNED NOT NULL,
      accion ENUM('crear','editar','eliminar','cambio_estado') NOT NULL,
      datos_antes JSON NULL, datos_despues JSON NULL,
      usuario_id INT UNSIGNED NULL, usuario_nombre VARCHAR(100), ip VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);

    // Roles
    const roles = [
      ['superadmin','Acceso total','{"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":true},"prospectos":{"ver":true,"crear":true,"editar":true,"eliminar":true},"cotizaciones":{"ver":true,"crear":true,"editar":true,"eliminar":true},"ventas":{"ver":true,"crear":true,"editar":true,"eliminar":true},"facturas":{"ver":true,"crear":true,"editar":true,"eliminar":true},"actividades":{"ver":true,"crear":true,"editar":true,"eliminar":true},"usuarios":{"ver":true,"crear":true,"editar":true,"eliminar":true},"reportes":{"ver":true}}'],
      ['admin','Administrador sin gestión de usuarios','{"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":true},"prospectos":{"ver":true,"crear":true,"editar":true,"eliminar":true},"cotizaciones":{"ver":true,"crear":true,"editar":true,"eliminar":true},"ventas":{"ver":true,"crear":true,"editar":true,"eliminar":true},"facturas":{"ver":true,"crear":true,"editar":true,"eliminar":true},"actividades":{"ver":true,"crear":true,"editar":true,"eliminar":true},"usuarios":{"ver":false,"crear":false,"editar":false,"eliminar":false},"reportes":{"ver":true}}'],
      ['vendedor','Ejecutivo de ventas','{"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":false},"prospectos":{"ver":true,"crear":true,"editar":true,"eliminar":false},"cotizaciones":{"ver":true,"crear":true,"editar":true,"eliminar":false},"ventas":{"ver":true,"crear":true,"editar":false,"eliminar":false},"facturas":{"ver":true,"crear":false,"editar":false,"eliminar":false},"actividades":{"ver":true,"crear":true,"editar":true,"eliminar":true},"usuarios":{"ver":false,"crear":false,"editar":false,"eliminar":false},"reportes":{"ver":false}}'],
      ['soporte','Solo actividades','{"clientes":{"ver":true,"crear":false,"editar":false,"eliminar":false},"prospectos":{"ver":true,"crear":false,"editar":false,"eliminar":false},"cotizaciones":{"ver":true,"crear":false,"editar":false,"eliminar":false},"ventas":{"ver":true,"crear":false,"editar":false,"eliminar":false},"facturas":{"ver":true,"crear":false,"editar":false,"eliminar":false},"actividades":{"ver":true,"crear":true,"editar":true,"eliminar":false},"usuarios":{"ver":false,"crear":false,"editar":false,"eliminar":false},"reportes":{"ver":false}}'],
    ];
    for (const [nombre, desc, perms] of roles) {
      await conn.execute(
        'INSERT IGNORE INTO roles (nombre, descripcion, permisos) VALUES (?,?,?)',
        [nombre, desc, perms]
      );
    }

    // Usuario admin
    const [[exist]] = await conn.execute('SELECT id FROM usuarios WHERE email=?', ['admin@aphernzz.com']);
    if (!exist) {
      const hash = await bcrypt.hash('aphernzz2024', 10);
      await conn.execute(
        'INSERT INTO usuarios (nombre,email,password_hash,rol_id) VALUES (?,?,?,1)',
        ['Admin Principal','admin@aphernzz.com', hash]
      );
      console.log('  ✓ Usuario admin creado: admin@aphernzz.com');
    }
    console.log('  ✓ Base de datos lista\n');
  } finally {
    conn.release();
  }
}

// ─── Start ─────────────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () => console.log(`\n  CRM Aphernzz corriendo en http://localhost:${PORT}\n`)))
  .catch(err => { console.error('Error iniciando DB:', err.message); process.exit(1); });
