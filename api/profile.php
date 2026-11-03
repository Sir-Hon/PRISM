<?php
// api/profile.php — User profile, events, admin tools
require_once 'config.php';
require_once 'roster_lib.php';
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
    if ($uid === $user['id'] || $user['role'] === 'admin') {
        $stmt = $db->prepare('SELECT id, name, section, avatar, email, bio, role, member_since FROM users WHERE id = ?');
    } else {
        $stmt = $db->prepare('SELECT id, name, role, avatar FROM users WHERE id = ?');
    }
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
    if ($email === '') {
        $keep = $db->prepare('SELECT email FROM users WHERE id = ?');
        $keep->execute([$user['id']]);
        $row = $keep->fetch();
        $email = (string) ($row['email'] ?? '');
    } elseif (($user['role'] === 'student' || $user['role'] === 'teacher') && !prism_is_ctu_email($email)) {
        fail('Email must be your CTU address (@ctu.edu.ph)');
    } else {
        $email = prism_normalize_ctu_email($email);
    }

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

if (in_array($action, ['get_events', 'save_event', 'delete_event'], true) && ($user['role'] ?? '') === 'admin') {
    prism_require_admin_perm($db, $user, 'calendar');
}

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
    prism_require_admin_perm($db, $user, 'users');
    try {
        prism_ensure_admin_perms($db);
        prism_ensure_superadmin_email($db);
        $stmt = $db->query('SELECT id, name, role, section, email, admin_perms FROM users ORDER BY role, name');
        $users = $stmt->fetchAll();
        foreach ($users as &$row) {
            if (($row['role'] ?? '') === 'admin') {
                $row['superadmin'] = prism_is_superadmin_id((string) $row['id']);
                $row['permissions'] = prism_admin_permissions($db, (string) $row['id']);
            }
            unset($row['admin_perms']);
        }
        unset($row);
        ok(['users' => $users]);
    } catch (PDOException $e) {
        error_log('get_all_users: ' . $e->getMessage());
        fail('Could not load users', 500);
    }
}

if ($method === 'POST' && $action === 'delete_user') {
    requireAuth(['admin']);
    prism_require_admin_perm($db, $user, 'users');
    $b = getBody();
    $del_id = trim($b['id'] ?? '');
    if ($del_id === '' || $del_id === $user['id']) fail('Cannot delete yourself');
    if (prism_is_superadmin_id($del_id)) fail('The superadmin account cannot be deleted');
    prism_ensure_student_roster($db);
    try {
        $db->beginTransaction();
        $db->prepare('UPDATE student_roster SET claimed_by_user_id = NULL WHERE claimed_by_user_id = ? OR id_number = ?')->execute([$del_id, $del_id]);
        $db->prepare('UPDATE users SET id_number = NULL WHERE id = ?')->execute([$del_id]);
        $db->prepare('DELETE FROM teacher_roster WHERE id = ?')->execute([$del_id]);
        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$del_id]);
        $db->prepare('DELETE FROM student_roster WHERE id_number = ?')->execute([$del_id]);
        $db->commit();
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('delete_user: ' . $e->getMessage());
        fail('Could not delete user (they may still own data).', 500);
    }
    ok();
}

if (in_array($action, ['get_invite_codes', 'create_invite', 'delete_invite'], true)) {
    fail('Invite codes are no longer used. Administrators create teacher accounts directly.', 410);
}

if ($method === 'POST' && $action === 'set_user_email') {
    requireAuth(['admin']);
    prism_require_admin_perm($db, $user, 'users');
    $b = getBody();
    $targetId = trim($b['id'] ?? '');
    $email = prism_normalize_ctu_email($b['email'] ?? '');
    if ($targetId === '') fail('Missing account');
    if (!prism_is_ctu_email($email)) fail('Enter a CTU email (@ctu.edu.ph)');
    $lookup = $db->prepare('SELECT id, role FROM users WHERE id = ?');
    $lookup->execute([$targetId]);
    $row = $lookup->fetch();
    if (!$row) fail('Account not found', 404);
    if (!in_array($row['role'], ['student', 'teacher', 'admin'], true)) fail('CTU email cannot be set on this account');
    if (prism_is_superadmin_id($targetId)) fail('The superadmin email stays ' . prism_superadmin_email());
    prism_ensure_student_roster($db);
    $taken = $db->prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?');
    $taken->execute([$email, $targetId]);
    if ($taken->fetch()) fail('That CTU email is already used on another account');
    $rosterMail = $db->prepare('SELECT id_number FROM student_roster WHERE email = ? AND id_number <> ?');
    $rosterMail->execute([$email, $targetId]);
    if ($rosterMail->fetch()) fail('That CTU email is already used on another account');
    $teacherMail = $db->prepare('SELECT id FROM teacher_roster WHERE email = ? AND id <> ?');
    $teacherMail->execute([$email, $targetId]);
    if ($teacherMail->fetch()) fail('That CTU email is already used on another account');
    try {
        $db->beginTransaction();
        $db->prepare('UPDATE users SET email = ? WHERE id = ?')->execute([$email, $targetId]);
        $db->prepare('UPDATE student_roster SET email = ? WHERE id_number = ?')->execute([$email, $targetId]);
        $db->prepare('UPDATE teacher_roster SET email = ? WHERE id = ?')->execute([$email, $targetId]);
        $db->commit();
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('set_user_email: ' . $e->getMessage());
        fail('That CTU email is already used on another account');
    }
    ok(['id' => $targetId, 'email' => $email]);
}

if ($action === 'get_announcements') {
    $stmt = $db->query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20');
    ok(['announcements' => $stmt->fetchAll()]);
}

if ($method === 'POST' && $action === 'set_admin_perms') {
    requireAuth(['admin']);
    if (!prism_is_superadmin_id((string) $user['id'])) fail('Only the superadmin can change admin access', 403);
    $b = getBody();
    $target = trim((string) ($b['id'] ?? ''));
    if ($target === '' || prism_is_superadmin_id($target)) fail('That admin access cannot be changed');
    $lookup = $db->prepare('SELECT id, role FROM users WHERE id = ?');
    $lookup->execute([$target]);
    $row = $lookup->fetch();
    if (!$row || ($row['role'] ?? '') !== 'admin') fail('Account not found', 404);
    $incoming = is_array($b['permissions'] ?? null) ? $b['permissions'] : [];
    $perms = [];
    foreach (array_keys(prism_admin_catalog()) as $key) {
        $perms[$key] = !empty($incoming[$key]);
    }
    $perms['dashboard'] = true;
    prism_ensure_admin_perms($db);
    $db->prepare('UPDATE users SET admin_perms = ? WHERE id = ?')->execute([json_encode($perms), $target]);
    ok(['id' => $target, 'permissions' => $perms]);
}

if ($method === 'POST' && $action === 'add_announcement') {
    requireAuth(['admin']);
    prism_require_admin_perm($db, $user, 'announcements');
    $b = getBody();
    $db->prepare('INSERT INTO announcements (author, text, type) VALUES (?,?,?)')->execute([$b['author']??$user['name'], $b['text'], $b['type']??'portal']);
    ok();
}

fail('Unknown action');
