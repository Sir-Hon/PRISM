<?php
// ═══════════════════════════════════════════════════════
//  PRISM PORTAL — Database Configuration
//  Place this file at: htdocs/prism/api/config.php
// ═══════════════════════════════════════════════════════

ob_start();

define('DB_HOST', 'localhost');
define('DB_USER', 'root');       // Change if you set a MySQL password in XAMPP
define('DB_PASS', '');           // Default XAMPP has no password
define('DB_NAME', 'prism_db');
define('DB_PORT', 3306);

// Upload directory (relative to htdocs/prism/)
define('UPLOAD_DIR', __DIR__ . '/../uploads/');
define('UPLOAD_URL', '/prism/uploads/');
define('MAX_FILE_SIZE', 15 * 1024 * 1024); // 15 MB

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
    prism_exit_json(['error' => $msg], $code);
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
        } catch (PDOException $e) {
            fail('Database connection failed: ' . $e->getMessage(), 500);
        }
    }
    return $pdo;
}

// ── CORS + JSON headers ──
function setHeaders() {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}

// ── Session helper ──
function startSession() {
    session_name(SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME,
        'path'     => '/',
        'secure'   => false,  // set true if using HTTPS
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    if (session_status() === PHP_SESSION_NONE) session_start();
}

// ── Auth guard ──
function requireAuth($allowedRoles = []) {
    startSession();
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

// ── Get JSON body ──
function getBody() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
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
    $su = $db->prepare('SELECT TRIM(COALESCE(section, "")) AS sec FROM users WHERE id = ?');
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
