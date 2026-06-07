<?php
// URL del backend Node.js — definir en CRM/.env como PROXY_TARGET
$_ef = __DIR__ . '/.env';
if (file_exists($_ef)) {
    foreach (file($_ef, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $_ln) {
        if ($_ln[0] === '#' || strpos($_ln, '=') === false) continue;
        [$_k, $_v] = explode('=', $_ln, 2);
        putenv(trim($_k) . '=' . trim($_v, " \t\r\"'"));
    }
} unset($_ef, $_ln, $_k, $_v);

$RENDER = getenv('PROXY_TARGET') ?: '';
if (!$RENDER) { http_response_code(503); echo json_encode(['error' => 'Proxy no configurado']); exit; }

$path  = urldecode($_GET['_p'] ?? '/');
$query = $_GET;
unset($query['_p']);

$url = $RENDER . $path;
if (!empty($query)) $url .= '?' . http_build_query($query);

$headers = ['Accept: application/json', 'Content-Type: application/json'];
if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
    $headers[] = 'Authorization: ' . $_SERVER['HTTP_AUTHORIZATION'];
}

$body   = file_get_contents('php://input');
$method = $_SERVER['REQUEST_METHOD'];

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_CONNECTTIMEOUT => 20,
]);
if ($body && in_array($method, ['POST', 'PUT', 'PATCH'])) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response  = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_err  = curl_error($ch);
$curl_errno= curl_errno($ch);
curl_close($ch);

header('Content-Type: application/json; charset=utf-8');

if ($curl_err) {
    error_log('[CRM-PROXY] ' . $curl_err . ' — ' . $url);
    http_response_code(502);
    echo json_encode(['error' => 'Error de conexión con el servidor. Intenta más tarde.']);
    exit;
}

http_response_code($http_code ?: 500);
echo $response;
