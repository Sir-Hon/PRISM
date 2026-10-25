<?php
// Streams a saved upload. The database copy survives a server restart.
require_once 'config.php';

startSession();
if (empty($_SESSION['user_id'])) {
    fail('Not authenticated', 401);
}

$path = prism_normalize_upload_path((string) ($_GET['path'] ?? ''));
if ($path === '') {
    fail('File not found', 404);
}

$mime = 'application/octet-stream';
$name = basename($path);
$bytes = null;

try {
    $db = getDB();
    if (prism_ensure_upload_blobs($db)) {
        $stmt = $db->prepare('SELECT mime, name, bytes FROM upload_blobs WHERE path = ?');
        $stmt->execute([$path]);
        $row = $stmt->fetch();
        if (!$row) {
            $base = basename($path);
            $like = '%/' . addcslashes($base, '%_\\');
            $stmt = $db->prepare("SELECT mime, name, bytes FROM upload_blobs WHERE path LIKE ? ESCAPE '\\\\' ORDER BY created_at DESC LIMIT 1");
            $stmt->execute([$like]);
            $row = $stmt->fetch();
        }
        $loaded = prism_blob_to_string($row['bytes'] ?? null);
        if ($loaded !== null) {
            $bytes = $loaded;
            if (!empty($row['mime'])) {
                $mime = (string) $row['mime'];
            }
            if (!empty($row['name'])) {
                $name = (string) $row['name'];
            }
        }
    }
} catch (PDOException $e) {
    error_log('PRISM read upload blob: ' . $e->getMessage());
}

if ($bytes === null) {
    $disk = UPLOAD_DIR . basename($path);
    if (is_file($disk)) {
        $bytes = file_get_contents($disk);
        $guess = function_exists('prism_mime_from_filename') ? prism_mime_from_filename($name) : '';
        if ($guess) {
            $mime = $guess;
        }
    }
}

if ($bytes === null || $bytes === false || $bytes === '') {
    fail('This file is no longer available. Ask your teacher to share it again.', 404);
}

$ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
$inline = in_array($ext, ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'txt', 'mp4', 'webm', 'mov', 'ogg', 'ogv'], true);
$safeName = str_replace(['"', "\r", "\n"], '', $name);

while (ob_get_level() > 0) {
    ob_end_clean();
}
header('Content-Type: ' . $mime);
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Content-Length: ' . strlen($bytes));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $safeName . '"');
header('Cache-Control: private, max-age=300');
echo $bytes;
exit;
