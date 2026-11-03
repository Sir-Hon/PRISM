<?php
// Front controller for the PHP built-in server.
// Role portals: /student/ /faculty/ /registry/ and those host labels.
$uri = rawurldecode((string) (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/'));
if (!preg_match('#^/(student|faculty|registry)(/.*)?$#', $uri, $m)) {
    return false;
}
$rest = $m[2] ?? '/';
if ($rest === '' || $rest === '/') {
    $rest = '/login.html';
}
$root = realpath(__DIR__);
$path = realpath(__DIR__ . $rest);
if (!$path || !$root || strncmp($path, $root, strlen($root)) !== 0 || !is_file($path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    return true;
}
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
if ($ext === 'php') {
    require $path;
    return true;
}
$types = [
    'html' => 'text/html; charset=utf-8',
    'css' => 'text/css; charset=utf-8',
    'js' => 'text/javascript; charset=utf-8',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'svg' => 'image/svg+xml',
    'ico' => 'image/x-icon',
    'json' => 'application/json',
    'woff2' => 'font/woff2',
];
if (isset($types[$ext])) {
    header('Content-Type: ' . $types[$ext]);
}
readfile($path);
return true;
