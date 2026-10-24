<?php
// api/auth.php — Login, logout, register, session check
require_once 'config.php';
setHeaders();
startSession();
prism_guard_mutating_request(['login', 'register', 'register_teacher', 'logout']);

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── LOGIN ──────────────────────────────────────────────
if ($method === 'POST' && $action === 'login') {
    prism_rate_limit('login', 8, 900);
    $b    = getBody();
    $id   = trim($b['id']       ?? '');
    $pw   = $b['password'] ?? '';
    $role = trim($b['role']     ?? '');

    if (!$id || $pw === '' || !$role) fail('Missing credentials');
    if (!in_array($role, ['student', 'teacher', 'admin'], true)) fail('Incorrect credentials', 401);

    $db   = getDB();
    $stmt = $db->prepare('SELECT id, password, role, name, section, avatar FROM users WHERE LOWER(id) = LOWER(?) AND role = ?');
    $stmt->execute([$id, $role]);
    $user = $stmt->fetch();

    if (!$user) fail('Incorrect credentials', 401);

    $hash = $user['password'];
    $valid = false;

    if (password_verify($pw, $hash)) {
        $valid = true;
    } elseif (hash_equals((string) $hash, (string) $pw)) {
        $valid = true;
        $newHash = password_hash($pw, PASSWORD_DEFAULT);
        $db->prepare('UPDATE users SET `password` = ? WHERE id = ?')->execute([$newHash, $user['id']]);
    }

    if (!$valid) fail('Incorrect credentials', 401);

    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['role']    = $user['role'];
    $_SESSION['name']    = $user['name'];
    unset($_SESSION['csrf_token']);
    $csrf = prism_csrf_token();

    ok([
        'id'         => $user['id'],
        'role'       => $user['role'],
        'name'       => $user['name'],
        'section'    => $user['section'],
        'avatar'     => $user['avatar'],
        'csrf_token' => $csrf,
    ]);
}

// ── LOGOUT ─────────────────────────────────────────────
if ($method === 'POST' && $action === 'logout') {
    prism_logout_session();
    ok();
}

// ── SESSION CHECK ──────────────────────────────────────
if ($method === 'GET' && $action === 'session') {
    if (empty($_SESSION['user_id'])) {
        ok(['loggedIn' => false]);
    }
    $db   = getDB();
    $stmt = $db->prepare('SELECT id, role, name, section, (avatar IS NOT NULL AND avatar != "") AS has_avatar FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        prism_logout_session();
        ok(['loggedIn' => false]);
    }
    $user['has_avatar'] = !empty($user['has_avatar']);
    unset($user['avatar']);
    ok(['loggedIn' => true, 'user' => $user, 'csrf_token' => prism_csrf_token()]);
}

// ── REGISTER STUDENT ───────────────────────────────────
if ($method === 'POST' && $action === 'register') {
    prism_rate_limit('register', 6, 900);
    $b       = getBody();
    $id      = trim($b['id']       ?? '');
    $pw      = trim($b['password'] ?? '');
    $name    = trim($b['name']     ?? '');
    $section = trim($b['section']  ?? '');

    if (!$id || !$pw || !$name) fail('Missing required fields');
    if (strlen($id) < 4)        fail('ID must be at least 4 characters');
    if (strlen($pw) < 6)        fail('Password must be at least 6 characters');

    $db    = getDB();
    $check = $db->prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?)');
    $check->execute([$id]);
    if ($check->fetch()) fail('That ID is already registered');

    $hash = password_hash($pw, PASSWORD_DEFAULT);
    $db->prepare('INSERT INTO users (id, `password`, role, name, section) VALUES (?, ?, "student", ?, ?)')->execute([$id, $hash, $name, $section]);
    ok(['id' => $id]);
}

// ── REGISTER TEACHER (with invite code) ────────────────
if ($method === 'POST' && $action === 'register_teacher') {
    prism_rate_limit('register_teacher', 6, 900);
    $b    = getBody();
    $id   = trim($b['id']          ?? '');
    $pw   = trim($b['password']    ?? '');
    $name = trim($b['name']        ?? '');
    $code = strtoupper(trim($b['invite_code'] ?? ''));

    if (!$id || !$pw || !$name || !$code) fail('Missing required fields');

    $db = getDB();
    $inv = $db->prepare('SELECT * FROM invite_codes WHERE code = ? AND used = 0');
    $inv->execute([$code]);
    $invite = $inv->fetch();
    if (!$invite) fail('Invalid or already used invite code');

    $check = $db->prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?)');
    $check->execute([$id]);
    if ($check->fetch()) fail('That ID is already registered');

    $hash = password_hash($pw, PASSWORD_DEFAULT);
    $db->prepare('INSERT INTO users (id, `password`, role, name) VALUES (?, ?, "teacher", ?)')->execute([$id, $hash, $name]);
    $db->prepare('UPDATE invite_codes SET used=1, used_by=?, used_at=NOW() WHERE code=?')->execute([$id, $code]);
    ok(['id' => $id]);
}

// ── CREATE ACCOUNT (admin creates teacher/admin directly) ──
if ($method === 'POST' && $action === 'register_admin') {
    startSession();
    if (empty($_SESSION['role']) || $_SESSION['role'] !== 'admin') fail('Forbidden', 403);
    $b    = getBody();
    $id   = trim($b['id']       ?? '');
    $pw   = trim($b['password'] ?? '');
    $name = trim($b['name']     ?? '');
    $role = in_array($b['role']??'', ['teacher','admin']) ? $b['role'] : 'teacher';
    $section = trim($b['section'] ?? '');

    if (!$id || !$pw || !$name) fail('Missing required fields');

    $db = getDB();
    $check = $db->prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?)');
    $check->execute([$id]);
    if ($check->fetch()) fail('That ID is already in use');

    $hash = password_hash($pw, PASSWORD_DEFAULT);
    $db->prepare('INSERT INTO users (id, `password`, role, name, section) VALUES (?, ?, ?, ?, ?)')->execute([$id, $hash, $role, $name, $section]);
    ok(['id' => $id]);
}

fail('Unknown action');
