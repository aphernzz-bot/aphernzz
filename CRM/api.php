<?php
// ============================================================
//  CRM Aphernzz — API PHP  (Hostgator / cPanel)
//  Sube este archivo a:  public_html/CRM/api.php
//  Ruta de llamadas:     /CRM/api.php?_p=/api/...
// ============================================================

// ── CREDENCIALES ────────────────────────────────────────────
// Rellena con los datos de tu MySQL en cPanel
define('DB_HOST', 'localhost');
define('DB_USER', 'fbbeaaem_adminap');    // ← cPanel → MySQL → Usuarios
define('DB_PASS', 'Alwasy@1009');   // ← el password que asignaste
define('DB_NAME', 'fbbeaaem_crm_aphernzz');    // ← p.ej. aphernzz_crm
define('JWT_SECRET', '19dc637c4b6947d8c7919ad2cd443cb9370e9cbc19c820fcb3d98322bc1a7a619e1d37694f2543c28b5594b37972d1df');
define('JWT_EXP', 86400); // 24 horas

// ── HEADERS ─────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── HELPERS ─────────────────────────────────────────────────
function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function err($msg, $code = 400) { out(['error' => $msg], $code); }
function body() { return json_decode(file_get_contents('php://input'), true) ?? []; }
function nvl($v, $d = null) { return isset($v) ? $v : $d; }

