<?php
// api/profile.php — User profile, events, admin tools
require_once 'config.php';
require_once 'roster_lib.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();

function prism_ensure_user_banners(PDO $db): bool {
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $db->exec(
            'CREATE TABLE IF NOT EXISTS user_banners (
                user_id VARCHAR(50) NOT NULL,
                scope VARCHAR(80) NOT NULL,
                color VARCHAR(10) NOT NULL DEFAULT "",
                image MEDIUMTEXT NULL,
                PRIMARY KEY (user_id, scope)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        $ready = true;
    } catch (PDOException $e) {
        error_log('PRISM banners: ' . $e->getMessage());
        $ready = false;
    }
    return $ready;
}

function prism_banner_scope(string $scope): string {
    $scope = preg_replace('/[^A-Za-z0-9_-]/', '', $scope);
    if ($scope === '' || strlen($scope) > 80) fail('That banner could not be saved.');
    return $scope;
}

if ($action === 'banner') {
    if (!prism_ensure_user_banners($db)) ok(['banner' => null]);
    $scope = prism_banner_scope((string) ($_GET['scope'] ?? 'greet'));
    $stmt = $db->prepare('SELECT color, image FROM user_banners WHERE user_id = ? AND scope = ?');
    $stmt->execute([$user['id'], $scope]);
    $row = $stmt->fetch();
    if (!$row) ok(['banner' => null]);
    $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string) $row['color']) ? $row['color'] : '';
    $image = (string) ($row['image'] ?? '');
    if (!preg_match('#^data:image/(jpeg|png|webp);base64,#', $image)) $image = '';
    if ($color === '' && $image === '') ok(['banner' => null]);
    ok(['banner' => ['color' => $color, 'image' => $image]]);
}

if ($method === 'POST' && $action === 'save_banner') {
    if (!prism_ensure_user_banners($db)) fail('Could not save that banner.', 500);
    $b = getBody();
    $scope = prism_banner_scope((string) ($b['scope'] ?? 'greet'));
    $color = (string) ($b['color'] ?? '');
    $image = $b['image'] ?? '';
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) $color = '';
    if (!is_string($image)) fail('Use a JPG, PNG, or WebP photo.');
    if ($image !== '' && !preg_match('#^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$#', $image)) {
        fail('Use a JPG, PNG, or WebP photo.');
    }
    if (strlen($image) > 1200000) fail('That photo is too large to save.');
    if ($color === '' && $image === '') {
        $db->prepare('DELETE FROM user_banners WHERE user_id = ? AND scope = ?')->execute([$user['id'], $scope]);
        ok(['saved' => true]);
    }
    $db->prepare(
        'INSERT INTO user_banners (user_id, scope, color, image) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE color = VALUES(color), image = VALUES(image)'
    )->execute([$user['id'], $scope, $color, $image === '' ? null : $image]);
    ok(['saved' => true]);
}

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

function prism_ensure_announcement_audience(PDO $db): bool {
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $cols = [
            'audience' => "VARCHAR(20) NOT NULL DEFAULT 'everyone'",
            'college' => "VARCHAR(40) NOT NULL DEFAULT ''",
            'program' => "VARCHAR(80) NOT NULL DEFAULT ''",
            'year_level' => "VARCHAR(8) NOT NULL DEFAULT ''",
            'section_letter' => "VARCHAR(8) NOT NULL DEFAULT ''",
        ];
        foreach ($cols as $name => $def) {
            if (!prism_table_has_column($db, 'announcements', $name)) {
                $db->exec('ALTER TABLE announcements ADD COLUMN ' . $name . ' ' . $def);
            }
        }
        $ready = prism_table_has_column($db, 'announcements', 'audience');
    } catch (Throwable $e) {
        error_log('PRISM announcement audience: ' . $e->getMessage());
        $ready = false;
    }
    return $ready;
}

function prism_announcement_audience_label(array $row): string {
    $who = (string) ($row['audience'] ?? 'everyone');
    if ($who === '' || $who === 'everyone') return 'Everyone';
    $names = ['students' => 'Students', 'teachers' => 'Teachers', 'admins' => 'Admins'];
    $bits = [$names[$who] ?? 'Everyone'];
    foreach (['college', 'program', 'year_level', 'section_letter'] as $key) {
        $value = trim((string) ($row[$key] ?? ''));
        if ($value !== '') $bits[] = $key === 'year_level' ? ('Year ' . $value) : $value;
    }
    return implode(' · ', $bits);
}

