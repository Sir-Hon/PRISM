<?php
// ═══════════════════════════════════════════════════════
//  PRISM PORTAL — Database Configuration
//  Place this file at: htdocs/prism/api/config.php
// ═══════════════════════════════════════════════════════

ob_start();

// Optional production DB (InfinityFree, etc.): upload api/config.local.php with your real host/user/pass/db — not committed to git.
if (is_readable(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
}
if (!defined('DB_HOST')) {
    define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
}
if (!defined('DB_USER')) {
    define('DB_USER', getenv('DB_USER') ?: 'root');
}
if (!defined('DB_PASS')) {
    define('DB_PASS', getenv('DB_PASS') ?: '');
}
if (!defined('DB_NAME')) {
    define('DB_NAME', getenv('DB_NAME') ?: 'prism_db');
}
if (!defined('DB_PORT')) {
    define('DB_PORT', (int) (getenv('DB_PORT') ?: 3306));
}

// Upload directory (relative to this app folder). URL prefix follows the
// deployed path (/prism/uploads/ on XAMPP, /uploads/ at site root).
function prism_app_url_prefix() {
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $apiDir = dirname($script);
    $appDir = str_replace('\\', '/', dirname($apiDir));
    if ($appDir === '/' || $appDir === '.' || $appDir === '') {
        return '';
    }
    return rtrim($appDir, '/');
}
if (!defined('UPLOAD_DIR')) {
    define('UPLOAD_DIR', __DIR__ . '/../uploads/');
}
if (!defined('UPLOAD_URL')) {
    define('UPLOAD_URL', prism_app_url_prefix() . '/uploads/');
}
if (!defined('MAX_FILE_SIZE')) {
    define('MAX_FILE_SIZE', 15 * 1024 * 1024); // 15 MB
}

// Session settings
define('SESSION_NAME', 'prism_session');
define('SESSION_LIFETIME', 86400); // 24 hours

/**
 * Send JSON and discard any buffered warnings/HTML so the client always gets valid JSON.
 */
function prism_exit_json($data, $httpCode = 200) {
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    $flags = JSON_UNESCAPED_UNICODE;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    echo json_encode($data, $flags);
    exit;
}

function ok($data = []) {
    prism_exit_json(['ok' => true] + $data);
}

function fail($msg, $code = 400) {
    $out = ['error' => $msg];
    if (session_status() === PHP_SESSION_ACTIVE && !empty($_SESSION['csrf_token'])) {
        $out['csrf_token'] = $_SESSION['csrf_token'];
    }
    prism_exit_json($out, $code);
}

set_exception_handler(function (Throwable $e) {
    error_log('PRISM: ' . $e->getMessage());
    fail('Something went wrong. Please try again.', 500);
});

/** CTU Daanbantayan student ID: exactly 7 digits (not UP-style year-xxxxx). */
function prism_is_ctu_student_id($id): bool {
    return (bool) preg_match('/^[0-9]{7}$/', (string) $id);
}

/** College → program list for CTU Daanbantayan student registration. */
function prism_ctu_programs_by_college(): array {
    return [
        'CoED' => ['BEEd', 'BSEd-Mathematics', 'BTLEd-HE'],
        'CoTE' => ['BSFI', 'BSIE', 'BSIT', 'BSHM', 'BIT-ELEC', 'BIT-COMPTECH', 'BIT-AUTO'],
    ];
}

/** CTU Google Workspace / institutional email, e.g. name.surname@ctu.edu.ph */
function prism_normalize_ctu_email($email): string {
    return strtolower(trim((string) $email));
}

function prism_is_ctu_email($email): bool {
    $email = prism_normalize_ctu_email($email);
    return (bool) preg_match('/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@ctu\.edu\.ph$/', $email);
}

/** Stored as "PROGRAM YEAR-LETTER", e.g. "BSIT 1-A". */
function prism_is_ctu_student_section($section): bool {
    $section = trim((string) $section);
    if (!preg_match('/^(.+) ([1-4])-([A-F])$/', $section, $m)) {
        return false;
    }
    $program = $m[1];
    foreach (prism_ctu_programs_by_college() as $list) {
        if (in_array($program, $list, true)) {
            return true;
        }
    }
    return false;
}

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = 'mysql:host='.DB_HOST.';port='.DB_PORT.';dbname='.DB_NAME.';charset=utf8mb4';
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
            // Render's MySQL treats double quotes as column names. Keep strings as strings.
            $pdo->exec("SET SESSION sql_mode = REPLACE(@@SESSION.sql_mode, 'ANSI_QUOTES', '')");
        } catch (PDOException $e) {
            error_log('PRISM DB connection failed: ' . $e->getMessage());
            fail('Database connection failed', 500);
        }
    }
    return $pdo;
}

