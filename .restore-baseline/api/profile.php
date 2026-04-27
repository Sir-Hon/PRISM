<?php
// api/profile.php — User profile, events, admin tools
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();

// ══════════════════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════════════════

if ($action === 'get') {
    $uid = $_GET['user_id'] ?? $user['id'];
    // Only allow fetching others' profiles for avatar/name (teacher lookup)
    $stmt = $db->prepare('SELECT id, name, section, avatar, email, bio, role, member_since FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    ok(['profile' => $stmt->fetch() ?: null]);
}

if ($method === 'POST' && $action === 'save') {
    $b = getBody();
    $name    = trim($b['name']    ?? '');
    $section = trim($b['section'] ?? '');
    $email   = trim($b['email']   ?? '');
    $bio     = trim($b['bio']     ?? '');
    $avatar  = $b['avatar'] ?? null;

    if (!$name) fail('Name cannot be empty');

    $params = [$name, $section, $email, $bio, $user['id']];
    $sql    = 'UPDATE users SET name=?, section=?, email=?, bio=?';

    if ($avatar !== null) {
        $sql .= ', avatar=?';
        $params = [$name, $section, $email, $bio, $avatar, $user['id']];
    }
    $sql .= ' WHERE id=?';
    $db->prepare($sql)->execute($params);

    // If student, sync name into all class rosters (handled via JOIN now, no need)
    ok(['name' => $name]);
}

// ── CHANGE PASSWORD ────────────────────────────────────
if ($method === 'POST' && $action === 'change_password') {
    $b    = getBody();
    $old  = $b['old_password'] ?? '';
    $new  = $b['new_password'] ?? '';
    if (strlen($new) < 6) fail('New password must be at least 6 characters');

    $stmt = $db->prepare('SELECT password FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row  = $stmt->fetch();
    if (!password_verify($old, $row['password'])) fail('Current password is incorrect', 401);

    $hash = password_hash($new, PASSWORD_DEFAULT);
    $db->prepare('UPDATE users SET password=? WHERE id=?')->execute([$hash, $user['id']]);
    ok();
}

// ══════════════════════════════════════════════════════
//  CALENDAR EVENTS
// ══════════════════════════════════════════════════════

if ($action === 'get_events') {
    $stmt = $db->prepare('SELECT * FROM events WHERE user_id = ? ORDER BY event_date ASC, event_time ASC');
    $stmt->execute([$user['id']]);
    ok(['events' => $stmt->fetchAll()]);
}

if ($method === 'POST' && $action === 'save_event') {
    $b  = getBody();
    $id = $b['id'] ?? uniqid('ev_');
    $db->prepare(
        'INSERT INTO events (id, user_id, title, event_date, event_time, notes, alarm, color)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE title=VALUES(title), event_date=VALUES(event_date), event_time=VALUES(event_time), notes=VALUES(notes), alarm=VALUES(alarm), color=VALUES(color)'
    )->execute([
        $id, $user['id'], $b['title'], $b['date'],
        $b['time'] ?: null, $b['notes']??'',
        isset($b['alarm']) && $b['alarm'] !== '' ? intval($b['alarm']) : null,
        $b['color'] ?? '#7c3aed',
    ]);
    ok(['id' => $id]);
}

if ($method === 'DELETE' && $action === 'delete_event') {
    $b = getBody();
    $db->prepare('DELETE FROM events WHERE id = ? AND user_id = ?')->execute([$b['id'], $user['id']]);
    ok();
}

// ══════════════════════════════════════════════════════
//  ADMIN TOOLS
// ══════════════════════════════════════════════════════

if ($action === 'get_all_users') {
    requireAuth(['admin']);
    try {
        // Avoid created_at if older DB schemas omit it (prevents PDO exception → HTML error page).
        $stmt = $db->query('SELECT id, name, role, section, email FROM users ORDER BY role, name');
        ok(['users' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        fail('Could not load users: ' . $e->getMessage(), 500);
    }
}

if ($method === 'POST' && $action === 'delete_user') {
    requireAuth(['admin']);
    $b = getBody();
    $del_id = trim($b['id'] ?? '');
    if ($del_id === '' || $del_id === $user['id']) fail('Cannot delete yourself');
    try {
        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$del_id]);
    } catch (PDOException $e) {
        fail('Could not delete user (they may still own data). ' . $e->getMessage(), 500);
    }
    ok();
}

if ($action === 'get_invite_codes') {
    requireAuth(['admin']);
    $stmt = $db->query('SELECT * FROM invite_codes ORDER BY created_at DESC');
    ok(['codes' => $stmt->fetchAll()]);
}

if ($method === 'POST' && $action === 'create_invite') {
    requireAuth(['admin']);
    $code = strtoupper(substr(md5(uniqid()), 0, 7));
    $db->prepare('INSERT INTO invite_codes (code, created_by) VALUES (?,?)')->execute([$code, $user['id']]);
    ok(['code' => $code]);
}

if ($action === 'get_announcements') {
    $stmt = $db->query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20');
    ok(['announcements' => $stmt->fetchAll()]);
}

if ($method === 'POST' && $action === 'add_announcement') {
    requireAuth(['admin']);
    $b = getBody();
    $db->prepare('INSERT INTO announcements (author, text, type) VALUES (?,?,?)')->execute([$b['author']??$user['name'], $b['text'], $b['type']??'portal']);
    ok();
}

fail('Unknown action');
