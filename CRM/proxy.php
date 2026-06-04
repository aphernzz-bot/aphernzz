<?php
/**
 * Proxy API → Render
 * Uso: /CRM/proxy.php?_p=/api/ruta&otros_params=valor
 */
$RENDER = 'https://aphernzz-crm.onrender.com';

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
    CURLOPT_TIMEOUT        => 30,
]);
if ($body && in_array($method, ['POST', 'PUT', 'PATCH'])) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response  = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($http_code ?: 500);
header('Content-Type: application/json; charset=utf-8');
echo $response;