function prism_is_https(): bool {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }
    $fwd = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return $fwd === 'https';
}

function prism_request_host(): string {
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    $host = strtolower(explode(':', $host)[0]);
    return $host;
}

function prism_host_from_url(string $url): string {
    $h = parse_url($url, PHP_URL_HOST);
    return strtolower((string) $h);
}

/** Block cross-site POSTs from other origins. */
function prism_assert_same_origin(): void {
    $host = prism_request_host();
    if ($host === '') {
        return;
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '') {
        if (prism_host_from_url($origin) !== $host) {
            fail('Forbidden', 403);
        }
        return;
    }
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    if ($referer !== '') {
        if (prism_host_from_url($referer) !== $host) {
            fail('Forbidden', 403);
        }
        return;
    }
    // Some browsers omit Origin and Referer on same-site POSTs; session cookie still required.
}

function prism_csrf_token(): string {
    startSession();
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/** CSRF may arrive as a header, multipart field, JSON body, or query (hosts sometimes drop one of them). */
function prism_csrf_candidates(): array {
    $out = [];
    foreach (['HTTP_X_CSRF_TOKEN', 'HTTP_X_CSRFTOKEN'] as $k) {
        if (!empty($_SERVER[$k])) {
            $out[] = (string) $_SERVER[$k];
        }
    }
    if (!empty($_POST['csrf_token'])) {
        $out[] = (string) $_POST['csrf_token'];
    }
    $body = getBody();
    if (!empty($body['csrf_token'])) {
        $out[] = (string) $body['csrf_token'];
    }
    if (!empty($_GET['csrf_token'])) {
        $out[] = (string) $_GET['csrf_token'];
    }
    return $out;
}

/**
 * Write requests must come from this site. Logged-in writes also need the CSRF token.
 * $publicActions skip the token (login/register) but still need same-origin.
 */
function prism_guard_mutating_request(array $publicActions = []): void {
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }
    prism_assert_same_origin();
    $action = (string) ($_GET['action'] ?? '');
    if (in_array($action, $publicActions, true)) {
        return;
    }
    startSession();
    $want = (string) ($_SESSION['csrf_token'] ?? '');
    if ($want === '') {
        fail('Session expired. Refresh the page and try again.', 403);
    }
    foreach (prism_csrf_candidates() as $sent) {
        if ($sent !== '' && hash_equals($want, $sent)) {
            return;
        }
    }
    fail('Session expired. Refresh the page and try again.', 403);
}

