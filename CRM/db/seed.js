/**
 * Seed inicial — crea el usuario superadmin
 * Uso: node db/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seed() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || process.env.MYSQL_HOST     || 'localhost',
    port:     process.env.DB_PORT     || process.env.MYSQL_PORT     || 3306,
    user:     process.env.DB_USER     || process.env.MYSQL_USER     || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME     || process.env.MYSQL_DATABASE || 'crm_aphernzz',
  });

  const nombre   = 'Admin Principal';
  const email    = 'admin@aphernzz.com';
  const password = 'aphernzz2024';
  const hash     = await bcrypt.hash(password, 10);

  const [exist] = await conn.execute(
    'SELECT id FROM usuarios WHERE email = ?', [email]
  );

  if (exist.length) {
    console.log('✓ Usuario admin ya existe, actualizando contraseña...');
    await conn.execute(
      'UPDATE usuarios SET password_hash = ? WHERE email = ?', [hash, email]
    );
  } else {
    await conn.execute(
      'INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, 1)',
      [nombre, email, hash]
    );
    console.log('✓ Usuario superadmin creado');
  }

  console.log('\n  Email:    ', email);
  console.log('  Password: ', password);
  console.log('\n  Cambia la contraseña en Configuración → Usuarios.\n');
  await conn.end();
}

seed().catch(err => { console.error('Error:', err.message); process.exit(1); });