function prism_announcement_for_viewer(array $row, array $user, PDO $db): bool {
    $who = (string) ($row['audience'] ?? 'everyone');
    if ($who === '' || $who === 'everyone') return true;
    $role = (string) ($user['role'] ?? '');
    if ($who === 'admins') return $role === 'admin';
    if ($who === 'teachers') {
        if ($role !== 'teacher') return false;
        $college = trim((string) ($row['college'] ?? ''));
        if ($college === '') return true;
        prism_ensure_student_roster($db);
        $lookup = $db->prepare('SELECT college FROM teacher_roster WHERE id = ?');
        $lookup->execute([(string) ($user['id'] ?? '')]);
        return (string) $lookup->fetchColumn() === $college;
    }
    if ($who !== 'students' || $role !== 'student') return false;
    $section = trim((string) ($user['section'] ?? ''));
    if (!preg_match('/^(.+) ([1-4])-([A-F])$/', $section, $match)) {
        return trim((string) ($row['college'] ?? '')) === ''
            && trim((string) ($row['program'] ?? '')) === ''
            && trim((string) ($row['year_level'] ?? '')) === ''
            && trim((string) ($row['section_letter'] ?? '')) === '';
    }
    $program = $match[1];
    $year = $match[2];
    $letter = $match[3];
    $college = prism_college_for_program($program);
    $wantCollege = trim((string) ($row['college'] ?? ''));
    $wantProgram = trim((string) ($row['program'] ?? ''));
    $wantYear = trim((string) ($row['year_level'] ?? ''));
    $wantSection = trim((string) ($row['section_letter'] ?? ''));
    if ($wantCollege !== '' && $wantCollege !== $college) return false;
    if ($wantProgram !== '' && $wantProgram !== $program) return false;
    if ($wantYear !== '' && $wantYear !== $year) return false;
    if ($wantSection !== '' && strcasecmp($wantSection, $letter) !== 0) return false;
    return true;
}

if ($action === 'get_announcements') {
    $manage = (($_GET['manage'] ?? '') === '1') && (($user['role'] ?? '') === 'admin');
    if ($manage) prism_require_admin_perm($db, $user, 'announcements');
    $hasAudience = prism_ensure_announcement_audience($db);
    $stmt = $db->query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 40');
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        if (!$hasAudience) {
            $row['audience'] = 'everyone';
            $row['college'] = '';
            $row['program'] = '';
            $row['year_level'] = '';
            $row['section_letter'] = '';
        }
        if (!$manage && !prism_announcement_for_viewer($row, $user, $db)) continue;
        $row['audience_label'] = prism_announcement_audience_label($row);
        $rows[] = $row;
    }
    ok(['announcements' => $rows]);
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
    if (!prism_ensure_announcement_audience($db)) fail('Could not save that announcement', 500);
    $b = getBody();
    $text = trim((string) ($b['text'] ?? ''));
    if ($text === '') fail('Write an announcement first');
    if (strlen($text) > 4000) fail('That announcement is too long');
    $type = (string) ($b['type'] ?? 'portal');
    if (!in_array($type, ['portal', 'alert', 'info'], true)) $type = 'portal';
    $who = (string) ($b['audience'] ?? 'everyone');
    if (!in_array($who, ['everyone', 'students', 'teachers', 'admins'], true)) fail('Choose who should see this');
    $colleges = prism_ctu_programs_by_college();
    $college = trim((string) ($b['college'] ?? ''));
    $program = trim((string) ($b['program'] ?? ''));
    $year = trim((string) ($b['year'] ?? ''));
    $section = strtoupper(trim((string) ($b['section'] ?? '')));
    if (!in_array($who, ['students', 'teachers'], true)) {
        $college = '';
        $program = '';
        $year = '';
        $section = '';
    }
    if ($who !== 'students') {
        $program = '';
        $year = '';
        $section = '';
    }
    if ($college !== '' && !isset($colleges[$college])) fail('Choose a college');
    if ($program !== '') {
        $programCollege = prism_college_for_program($program);
        if ($programCollege === '' || ($college !== '' && $programCollege !== $college)) fail('Choose a program in that college');
        if ($college === '') $college = $programCollege;
    }
    if ($year !== '' && !in_array($year, ['1', '2', '3', '4'], true)) fail('Choose a year');
    if ($section !== '' && !in_array($section, ['A', 'B', 'C', 'D', 'E', 'F'], true)) fail('Choose a section');
    $db->prepare('INSERT INTO announcements (author, text, type, audience, college, program, year_level, section_letter) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$b['author'] ?? $user['name'], $text, $type, $who, $college, $program, $year, $section]);
    ok();
}

fail('Unknown action');
