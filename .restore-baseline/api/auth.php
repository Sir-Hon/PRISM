<?php
// api/auth.php — Login, logout, register, session check
require_once 'config.php';
setHeaders();
startSession();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── LOGIN ──────────────────────────────────────────────
if ($method === 'POST' && $action === 'login') {
    $b    = getBody();
    $id   = trim($b['id']       ?? '');
    $pw   = trim($b['password'] ?? '');
    $role = trim($b['role']     ?? '');

    if (!$id || !$pw || !$role) fail('Missing credentials');

    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM users WHERE LOWER(id) = LOWER(?) AND role = ?');
    $stmt->execute([$id, $role]);
    $user = $stmt->fetch();

    if (!$user) fail('Incorrect credentials', 401);

    $hash = $user['password'];
    $valid = false;

    // Support both hashed and plain-text passwords (plain-text auto-upgrades to hash)
    if (password_verify($pw, $hash)) {
        $valid = true;
    } elseif ($pw === $hash) {
        // Plain text match — upgrade to hash immediately
        $valid = true;
        $newHash = password_hash($pw, PASSWORD_DEFAULT);
        $db->prepare('UPDATE users SET `password` = ? WHERE id = ?')->execute([$newHash, $user['id']]);
    }

    if (!$valid) fail('Incorrect credentials', 401);

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['role']    = $user['role'];
    $_SESSION['name']    = $user['name'];

    ok([
        'id'      => $user['id'],
        'role'    => $user['role'],
        'name'    => $user['name'],
        'section' => $user['section'],
        'avatar'  => $user['avatar'],
    ]);
}

// ── LOGOUT ─────────────────────────────────────────────
if ($method === 'POST' && $action === 'logout') {
    session_destroy();
    ok();
}

// ── SESSION CHECK ──────────────────────────────────────
if ($method === 'GET' && $action === 'session') {
    if (empty($_SESSION['user_id'])) {
        ok(['loggedIn' => false]);
    }
    $db   = getDB();
    $stmt = $db->prepare('SELECT id, role, name, section, avatar FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) { session_destroy(); ok(['loggedIn' => false]); }
    ok(['loggedIn' => true, 'user' => $user]);
}

// ── REGISTER STUDENT ───────────────────────────────────
if ($method === 'POST' && $action === 'register') {
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