function prism_client_ip(): string {
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/** Simple per-IP throttle for login/register (stops password spraying). */
function prism_rate_limit(string $bucket, int $max, int $windowSec): void {
    $ip = preg_replace('/[^0-9a-fA-F:.]/', '', prism_client_ip()) ?: '0';
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'prism_rl';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $file = $dir . DIRECTORY_SEPARATOR . hash('sha256', $bucket . '|' . $ip);
    $now = time();
    $hits = [];
    if (is_readable($file)) {
        $decoded = json_decode((string) file_get_contents($file), true);
        if (is_array($decoded)) {
            $hits = $decoded;
        }
    }
    $hits = array_values(array_filter($hits, static function ($t) use ($now, $windowSec) {
        return is_int($t) && $t > ($now - $windowSec);
    }));
    if (count($hits) >= $max) {
        fail('Too many attempts. Please wait a few minutes and try again.', 429);
    }
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
}

function prism_logout_session(): void {
    startSession();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $p['path'] ?? '/',
            'domain'   => $p['domain'] ?? '',
            'secure'   => (bool) ($p['secure'] ?? false),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
}

// ── CORS + JSON headers ──
function setHeaders() {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header('Cache-Control: no-store');

    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $host = prism_request_host();
    if ($origin !== '' && $host !== '' && prism_host_from_url($origin) === $host) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ── Session helper ──
function startSession() {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name(SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME,
        'path'     => '/',
        'secure'   => prism_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// ── Auth guard ──
function requireAuth($allowedRoles = []) {
    startSession();
    prism_guard_mutating_request();
    if (empty($_SESSION['user_id'])) {
        fail('Not authenticated', 401);
    }
    if (!empty($allowedRoles) && !in_array($_SESSION['role'], $allowedRoles, true)) {
        fail('Forbidden', 403);
    }
    return [
        'id'   => $_SESSION['user_id'],
        'role' => $_SESSION['role'],
        'name' => $_SESSION['name'],
    ];
}

// ── Get JSON body (cached — php://input can only be read once) ──
function getBody() {
    static $cached = null;
    static $done = false;
    if ($done) {
        return is_array($cached) ? $cached : [];
    }
    $done = true;
    $ct = (string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '');
    if (stripos($ct, 'multipart/form-data') !== false) {
        $cached = [];
        return $cached;
    }
    $raw = file_get_contents('php://input');
    $decoded = json_decode((string) $raw, true);
    $cached = is_array($decoded) ? $decoded : [];
    return $cached;
}

/** Teacher must own this class (row in classes). */
function prism_assert_teacher_owns_class(PDO $db, string $teacherId, string $classId): void {
    if ($classId === '') {
        fail('class_id required', 400);
    }
    $st = $db->prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?');
    $st->execute([$classId, $teacherId]);
    if (!$st->fetch()) {
        fail('Invalid class or not your class', 403);
    }
}

/** Student must be enrolled in this class. */
function prism_assert_student_enrolled(PDO $db, string $studentId, string $classId): void {
    if ($classId === '') {
        fail('class_id required', 400);
    }
    $st = $db->prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?');
    $st->execute([$classId, $studentId]);
    if (!$st->fetch()) {
        fail('You are not enrolled in this class', 403);
    }
}

/**
 * Read access to class-scoped content: teacher owns class, or student is enrolled.
 * Other roles are denied.
 */
/** Null/empty = visible to all sections in the class. */
function prism_target_section_from_body(array $b): ?string {
    $t = trim((string) ($b['target_section'] ?? ''));
    return $t === '' ? null : $t;
}

/** Trimmed profile section for the user (for students). Teachers return null. */
function prism_student_section_for_filter(PDO $db, array $user): ?string {
    if (($user['role'] ?? '') !== 'student') {
        return null;
    }
    $st = $db->prepare('SELECT section FROM users WHERE id = ?');
    $st->execute([$user['id']]);
    $row = $st->fetch();

    return trim((string) ($row['section'] ?? ''));
}

/** Block students when quiz is restricted to another section. */
function prism_assert_student_matches_quiz_section(PDO $db, array $user, array $quizRow): void {
    if (($user['role'] ?? '') !== 'student') {
        return;
    }
    if (!prism_table_has_column($db, 'quizzes', 'target_section')) {
        return;
    }
    $ts = trim((string) ($quizRow['target_section'] ?? ''));
    if ($ts === '') {
        return;
    }
    $su = $db->prepare('SELECT TRIM(COALESCE(section, \'\')) AS sec FROM users WHERE id = ?');
    $su->execute([$user['id']]);
    $sec = trim((string) ($su->fetch()['sec'] ?? ''));
    if ($sec !== $ts) {
        fail('This quiz is not assigned to your section.', 403);
    }
}

function prism_assert_class_access(PDO $db, array $user, string $classId): void {
    $role = $user['role'] ?? '';
    if ($role === 'teacher') {
        prism_assert_teacher_owns_class($db, $user['id'], $classId);

        return;
    }
    if ($role === 'student') {
        prism_assert_student_enrolled($db, $user['id'], $classId);

        return;
    }
    fail('Forbidden', 403);
}

/** End of deadline as Y-m-d H:i:s (server time). Empty time = 23:59:59 that day. */
function prism_due_end_datetime(?string $date, $time = null): ?string {
    if (!$date) {
        return null;
    }
    $t = ($time !== null && $time !== '') ? trim((string) $time) : '';
    if ($t === '') {
        return $date . ' 23:59:59';
    }
    if (strlen($t) === 5 && preg_match('/^\d{2}:\d{2}$/', $t)) {
        $t .= ':00';
    }

    return $date . ' ' . $t;
}

function prism_is_past_deadline(?string $date, $time = null): bool {
    $end = prism_due_end_datetime($date, $time);
    if (!$end) {
        return false;
    }

    return date('Y-m-d H:i:s') > $end;
}

function prism_ensure_upload_blobs(PDO $db): bool {
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }
    try {
        $db->exec(
            'CREATE TABLE IF NOT EXISTS upload_blobs (
                path VARCHAR(500) PRIMARY KEY,
                mime VARCHAR(120) DEFAULT NULL,
                name VARCHAR(200) DEFAULT NULL,
                bytes LONGBLOB NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        $ready = true;
    } catch (PDOException $e) {
        error_log('PRISM upload blobs: ' . $e->getMessage());
        $ready = false;
    }
    return $ready;
}

function prism_normalize_upload_path(string $path): string {
    $path = rawurldecode(trim($path));
    $path = str_replace('\\', '/', $path);
    if (preg_match('#^https?://#i', $path)) {
        $parts = parse_url($path);
        $path = (string) ($parts['path'] ?? '');
    }
    $at = strpos($path, '/uploads/');
    if ($at === false && strpos($path, 'uploads/') === 0) {
        $path = '/' . $path;
        $at = 0;
    }
    if ($at === false) {
        return '';
    }
    $path = substr($path, $at);
    $cut = strpos($path, '?');
    if ($cut !== false) {
        $path = substr($path, 0, $cut);
    }
    if (!preg_match('#^/uploads/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$#', $path)) {
        return '';
    }
    return $path;
}

function prism_blob_to_string($value): ?string {
    if (is_resource($value)) {
        $data = stream_get_contents($value);
        if ($data === false || $data === '') {
            return null;
        }
        return $data;
    }
    if (is_string($value) && $value !== '') {
        return $value;
    }
    return null;
}

function prism_save_upload_blob(string $urlPath, string $name, string $mime, string $bin): void {
    try {
        $db = getDB();
        if (!prism_ensure_upload_blobs($db)) {
            fail('Could not save the file on the server.', 500);
        }
        $stmt = $db->prepare(
            'INSERT INTO upload_blobs (path, mime, name, bytes) VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE mime=VALUES(mime), name=VALUES(name), bytes=VALUES(bytes)'
        );
        $stmt->bindValue(1, $urlPath);
        $stmt->bindValue(2, $mime);
        $stmt->bindValue(3, $name);
        $stmt->bindValue(4, $bin, PDO::PARAM_LOB);
        $stmt->execute();
    } catch (PDOException $e) {
        error_log('PRISM save upload blob: ' . $e->getMessage());
        fail('Could not save the file on the server.', 500);
    }
}

function prism_delete_upload_blob(string $urlPath): void {
    try {
        $db = getDB();
        if (!prism_ensure_upload_blobs($db)) {
            return;
        }
        $db->prepare('DELETE FROM upload_blobs WHERE path = ?')->execute([$urlPath]);
    } catch (PDOException $e) {
        error_log('PRISM delete upload blob: ' . $e->getMessage());
    }
}

/** True if the column exists (cached per request). Safe for known table/column names only. */
function prism_table_has_column(PDO $db, string $table, string $column): bool {
    static $cache = [];
    if (!preg_match('/^[a-z][a-z0-9_]{0,62}$/i', $table) || !preg_match('/^[a-z][a-z0-9_]{0,62}$/i', $column)) {
        return false;
    }
    $key = $table . "\0" . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        $t = '`' . str_replace('`', '', $table) . '`';
        $stmt = $db->query('SHOW COLUMNS FROM ' . $t . ' LIKE ' . $db->quote($column));
        $cache[$key] = $stmt && $stmt->rowCount() > 0;
    } catch (PDOException $e) {
        $cache[$key] = false;
    }

    return $cache[$key];
}
