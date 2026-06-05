<?php
// ============================================================
//  RESET CONTRASEÑA ADMIN — Uso único
//  1. Sube este archivo a public_html/CRM/reset_admin.php
//  2. Visita https://aphernzz.com/CRM/reset_admin.php
//  3. BORRA este archivo inmediatamente después
// ============================================================

define('DB_HOST', 'localhost');
define('DB_USER', 'fbbeaaem_adminap');
define('DB_PASS', 'Alwasy@1009');
define('DB_NAME', 'fbbeaaem_crm_aphernzz');

$email    = 'admin@aphernzz.com';
$password = 'aphernzz2024';

header('Content-Type: text/html; charset=utf-8');
echo '<pre style="font-family:monospace;font-size:14px;padding:20px">';

// 1. Conectar SIN base de datos para ver qué bases tiene el usuario
try {
    $pdo0 = new PDO('mysql:host='.DB_HOST.';charset=utf8mb4', DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    echo "✓ Usuario y contraseña MySQL correctos\n\n";
    $dbs = $pdo0->query('SHOW DATABASES')->fetchAll(PDO::FETCH_COLUMN);
    echo "Bases de datos accesibles:\n";
    $target = null;
    foreach ($dbs as $db) {
        $mark = ($db === DB_NAME) ? ' ← USADA' : '';
        echo "  - {$db}{$mark}\n";
        // Autodetectar si contiene 'crm'
        if (!$target && stripos($db, 'crm') !== false) $target = $db;
    }
    // Usar DB_NAME si existe, si no la autodetectada
    $useDb = in_array(DB_NAME, $dbs) ? DB_NAME : ($target ?? $dbs[0] ?? null);
    if (!$useDb) { echo "\n✗ No hay ninguna base de datos accesible.\n"; exit; }
    if ($useDb !== DB_NAME) echo "\n⚠  Usando '{$useDb}' (DB_NAME='" . DB_NAME . "' no encontrada)\n";
    echo "\n";
} catch (PDOException $e) {
    echo "✗ ERROR: " . $e->getMessage() . "\n";
    echo "\nVerifica DB_USER y DB_PASS en este archivo.\n";
    exit;
}

// 2. Conectar a la base de datos correcta
try {
    $pdo = new PDO("mysql:host=".DB_HOST.";dbname={$useDb};charset=utf8mb4", DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    echo "✓ Conectado a la base de datos: {$useDb}\n";
} catch (PDOException $e) {
    echo "✗ ERROR de conexión: " . $e->getMessage() . "\n";
    exit;
}

// 2. Verificar que existe la tabla usuarios
try {
    $count = $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
    echo "✓ Tabla usuarios existe — {$count} usuario(s)\n";
} catch (PDOException $e) {
    echo "✗ La tabla 'usuarios' no existe. Importa el schema primero.\n";
    exit;
}

// 3. Generar hash PHP-nativo
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);
echo "✓ Hash generado: {$hash}\n";

// 4. Buscar usuario
$st = $pdo->prepare('SELECT id, email FROM usuarios WHERE email=?');
$st->execute([$email]);
$user = $st->fetch(PDO::FETCH_ASSOC);

if ($user) {
    // Actualizar hash
    $pdo->prepare('UPDATE usuarios SET password_hash=?, activo=1 WHERE email=?')
        ->execute([$hash, $email]);
    echo "✓ Contraseña actualizada para: {$email}\n";
} else {
    // Insertar usuario admin
    $pdo->prepare('INSERT INTO usuarios (nombre, email, password_hash, rol_id, activo, avatar_color) VALUES (?,?,?,1,1,"purple")')
        ->execute(['Admin Principal', $email, $hash]);
    echo "✓ Usuario admin creado: {$email}\n";
}

echo "\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
echo "  Email:     {$email}\n";
echo "  Password:  {$password}\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
echo "\n⚠  BORRA este archivo ahora desde el File Manager de cPanel.\n";
echo '</pre>';
