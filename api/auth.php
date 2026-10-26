<?php
// api/auth.php — Login, logout, register, session check
require_once 'config.php';
require_once 'roster_lib.php';
setHeaders();
startSession();
prism_guard_mutating_request(['login', 'register', 'register_teacher', 'logout', 'resend_verification']);

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── LOGIN ──────────────────────────────────────────────
if ($method === 'POST' && $action === 'login') {
    prism_rate_limit('login', 8, 900);
    $b    = getBody();
    $id   = trim($b['id']       ?? '');
    $pw   = $b['password'] ?? '';
    $role = trim($b['role']     ?? '');
    $email = prism_normalize_ctu_email($b['email'] ?? '');

    if (!$id || $pw === '' || !$role) fail('Missing credentials');
    if (!in_array($role, ['student', 'teacher', 'admin'], true)) fail('Incorrect credentials', 401);
    if ($role === 'student' && !prism_is_ctu_student_id($id)) {
        fail('Enter your 7-digit CTU student ID');
    }
    if (($role === 'student' || $role === 'teacher') && !prism_is_ctu_email($email)) {
        fail('Enter your CTU email (@ctu.edu.ph)');
    }

    $db   = getDB();
    $stmt = $db->prepare('SELECT id, password, role, name, section, email FROM users WHERE LOWER(id) = LOWER(?) AND role = ?');
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

    if ($role === 'student' && prism_student_needs_email_verify($db, (string) $user['id'])) {
        fail('Check your CTU email for a verification link before signing in.');
    }

    if ($role === 'student' || $role === 'teacher') {
        $storedEmail = prism_normalize_ctu_email($user['email'] ?? '');
        if ($storedEmail === '') {
            fail('An administrator has not assigned a CTU email to this account yet.');
        }
        if (!prism_is_ctu_email($email) || $storedEmail !== $email) {
            fail('Incorrect credentials', 401);
        }
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['role']    = $user['role'];
    $_SESSION['name']    = $user['name'];
    $_SESSION['section'] = $user['section'] ?? '';
    unset($_SESSION['csrf_token']);
    $csrf = prism_csrf_token();

    ok([
        'id'         => $user['id'],
        'role'       => $user['role'],
        'name'       => $user['name'],
        'section'    => $user['section'],
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
    $user = [
        'id'      => (string) $_SESSION['user_id'],
        'role'    => (string) ($_SESSION['role'] ?? ''),
        'name'    => (string) ($_SESSION['name'] ?? ''),
        'section' => (string) ($_SESSION['section'] ?? ''),
    ];
    try {
        $db   = getDB();
        $stmt = $db->prepare('SELECT id, role, name, section FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user_id']]);
        $row = $stmt->fetch();
        if ($row) {
            $user = $row;
            $_SESSION['role']    = $row['role'];
            $_SESSION['name']    = $row['name'];
            $_SESSION['section'] = $row['section'] ?? '';
        }
    } catch (Throwable $e) {
        error_log('PRISM session lookup: ' . $e->getMessage());
    }
    ok(['loggedIn' => true, 'user' => $user, 'csrf_token' => prism_csrf_token()]);
}

// ── REGISTER STUDENT (roster match only) ───────────────
if ($method === 'POST' && $action === 'register') {
    $result = prism_register_from_roster(getDB(), getBody(), prism_client_ip());
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok(['id' => $result['id']]);
}

if ($method === 'POST' && $action === 'resend_verification') {
    $b = getBody();
    prism_resend_verification(getDB(), (string) ($b['id'] ?? ''), (string) ($b['email'] ?? ''), prism_client_ip());
    ok(['message' => 'If that account is waiting for verification, a new link was sent.']);
}

if ($method === 'GET' && $action === 'verify_email') {
    $okVerify = prism_consume_verification(getDB(), (string) ($_GET['token'] ?? ''));
    if (!$okVerify) {
        fail('This verification link is invalid or has expired.', 400);
    }
    ok(['verified' => true]);
}

// ── REGISTER TEACHER (closed: admins create teacher accounts) ──
if ($method === 'POST' && $action === 'register_teacher') {
    fail('Teacher accounts are created by an administrator.', 403);
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
    $email = prism_normalize_ctu_email($b['email'] ?? '');

    if (!$id || !$pw || !$name) fail('Missing required fields');
    if ($role === 'teacher' && !prism_is_ctu_email($email)) fail('Enter a CTU email (@ctu.edu.ph)');
    if ($role !== 'teacher' && $email !== '' && !prism_is_ctu_email($email)) fail('Enter a CTU email (@ctu.edu.ph)');

    $db = getDB();
    $check = $db->prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?)');
    $check->execute([$id]);
    if ($check->fetch()) fail('That ID is already in use');
    if ($email !== '') {
        $emCheck = $db->prepare('SELECT id FROM users WHERE LOWER(email) = ? AND email <> \'\'');
        $emCheck->execute([$email]);
        if ($emCheck->fetch()) fail('That CTU email is already used on another account');
    }

    $hash = password_hash($pw, PASSWORD_DEFAULT);
    $db->prepare('INSERT INTO users (id, `password`, role, name, section, email) VALUES (?, ?, ?, ?, ?, ?)')->execute([$id, $hash, $role, $name, $section, $email]);
    ok(['id' => $id]);
}

fail('Unknown action');