// ── JWT ─────────────────────────────────────────────────────
function b64u($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function jwtEncode($payload) {
    $h  = b64u(json_encode(['alg'=>'HS256','typ'=>'JWT']));
    $payload['iat'] = time();
    $payload['exp'] = time() + JWT_EXP;
    $pl = b64u(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $sig = b64u(hash_hmac('sha256', "$h.$pl", JWT_SECRET, true));
    return "$h.$pl.$sig";
}
function jwtDecode($token) {
    $parts = explode('.', $token ?? '');
    if (count($parts) !== 3) return null;
    [$h, $pl, $sig] = $parts;
    $expected = b64u(hash_hmac('sha256', "$h.$pl", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(base64_decode(strtr($pl, '-_', '+/')), true);
    if (!$data || ($data['exp'] ?? 0) < time()) return null;
    return $data;
}

// ── PDO ─────────────────────────────────────────────────────
function db() {
    static $pdo;
    if ($pdo) return $pdo;
    try {
        $pdo = new PDO(
            'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES   => false]
        );
    } catch (PDOException $e) {
        err('Error de base de datos: '.$e->getMessage(), 503);
    }
    return $pdo;
}
function q($sql, $p = []) { $s = db()->prepare($sql); $s->execute($p); return $s; }
function row($sql, $p = []) { return q($sql, $p)->fetch() ?: null; }
function rows($sql, $p = []) { return q($sql, $p)->fetchAll(); }
function lid() { return (int) db()->lastInsertId(); }

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
function requireAuth() {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $h, $m)) err('Token requerido', 401);
    $tk = jwtDecode($m[1]);
    if (!$tk) err('Token inválido o expirado', 401);
    $u = row('SELECT u.*, r.nombre AS rol, r.permisos FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=? AND u.activo=1', [$tk['id']]);
    if (!$u) err('Usuario no encontrado', 401);
    $u['permisos'] = json_decode($u['permisos'], true) ?? [];
    return $u;
}
function can($u, $mod, $op) { return !empty($u['permisos'][$mod][$op]); }

// ── AUDITORÍA ────────────────────────────────────────────────
function audit($tabla, $id, $accion, $antes, $despues, $u) {
    try {
        q('INSERT INTO historial_cambios (tabla,registro_id,accion,datos_antes,datos_despues,usuario_id,usuario_nombre,ip) VALUES (?,?,?,?,?,?,?,?)',
          [$tabla, $id, $accion,
           $antes   ? json_encode($antes,   JSON_UNESCAPED_UNICODE) : null,
           $despues ? json_encode($despues, JSON_UNESCAPED_UNICODE) : null,
           $u['id'], $u['nombre'], $_SERVER['REMOTE_ADDR'] ?? null]);
    } catch (Exception $e) {}
}

// ── ROUTING ─────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$path   = urldecode($_GET['_p'] ?? '/');
if (($qi = strpos($path, '?')) !== false) $path = substr($path, 0, $qi);
$path = rtrim($path, '/') ?: '/';
$seg    = explode('/', ltrim($path, '/'));  // ['api','clientes','5','accion']
$base   = $seg[1] ?? '';
$rawSub = $seg[2] ?? '';
$id     = (is_numeric($rawSub) && $rawSub !== '') ? (int)$rawSub : null;
$sub    = $rawSub;       // string como 'login','me' o ID numérico
$action = $seg[3] ?? ''; // 4.º segmento: 'validar','estado', etc.

// ============================================================
//  /api/auth
// ============================================================
if ($base === 'auth') {
    // POST /api/auth/login
    if ($sub === 'login' && $method === 'POST') {
        $b = body();
        $u = row('SELECT u.*, r.nombre AS rol, r.permisos FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.email=? AND u.activo=1', [trim($b['email'] ?? '')]);
        if (!$u || !password_verify($b['password'] ?? '', $u['password_hash'])) err('Email o contraseña incorrectos', 401);
        q('UPDATE usuarios SET ultimo_acceso=NOW() WHERE id=?', [$u['id']]);
        $permisos = json_decode($u['permisos'], true) ?? [];
        $token = jwtEncode(['id'=>$u['id'],'email'=>$u['email'],'rol'=>$u['rol']]);
        out(['token'=>$token,'usuario'=>['id'=>$u['id'],'nombre'=>$u['nombre'],'email'=>$u['email'],'rol'=>$u['rol'],'avatar_color'=>$u['avatar_color'],'permisos'=>$permisos]]);
    }
    // GET /api/auth/me
    if ($sub === 'me' && $method === 'GET') {
        $u = requireAuth();
        out(['id'=>$u['id'],'nombre'=>$u['nombre'],'email'=>$u['email'],'rol'=>$u['rol'],'avatar_color'=>$u['avatar_color'],'permisos'=>$u['permisos']]);
    }
    err('Ruta no encontrada', 404);
}

// ── Todas las rutas siguientes requieren token ───────────────
$U = requireAuth();

// ============================================================
//  /api/dashboard
// ============================================================
if ($base === 'dashboard' && $method === 'GET') {
    $clTot  = (int)row('SELECT COUNT(*) c FROM clientes')['c'];
    $clAct  = (int)row('SELECT COUNT(*) c FROM clientes WHERE estado="Activo"')['c'];
    $prosp  = (int)row('SELECT COUNT(*) c FROM prospectos WHERE etapa != "Cerrado"')['c'];
    $vMes   = (float)row('SELECT COALESCE(SUM(monto),0) t FROM ventas WHERE MONTH(fecha)=MONTH(CURDATE()) AND YEAR(fecha)=YEAR(CURDATE()) AND estado="Completada"')['t'];
    $vAnt   = (float)row('SELECT COALESCE(SUM(monto),0) t FROM ventas WHERE MONTH(fecha)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) AND YEAR(fecha)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) AND estado="Completada"')['t'];
    $cotP   = (int)row('SELECT COUNT(*) c FROM cotizaciones WHERE estado IN ("Borrador","Enviada")')['c'];
    $facP   = (int)row('SELECT COUNT(*) c FROM facturas WHERE estado="Pendiente"')['c'];
    $actH   = (int)row('SELECT COUNT(*) c FROM actividades WHERE fecha=CURDATE() AND estado="Pendiente"')['c'];
    $pipe   = rows('SELECT etapa, COUNT(*) n, COALESCE(SUM(valor_estimado),0) valor FROM prospectos WHERE etapa!="Cerrado" GROUP BY etapa');
    $recAct = rows('SELECT tipo,titulo,DATE_FORMAT(created_at,"%d/%m/%Y") fecha FROM actividades ORDER BY created_at DESC LIMIT 5');
    $crec   = $vAnt > 0 ? round(($vMes - $vAnt) / $vAnt * 100, 1) : 0;
    out(['clientes'=>$clTot,'clientesActivos'=>$clAct,'prospectos'=>$prosp,
         'ventasMes'=>$vMes,'crecimiento'=>$crec,
         'cotizacionesPendientes'=>$cotP,'facturasPendientes'=>$facP,
         'actividadesHoy'=>$actH,'pipeline'=>$pipe,'actividadesRecientes'=>$recAct]);
}

// ============================================================
//  /api/reportes
// ============================================================
if ($base === 'reportes' && $method === 'GET') {
    if (!can($U,'reportes','ver')) err('Sin permiso', 403);
    $tipo = $_GET['tipo'] ?? 'ventas';
    if ($tipo === 'ventas') {
        $data = rows('SELECT DATE_FORMAT(fecha,"%Y-%m") mes, SUM(monto) total, COUNT(*) num FROM ventas WHERE estado="Completada" GROUP BY mes ORDER BY mes DESC LIMIT 12');
        out($data);
    }
    if ($tipo === 'clientes') {
        $data = rows('SELECT segmento, COUNT(*) n FROM clientes GROUP BY segmento');
        out($data);
    }
    if ($tipo === 'pipeline') {
        $data = rows('SELECT etapa, COUNT(*) n, COALESCE(SUM(valor_estimado),0) valor FROM prospectos GROUP BY etapa');
        out($data);
    }
    out([]);
}

// ============================================================
//  /api/clientes
// ============================================================
if ($base === 'clientes') {
    if (!can($U,'clientes','ver')) err('Sin permiso', 403);

    if ($method === 'GET' && !$id) {
        $sql = 'SELECT c.*, u.nombre AS asesor FROM clientes c LEFT JOIN usuarios u ON u.id=c.usuario_asignado WHERE 1=1';
        $p = [];
        if (!empty($_GET['q'])) { $like='%'.$_GET['q'].'%'; $sql.=' AND (c.nombre LIKE ? OR c.empresa LIKE ? OR c.email LIKE ?)'; $p[]=$like;$p[]=$like;$p[]=$like; }
        if (!empty($_GET['estado']))   { $sql.=' AND c.estado=?';   $p[]=$_GET['estado']; }
        if (!empty($_GET['segmento'])) { $sql.=' AND c.segmento=?'; $p[]=$_GET['segmento']; }
        $sql .= ' ORDER BY c.created_at DESC LIMIT 500';
        out(rows($sql, $p));
    }
    if ($method === 'GET' && $id) {
        $r = row('SELECT * FROM clientes WHERE id=?', [$id]);
        if (!$r) err('No encontrado', 404);
        out($r);
    }
    if ($method === 'POST') {
        if (!can($U,'clientes','crear')) err('Sin permiso', 403);
        $b = body();
        if (empty($b['nombre'])) err('El nombre es requerido');
        q('INSERT INTO clientes (nombre,empresa,rfc,email,telefono,celular,ciudad,estado_rep,pais,codigo_postal,segmento,estado,sitio_web,notas,usuario_asignado,fecha_primer_contacto) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [$b['nombre'],nvl($b['empresa']),nvl($b['rfc']),nvl($b['email']),nvl($b['telefono']),nvl($b['celular']),
           nvl($b['ciudad']),nvl($b['estado_rep']),$b['pais']??'México',nvl($b['codigo_postal']),
           $b['segmento']??'Pequeño',$b['estado']??'Activo',nvl($b['sitio_web']),nvl($b['notas']),
           nvl($b['usuario_asignado']),nvl($b['fecha_primer_contacto'])]);
        $nuevo = row('SELECT * FROM clientes WHERE id=?', [lid()]);
        audit('clientes', $nuevo['id'], 'crear', null, $nuevo, $U);
        out($nuevo, 201);
    }
    if (in_array($method, ['PUT','PATCH']) && $id) {
        if (!can($U,'clientes','editar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM clientes WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        $b = body();
        q('UPDATE clientes SET nombre=?,empresa=?,rfc=?,email=?,telefono=?,celular=?,ciudad=?,estado_rep=?,pais=?,codigo_postal=?,segmento=?,estado=?,sitio_web=?,notas=?,usuario_asignado=?,fecha_primer_contacto=? WHERE id=?',
          [$b['nombre']??$a['nombre'],nvl($b['empresa']??$a['empresa']),nvl($b['rfc']??$a['rfc']),
           nvl($b['email']??$a['email']),nvl($b['telefono']??$a['telefono']),nvl($b['celular']??$a['celular']),
           nvl($b['ciudad']??$a['ciudad']),nvl($b['estado_rep']??$a['estado_rep']),$b['pais']??$a['pais'],
           nvl($b['codigo_postal']??$a['codigo_postal']),$b['segmento']??$a['segmento'],$b['estado']??$a['estado'],
           nvl($b['sitio_web']??$a['sitio_web']),nvl($b['notas']??$a['notas']),
           nvl($b['usuario_asignado']??$a['usuario_asignado']),nvl($b['fecha_primer_contacto']??$a['fecha_primer_contacto']),$id]);
        $nuevo = row('SELECT * FROM clientes WHERE id=?', [$id]);
        audit('clientes', $id, 'editar', $a, $nuevo, $U);
        out($nuevo);
    }
    if ($method === 'DELETE' && $id) {
        if (!can($U,'clientes','eliminar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM clientes WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        q('DELETE FROM clientes WHERE id=?', [$id]);
        audit('clientes', $id, 'eliminar', $a, null, $U);
        out(['ok'=>true]);
    }
    err('Ruta no encontrada', 404);
}

// ============================================================
//  /api/prospectos
// ============================================================
if ($base === 'prospectos') {
    if (!can($U,'prospectos','ver')) err('Sin permiso', 403);

    if ($method === 'GET' && !$id) {
        $sql = 'SELECT p.*, u.nombre AS asesor FROM prospectos p LEFT JOIN usuarios u ON u.id=p.usuario_asignado WHERE 1=1';
        $p = [];
        if (!empty($_GET['q'])) { $like='%'.$_GET['q'].'%'; $sql.=' AND (p.nombre LIKE ? OR p.empresa LIKE ? OR p.email LIKE ?)'; $p[]=$like;$p[]=$like;$p[]=$like; }
        if (!empty($_GET['etapa']))  { $sql.=' AND p.etapa=?';  $p[]=$_GET['etapa']; }
        if (!empty($_GET['fuente'])) { $sql.=' AND p.fuente=?'; $p[]=$_GET['fuente']; }
        $sql .= ' ORDER BY p.created_at DESC LIMIT 500';
        out(rows($sql, $p));
    }
    if ($method === 'GET' && $id) {
        $r = row('SELECT * FROM prospectos WHERE id=?', [$id]);
        if (!$r) err('No encontrado', 404);
        out($r);
    }
    if ($method === 'POST') {
        if (!can($U,'prospectos','crear')) err('Sin permiso', 403);
        $b = body();
        if (empty($b['nombre'])) err('El nombre es requerido');
        q('INSERT INTO prospectos (nombre,empresa,rfc,email,telefono,celular,ciudad,valor_estimado,moneda,fuente,etapa,probabilidad,fecha_cierre_estimada,notas,usuario_asignado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [$b['nombre'],nvl($b['empresa']),nvl($b['rfc']),nvl($b['email']),nvl($b['telefono']),nvl($b['celular']),
           nvl($b['ciudad']),$b['valor_estimado']??0,$b['moneda']??'MXN',$b['fuente']??'Otro',
           $b['etapa']??'Contacto',$b['probabilidad']??20,nvl($b['fecha_cierre_estimada']),
           nvl($b['notas']),nvl($b['usuario_asignado'])]);
        $nuevo = row('SELECT * FROM prospectos WHERE id=?', [lid()]);
        audit('prospectos', $nuevo['id'], 'crear', null, $nuevo, $U);
        out($nuevo, 201);
    }
    if (in_array($method, ['PUT','PATCH']) && $id) {
        if (!can($U,'prospectos','editar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM prospectos WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        $b = body();
        q('UPDATE prospectos SET nombre=?,empresa=?,rfc=?,email=?,telefono=?,celular=?,ciudad=?,valor_estimado=?,moneda=?,fuente=?,etapa=?,probabilidad=?,fecha_cierre_estimada=?,notas=?,razon_perdida=?,usuario_asignado=? WHERE id=?',
          [$b['nombre']??$a['nombre'],nvl($b['empresa']??$a['empresa']),nvl($b['rfc']??$a['rfc']),
           nvl($b['email']??$a['email']),nvl($b['telefono']??$a['telefono']),nvl($b['celular']??$a['celular']),
           nvl($b['ciudad']??$a['ciudad']),$b['valor_estimado']??$a['valor_estimado'],$b['moneda']??$a['moneda'],
           $b['fuente']??$a['fuente'],$b['etapa']??$a['etapa'],$b['probabilidad']??$a['probabilidad'],
           nvl($b['fecha_cierre_estimada']??$a['fecha_cierre_estimada']),nvl($b['notas']??$a['notas']),
           nvl($b['razon_perdida']??$a['razon_perdida']),nvl($b['usuario_asignado']??$a['usuario_asignado']),$id]);
        $nuevo = row('SELECT * FROM prospectos WHERE id=?', [$id]);
        audit('prospectos', $id, 'editar', $a, $nuevo, $U);
        out($nuevo);
    }
    if ($method === 'DELETE' && $id) {
        if (!can($U,'prospectos','eliminar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM prospectos WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        q('DELETE FROM prospectos WHERE id=?', [$id]);
        audit('prospectos', $id, 'eliminar', $a, null, $U);
        out(['ok'=>true]);
    }
    err('Ruta no encontrada', 404);
}

// ============================================================
//  /api/cotizaciones
// ============================================================
if ($base === 'cotizaciones') {
    if (!can($U,'cotizaciones','ver')) err('Sin permiso', 403);

    if ($method === 'GET' && !$id) {
        $sql = 'SELECT c.*, u.nombre AS asesor,
            (SELECT GROUP_CONCAT(ci.descripcion ORDER BY ci.orden,ci.id SEPARATOR ", ") FROM cotizacion_items ci WHERE ci.cotizacion_id=c.id) AS concepto_resumen
            FROM cotizaciones c LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE 1=1';
        $p = [];
        if (!empty($_GET['q']))      { $like='%'.$_GET['q'].'%'; $sql.=' AND (c.cliente_nombre LIKE ? OR c.folio LIKE ?)'; $p[]=$like;$p[]=$like; }
        if (!empty($_GET['estado'])) { $sql.=' AND c.estado=?'; $p[]=$_GET['estado']; }
        $sql .= ' ORDER BY c.created_at DESC LIMIT 500';
        out(rows($sql, $p));
    }
    if ($method === 'GET' && $id) {
        $cot = row('SELECT * FROM cotizaciones WHERE id=?', [$id]);
        if (!$cot) err('No encontrado', 404);
        $items = rows('SELECT * FROM cotizacion_items WHERE cotizacion_id=? ORDER BY orden,id', [$id]);
        $cot['items'] = $items;
        out($cot);
    }
    if ($method === 'POST') {
        if (!can($U,'cotizaciones','crear')) err('Sin permiso', 403);
        $b = body();
        if (empty($b['cliente_nombre'])) err('El nombre del cliente es requerido');
        // Auto-folio
        $ultimo = row('SELECT folio FROM cotizaciones ORDER BY id DESC LIMIT 1');
        $num = $ultimo ? ((int)substr($ultimo['folio'], 3) + 1) : 1;
        $folio = 'COT'.str_pad($num, 5, '0', STR_PAD_LEFT);
        $items = $b['items'] ?? [];
        $sub = 0;
        foreach ($items as $it) {
            $sub += (float)($it['cantidad']??1) * (float)($it['precio_unitario']??0) * (1 - (float)($it['descuento_pct']??0)/100);
        }
        $ivaPct = (float)($b['iva_pct']??16);
        $iva = $sub * $ivaPct / 100;
        $total = $sub + $iva;
        q('INSERT INTO cotizaciones (folio,cliente_id,prospecto_id,cliente_nombre,vinculo,fecha_emision,fecha_vigencia,estado,subtotal,iva_pct,iva,total,moneda,tipo_cambio,notas,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [$folio,nvl($b['cliente_id']),nvl($b['prospecto_id']),$b['cliente_nombre'],nvl($b['vinculo']),
           $b['fecha_emision']??date('Y-m-d'),$b['fecha_vigencia']??date('Y-m-d', strtotime('+30 days')),
           $b['estado']??'Borrador',$sub,$ivaPct,$iva,$total,$b['moneda']??'MXN',$b['tipo_cambio']??1,$b['notas']??null,$U['id']]);
        $cid = lid();
        foreach ($items as $i => $it) {
            $iSub = (float)($it['cantidad']??1) * (float)($it['precio_unitario']??0) * (1 - (float)($it['descuento_pct']??0)/100);
            q('INSERT INTO cotizacion_items (cotizacion_id,descripcion,unidad,cantidad,precio_unitario,descuento_pct,subtotal,orden) VALUES (?,?,?,?,?,?,?,?)',
              [$cid,$it['descripcion']??'',$it['unidad']??'pieza',$it['cantidad']??1,$it['precio_unitario']??0,$it['descuento_pct']??0,$iSub,$i]);
        }
        $nuevo = row('SELECT * FROM cotizaciones WHERE id=?', [$cid]);
        $nuevo['items'] = rows('SELECT * FROM cotizacion_items WHERE cotizacion_id=? ORDER BY orden,id', [$cid]);
        audit('cotizaciones', $cid, 'crear', null, $nuevo, $U);
        out($nuevo, 201);
    }
    if (in_array($method, ['PUT','PATCH']) && $id) {
        if (!can($U,'cotizaciones','editar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM cotizaciones WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        $b = body();
        $items = $b['items'] ?? null;
        $sub = $a['subtotal']; $ivaPct = $a['iva_pct']; $iva = $a['iva']; $total = $a['total'];
        if ($items !== null) {
            $sub = 0;
            foreach ($items as $it) {
                $sub += (float)($it['cantidad']??1) * (float)($it['precio_unitario']??0) * (1 - (float)($it['descuento_pct']??0)/100);
            }
            $ivaPct = (float)($b['iva_pct']??$a['iva_pct']);
            $iva = $sub * $ivaPct / 100;
            $total = $sub + $iva;
        }
        q('UPDATE cotizaciones SET cliente_id=?,prospecto_id=?,cliente_nombre=?,vinculo=?,fecha_emision=?,fecha_vigencia=?,estado=?,subtotal=?,iva_pct=?,iva=?,total=?,moneda=?,tipo_cambio=?,notas=? WHERE id=?',
          [nvl($b['cliente_id']??$a['cliente_id']),nvl($b['prospecto_id']??$a['prospecto_id']),
           $b['cliente_nombre']??$a['cliente_nombre'],nvl($b['vinculo']??$a['vinculo']),
           $b['fecha_emision']??$a['fecha_emision'],$b['fecha_vigencia']??$a['fecha_vigencia'],
           $b['estado']??$a['estado'],$sub,$ivaPct,$iva,$total,
           $b['moneda']??$a['moneda'],$b['tipo_cambio']??$a['tipo_cambio'],nvl($b['notas']??$a['notas']),$id]);
        if ($items !== null) {
            q('DELETE FROM cotizacion_items WHERE cotizacion_id=?', [$id]);
            foreach ($items as $i => $it) {
                $iSub = (float)($it['cantidad']??1) * (float)($it['precio_unitario']??0) * (1 - (float)($it['descuento_pct']??0)/100);
                q('INSERT INTO cotizacion_items (cotizacion_id,descripcion,unidad,cantidad,precio_unitario,descuento_pct,subtotal,orden) VALUES (?,?,?,?,?,?,?,?)',
                  [$id,$it['descripcion']??'',$it['unidad']??'pieza',$it['cantidad']??1,$it['precio_unitario']??0,$it['descuento_pct']??0,$iSub,$i]);
            }
        }
        $nuevo = row('SELECT * FROM cotizaciones WHERE id=?', [$id]);
        $nuevo['items'] = rows('SELECT * FROM cotizacion_items WHERE cotizacion_id=? ORDER BY orden,id', [$id]);
        audit('cotizaciones', $id, 'editar', $a, $nuevo, $U);
        out($nuevo);
    }
    if ($method === 'DELETE' && $id) {
        if (!can($U,'cotizaciones','eliminar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM cotizaciones WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        q('DELETE FROM cotizaciones WHERE id=?', [$id]); // items se borran en CASCADE
        audit('cotizaciones', $id, 'eliminar', $a, null, $U);
        out(['ok'=>true]);
    }
    err('Ruta no encontrada', 404);
}

// ============================================================
//  /api/ventas
// ============================================================
if ($base === 'ventas') {
    if (!can($U,'ventas','ver')) err('Sin permiso', 403);

    if ($method === 'GET' && !$id) {
        $sql = 'SELECT v.*, u.nombre AS asesor FROM ventas v LEFT JOIN usuarios u ON u.id=v.usuario_id WHERE 1=1';
        $p = [];
        if (!empty($_GET['q']))      { $like='%'.$_GET['q'].'%'; $sql.=' AND (v.cliente_nombre LIKE ? OR v.folio LIKE ?)'; $p[]=$like;$p[]=$like; }
        if (!empty($_GET['estado'])) { $sql.=' AND v.estado=?'; $p[]=$_GET['estado']; }
        if (!empty($_GET['desde']))  { $sql.=' AND v.fecha>=?'; $p[]=$_GET['desde']; }
        if (!empty($_GET['hasta']))  { $sql.=' AND v.fecha<=?'; $p[]=$_GET['hasta']; }
        $sql .= ' ORDER BY v.fecha DESC, v.id DESC LIMIT 500';
        out(rows($sql, $p));
    }
    if ($method === 'GET' && $id) {
        $r = row('SELECT * FROM ventas WHERE id=?', [$id]);
        if (!$r) err('No encontrado', 404);
        out($r);
    }
    if ($method === 'POST') {
        if (!can($U,'ventas','crear')) err('Sin permiso', 403);
        $b = body();
        if (empty($b['cliente_nombre'])) err('El nombre del cliente es requerido');
        $ultimo = row('SELECT folio FROM ventas ORDER BY id DESC LIMIT 1');
        $num = $ultimo ? ((int)substr($ultimo['folio'], 3) + 1) : 1;
        $folio = 'VTA'.str_pad($num, 5, '0', STR_PAD_LEFT);
        q('INSERT INTO ventas (folio,cliente_id,cliente_nombre,descripcion,monto,moneda,fecha,estado,origen,cotizacion_id,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [$folio,nvl($b['cliente_id']),$b['cliente_nombre'],nvl($b['descripcion']),(float)($b['monto']??0),
           $b['moneda']??'MXN',$b['fecha']??date('Y-m-d'),$b['estado']??'Completada',
           $b['origen']??'Manual',nvl($b['cotizacion_id']),$U['id']]);
        $nuevo = row('SELECT * FROM ventas WHERE id=?', [lid()]);
        audit('ventas', $nuevo['id'], 'crear', null, $nuevo, $U);
        out($nuevo, 201);
    }
    if (in_array($method, ['PUT','PATCH']) && $id) {
        if (!can($U,'ventas','editar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM ventas WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        $b = body();
        q('UPDATE ventas SET cliente_id=?,cliente_nombre=?,descripcion=?,monto=?,moneda=?,fecha=?,estado=?,origen=?,cotizacion_id=? WHERE id=?',
          [nvl($b['cliente_id']??$a['cliente_id']),$b['cliente_nombre']??$a['cliente_nombre'],
           nvl($b['descripcion']??$a['descripcion']),$b['monto']??$a['monto'],
           $b['moneda']??$a['moneda'],$b['fecha']??$a['fecha'],$b['estado']??$a['estado'],
           $b['origen']??$a['origen'],nvl($b['cotizacion_id']??$a['cotizacion_id']),$id]);
        $nuevo = row('SELECT * FROM ventas WHERE id=?', [$id]);
        audit('ventas', $id, 'editar', $a, $nuevo, $U);
        out($nuevo);
    }
    if ($method === 'DELETE' && $id) {
        if (!can($U,'ventas','eliminar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM ventas WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        q('DELETE FROM ventas WHERE id=?', [$id]);
        audit('ventas', $id, 'eliminar', $a, null, $U);
        out(['ok'=>true]);
    }
    err('Ruta no encontrada', 404);
}

// ============================================================
//  /api/facturas
// ============================================================
if ($base === 'facturas') {
    if (!can($U,'facturas','ver')) err('Sin permiso', 403);

    if ($method === 'GET' && !$id) {
        $sql = 'SELECT f.*, u.nombre AS asesor FROM facturas f LEFT JOIN usuarios u ON u.id=f.usuario_id WHERE 1=1';
        $p = [];
        if (!empty($_GET['q']))      { $like='%'.$_GET['q'].'%'; $sql.=' AND (f.cliente_nombre LIKE ? OR f.folio LIKE ?)'; $p[]=$like;$p[]=$like; }
        if (!empty($_GET['estado'])) { $sql.=' AND f.estado=?'; $p[]=$_GET['estado']; }
        $sql .= ' ORDER BY f.fecha_emision DESC, f.id DESC LIMIT 500';
        out(rows($sql, $p));
    }
    if ($method === 'GET' && $id) {
        $r = row('SELECT * FROM facturas WHERE id=?', [$id]);
        if (!$r) err('No encontrado', 404);
        out($r);
    }
    if ($method === 'POST') {
        if (!can($U,'facturas','crear')) err('Sin permiso', 403);
        $b = body();
        if (empty($b['cliente_nombre'])) err('El nombre del cliente es requerido');
        $ultimo = row('SELECT folio FROM facturas ORDER BY id DESC LIMIT 1');
        $num = $ultimo ? ((int)substr($ultimo['folio'], 3) + 1) : 1;
        $folio = 'FAC'.str_pad($num, 5, '0', STR_PAD_LEFT);
        $sub = (float)($b['subtotal']??($b['monto']??0));
        $iva = (float)($b['iva']??($sub*0.16));
        $total = (float)($b['monto']??($sub+$iva));
        q('INSERT INTO facturas (folio,cliente_id,cliente_nombre,venta_id,cotizacion_id,concepto,subtotal,iva,monto,moneda,fecha_emision,fecha_vencimiento,fecha_pago,estado,metodo_pago,referencia_pago,notas,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [$folio,nvl($b['cliente_id']),$b['cliente_nombre'],nvl($b['venta_id']),nvl($b['cotizacion_id']),
           $b['concepto']??'',$sub,$iva,$total,$b['moneda']??'MXN',
           $b['fecha_emision']??date('Y-m-d'),nvl($b['fecha_vencimiento']),nvl($b['fecha_pago']),
           $b['estado']??'Pendiente',nvl($b['metodo_pago']),nvl($b['referencia_pago']),nvl($b['notas']),$U['id']]);
        $nuevo = row('SELECT * FROM facturas WHERE id=?', [lid()]);
        audit('facturas', $nuevo['id'], 'crear', null, $nuevo, $U);
        out($nuevo, 201);
    }
    if (in_array($method, ['PUT','PATCH']) && $id) {
        if (!can($U,'facturas','editar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM facturas WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        $b = body();
        q('UPDATE facturas SET cliente_id=?,cliente_nombre=?,concepto=?,subtotal=?,iva=?,monto=?,moneda=?,fecha_emision=?,fecha_vencimiento=?,fecha_pago=?,estado=?,metodo_pago=?,referencia_pago=?,notas=? WHERE id=?',
          [nvl($b['cliente_id']??$a['cliente_id']),$b['cliente_nombre']??$a['cliente_nombre'],
           $b['concepto']??$a['concepto'],$b['subtotal']??$a['subtotal'],$b['iva']??$a['iva'],
           $b['monto']??$a['monto'],$b['moneda']??$a['moneda'],
           $b['fecha_emision']??$a['fecha_emision'],nvl($b['fecha_vencimiento']??$a['fecha_vencimiento']),
           nvl($b['fecha_pago']??$a['fecha_pago']),$b['estado']??$a['estado'],
           nvl($b['metodo_pago']??$a['metodo_pago']),nvl($b['referencia_pago']??$a['referencia_pago']),
           nvl($b['notas']??$a['notas']),$id]);
        $nuevo = row('SELECT * FROM facturas WHERE id=?', [$id]);
        audit('facturas', $id, 'editar', $a, $nuevo, $U);
        out($nuevo);
    }
    if ($method === 'DELETE' && $id) {
        if (!can($U,'facturas','eliminar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM facturas WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        q('DELETE FROM facturas WHERE id=?', [$id]);
        audit('facturas', $id, 'eliminar', $a, null, $U);
        out(['ok'=>true]);
    }
    err('Ruta no encontrada', 404);
}

// ============================================================
//  /api/actividades
// ============================================================
if ($base === 'actividades') {
    if (!can($U,'actividades','ver')) err('Sin permiso', 403);

    if ($method === 'GET' && !$id) {
        $sql = 'SELECT a.*, u.nombre AS asesor FROM actividades a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE 1=1';
        $p = [];
        if (!empty($_GET['q']))       { $like='%'.$_GET['q'].'%'; $sql.=' AND (a.titulo LIKE ? OR a.relacion_nombre LIKE ?)'; $p[]=$like;$p[]=$like; }
        if (!empty($_GET['estado']))  { $sql.=' AND a.estado=?';  $p[]=$_GET['estado']; }
        if (!empty($_GET['tipo']))    { $sql.=' AND a.tipo=?';    $p[]=$_GET['tipo']; }
        if (!empty($_GET['fecha']))   { $sql.=' AND a.fecha=?';   $p[]=$_GET['fecha']; }
        $sql .= ' ORDER BY a.fecha DESC, a.hora DESC LIMIT 500';
        out(rows($sql, $p));
    }
    if ($method === 'GET' && $id) {
        $r = row('SELECT * FROM actividades WHERE id=?', [$id]);
        if (!$r) err('No encontrado', 404);
        out($r);
    }
    if ($method === 'POST') {
        if (!can($U,'actividades','crear')) err('Sin permiso', 403);
        $b = body();
        if (empty($b['titulo'])) err('El título es requerido');
        q('INSERT INTO actividades (tipo,titulo,relacion_tipo,relacion_id,relacion_nombre,fecha,hora,duracion_min,estado,prioridad,notas,resultado,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [$b['tipo']??'Tarea',$b['titulo'],nvl($b['relacion_tipo']),nvl($b['relacion_id']),
           nvl($b['relacion_nombre']),$b['fecha']??date('Y-m-d'),nvl($b['hora']),nvl($b['duracion_min']),
           $b['estado']??'Pendiente',$b['prioridad']??'Normal',nvl($b['notas']),nvl($b['resultado']),
           $b['usuario_id']??$U['id']]);
        $nuevo = row('SELECT * FROM actividades WHERE id=?', [lid()]);
        audit('actividades', $nuevo['id'], 'crear', null, $nuevo, $U);
        out($nuevo, 201);
    }
    if (in_array($method, ['PUT','PATCH']) && $id) {
        if (!can($U,'actividades','editar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM actividades WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        $b = body();
        q('UPDATE actividades SET tipo=?,titulo=?,relacion_tipo=?,relacion_id=?,relacion_nombre=?,fecha=?,hora=?,duracion_min=?,estado=?,prioridad=?,notas=?,resultado=?,usuario_id=? WHERE id=?',
          [$b['tipo']??$a['tipo'],$b['titulo']??$a['titulo'],nvl($b['relacion_tipo']??$a['relacion_tipo']),
           nvl($b['relacion_id']??$a['relacion_id']),nvl($b['relacion_nombre']??$a['relacion_nombre']),
           $b['fecha']??$a['fecha'],nvl($b['hora']??$a['hora']),nvl($b['duracion_min']??$a['duracion_min']),
           $b['estado']??$a['estado'],$b['prioridad']??$a['prioridad'],nvl($b['notas']??$a['notas']),
           nvl($b['resultado']??$a['resultado']),$b['usuario_id']??$a['usuario_id'],$id]);
        $nuevo = row('SELECT * FROM actividades WHERE id=?', [$id]);
        audit('actividades', $id, 'editar', $a, $nuevo, $U);
        out($nuevo);
    }
    if ($method === 'DELETE' && $id) {
        if (!can($U,'actividades','eliminar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM actividades WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        q('DELETE FROM actividades WHERE id=?', [$id]);
        audit('actividades', $id, 'eliminar', $a, null, $U);
        out(['ok'=>true]);
    }
    err('Ruta no encontrada', 404);
}

// ============================================================
//  /api/roles
// ============================================================
if ($base === 'roles' && $method === 'GET') {
    $r = rows('SELECT id, nombre, descripcion, permisos FROM roles ORDER BY id');
    foreach ($r as &$row) $row['permisos'] = json_decode($row['permisos'], true) ?? [];
    out($r);
}

// ============================================================
//  /api/usuarios
// ============================================================
if ($base === 'usuarios') {
    if (!can($U,'usuarios','ver')) err('Sin permiso', 403);

    if ($method === 'GET' && !$id) {
        $r = rows('SELECT u.id,u.nombre,u.email,u.rol_id,r.nombre AS rol,u.activo,u.avatar_color,u.ultimo_acceso,u.created_at FROM usuarios u JOIN roles r ON r.id=u.rol_id ORDER BY u.id');
        out($r);
    }
    if ($method === 'GET' && $id) {
        $r = row('SELECT u.id,u.nombre,u.email,u.rol_id,r.nombre AS rol,u.activo,u.avatar_color,u.ultimo_acceso,u.created_at FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=?', [$id]);
        if (!$r) err('No encontrado', 404);
        out($r);
    }
    if ($method === 'POST') {
        if (!can($U,'usuarios','crear')) err('Sin permiso', 403);
        $b = body();
        if (empty($b['nombre']) || empty($b['email']) || empty($b['password'])) err('Nombre, email y contraseña son requeridos');
        $existe = row('SELECT id FROM usuarios WHERE email=?', [$b['email']]);
        if ($existe) err('Ya existe un usuario con ese email', 409);
        $hash = password_hash($b['password'], PASSWORD_BCRYPT, ['cost'=>10]);
        q('INSERT INTO usuarios (nombre,email,password_hash,rol_id,activo,avatar_color) VALUES (?,?,?,?,?,?)',
          [$b['nombre'],$b['email'],$hash,$b['rol_id']??2,$b['activo']??1,$b['avatar_color']??'purple']);
        $nuevo = row('SELECT u.id,u.nombre,u.email,u.rol_id,r.nombre AS rol,u.activo,u.avatar_color,u.created_at FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=?', [lid()]);
        audit('usuarios', $nuevo['id'], 'crear', null, $nuevo, $U);
        out($nuevo, 201);
    }
    if (in_array($method, ['PUT','PATCH']) && $id) {
        if (!can($U,'usuarios','editar')) err('Sin permiso', 403);
        $a = row('SELECT * FROM usuarios WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        $b = body();
        // Check email unique
        if (!empty($b['email']) && $b['email'] !== $a['email']) {
            $existe = row('SELECT id FROM usuarios WHERE email=? AND id!=?', [$b['email'], $id]);
            if ($existe) err('Ya existe un usuario con ese email', 409);
        }
        $hash = !empty($b['password']) ? password_hash($b['password'], PASSWORD_BCRYPT, ['cost'=>10]) : $a['password_hash'];
        q('UPDATE usuarios SET nombre=?,email=?,password_hash=?,rol_id=?,activo=?,avatar_color=? WHERE id=?',
          [$b['nombre']??$a['nombre'],$b['email']??$a['email'],$hash,
           $b['rol_id']??$a['rol_id'],$b['activo']??$a['activo'],$b['avatar_color']??$a['avatar_color'],$id]);
        $nuevo = row('SELECT u.id,u.nombre,u.email,u.rol_id,r.nombre AS rol,u.activo,u.avatar_color,u.created_at FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=?', [$id]);
        audit('usuarios', $id, 'editar', ['nombre'=>$a['nombre'],'email'=>$a['email'],'rol_id'=>$a['rol_id']], $nuevo, $U);
        out($nuevo);
    }
    if ($method === 'DELETE' && $id) {
        if (!can($U,'usuarios','eliminar')) err('Sin permiso', 403);
        if ($id === $U['id']) err('No puedes eliminar tu propia cuenta', 400);
        $a = row('SELECT id,nombre,email FROM usuarios WHERE id=?', [$id]);
        if (!$a) err('No encontrado', 404);
        q('DELETE FROM usuarios WHERE id=?', [$id]);
        audit('usuarios', $id, 'eliminar', $a, null, $U);
        out(['ok'=>true]);
    }
    err('Ruta no encontrada', 404);
}

// ============================================================
//  /api/facturas  — estado: validar
//  Además del CRUD ya existente, intercepta /api/facturas/:id/validar
// ============================================================
if ($base === 'facturas' && $id && $action === 'validar' && $method === 'POST') {
    // Solo admin/superadmin (permisos facturas.editar)
    if (!can($U,'facturas','editar')) err('Sin permiso', 403);
    $f = row('SELECT * FROM facturas WHERE id=?', [$id]);
    if (!$f) err('No encontrada', 404);
    // Máquina de estados: solo Emitida o Enviada puede validarse
    $permitidos = ['Emitida','Enviada'];
    if (!in_array($f['estado'], $permitidos))
        err('Solo se puede validar una factura en estado Emitida o Enviada. Estado actual: '.$f['estado'], 409);
    q('UPDATE facturas SET estado="Validada", validado_por=?, validado_at=NOW() WHERE id=?', [$U['id'], $id]);
    audit('facturas', $id, 'cambio_estado', ['estado'=>$f['estado']], ['estado'=>'Validada'], $U);
    out(row('SELECT * FROM facturas WHERE id=?', [$id]));
}

// ============================================================
//  /api/pagos
// ============================================================
if ($base === 'pagos') {
    if (!can($U,'facturas','ver')) err('Sin permiso', 403);

    // GET /api/pagos?factura_id=X  — historial de pagos de una factura
    if ($method === 'GET' && !$id) {
        if (empty($_GET['factura_id'])) err('Se requiere factura_id', 400);
        out(rows('SELECT p.*, u.nombre AS usuario FROM pagos p LEFT JOIN usuarios u ON u.id=p.usuario_id WHERE p.factura_id=? ORDER BY p.fecha_pago DESC, p.id DESC', [(int)$_GET['factura_id']]));
    }

    // POST /api/pagos  — registrar un pago
    if ($method === 'POST') {
        if (!can($U,'facturas','editar')) err('Sin permiso', 403);
        $b = body();
        if (empty($b['factura_id'])) err('factura_id requerido');
        if (empty($b['monto']) || (float)$b['monto'] <= 0) err('El monto debe ser mayor a 0');
        if (empty($b['metodo_pago'])) err('metodo_pago requerido');

        // ── Gate de integridad 1: la factura debe estar Validada, Enviada o Parcial ──
        $f = row('SELECT * FROM facturas WHERE id=?', [(int)$b['factura_id']]);
        if (!$f) err('Factura no encontrada', 404);
        $estadosAceptan = ['Validada','Enviada','Parcial'];
        if (!in_array($f['estado'], $estadosAceptan))
            err('La factura debe estar Validada antes de registrar un pago. Estado actual: '.$f['estado'], 409);

        // ── Gate de integridad 2: el pago no puede exceder el saldo pendiente ──
        $saldo = (float)$f['monto'] - (float)$f['monto_pagado'];
        $monto = (float)$b['monto'];
        if ($monto > $saldo + 0.001)
            err('El monto ('.$monto.') excede el saldo pendiente ('.$saldo.')', 409);

        // Insertar pago (el trigger actualiza factura automáticamente)
        db()->beginTransaction();
        try {
            q('INSERT INTO pagos (factura_id,monto,moneda,tipo_cambio,metodo_pago,referencia,fecha_pago,estado,notas,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
              [(int)$b['factura_id'],$monto,$b['moneda']??$f['moneda'],$b['tipo_cambio']??1,
               $b['metodo_pago'],nvl($b['referencia']),$b['fecha_pago']??date('Y-m-d'),
               'Confirmado',nvl($b['notas']),$U['id']]);
            $pid = lid();
            db()->commit();
        } catch (Exception $e) {
            db()->rollBack();
            err('Error al registrar el pago: '.$e->getMessage(), 500);
        }

        $pago = row('SELECT * FROM pagos WHERE id=?', [$pid]);
        $facturaActualizada = row('SELECT * FROM facturas WHERE id=?', [(int)$b['factura_id']]);
        audit('pagos', $pid, 'crear', null, $pago, $U);
        out(['pago'=>$pago,'factura'=>$facturaActualizada], 201);
    }

    // DELETE /api/pagos/:id  — rechazar/anular pago (el trigger revierte el saldo)
    if ($method === 'DELETE' && $id) {
        if (!can($U,'facturas','eliminar')) err('Sin permiso', 403);
        $p = row('SELECT * FROM pagos WHERE id=?', [$id]);
        if (!$p) err('Pago no encontrado', 404);
        if ($p['estado'] === 'Rechazado') err('El pago ya estaba anulado', 409);

        // Factura no puede estar Cancelada
        $f = row('SELECT estado FROM facturas WHERE id=?', [$p['factura_id']]);
        if ($f['estado'] === 'Cancelada') err('No se puede anular un pago de una factura cancelada', 409);

        db()->beginTransaction();
        try {
            q('UPDATE pagos SET estado="Rechazado" WHERE id=?', [$id]);
            db()->commit();
        } catch (Exception $e) {
            db()->rollBack();
            err('Error al anular el pago: '.$e->getMessage(), 500);
        }

        audit('pagos', $id, 'cambio_estado', ['estado'=>'Confirmado'], ['estado'=>'Rechazado'], $U);
        out(['ok'=>true,'factura'=>row('SELECT * FROM facturas WHERE id=?', [$p['factura_id']])]);
    }

    err('Ruta no encontrada', 404);
}

// ── Fallback ─────────────────────────────────────────────────
err('Ruta no encontrada', 404);
