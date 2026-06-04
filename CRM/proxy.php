<?php
/**
 * Proxy API → Render
 * Coloca este archivo en public_html/CRM/proxy.php
 */
$RENDER = 'https://aphernzz-crm.onrender.com';

// Extraer la ruta /api/... de la URI original
$uri   = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$query = $_SERVER['QUERY_STRING'] ?? '';
$path  = preg_replace('#^.*/CRM/proxy\.php#', '', $uri);
if (!$path) $path = '/';

$url = $RENDER . $path;
if ($query) $url .= '?' . $query;

// Headers a reenviar
$headers = ['Accept: application/json', 'Content-Type: application/json'];
if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
    $headers[] = 'Authorization: ' . $_SERVER['HTTP_AUTHORIZATION'];
}

// Body
$body   = file_get_contents('php://input');
$method = $_SERVER['REQUEST_METHOD'];

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 30,
]);
if ($body && in_array($method, ['POST', 'PUT', 'PATCH'])) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response  = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($http_code);
header('Content-Type: application/json; charset=utf-8');
echo $response;
