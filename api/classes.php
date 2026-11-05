<?php
// api/classes.php — Create, list, join, leave classes
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();
prism_ensure_class_cover($db);

function prism_ensure_class_cover(PDO $db): bool {
    static $done = null;
    if ($done !== null) return $done;
    try {
        if (!prism_table_has_column($db, 'classes', 'cover')) {
            $db->exec('ALTER TABLE classes ADD COLUMN cover MEDIUMTEXT NULL');
        }
        $done = true;
    } catch (Throwable $e) {
        error_log('PRISM class cover: ' . $e->getMessage());
        $done = false;
    }
    return $done;
}

function prism_class_hex(string $raw): string {
    $raw = trim($raw);
    if (preg_match('/^#[0-9a-fA-F]{6}$/', $raw)) return strtolower($raw);
    if (preg_match('/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/', $raw, $m)) {
        return strtolower('#' . $m[1] . $m[1] . $m[2] . $m[2] . $m[3] . $m[3]);
    }
    return '';
}

// ── LIST MY CLASSES ────────────────────────────────────
if ($method === 'GET' && $action === 'mine') {
    if ($user['role'] === 'teacher') {
        $coverSql = prism_ensure_class_cover($db) ? ', c.cover' : '';
        $stmt = $db->prepare(
            'SELECT c.id, c.teacher_id, c.subject, c.code, c.color' . $coverSql . ', c.created_at,
                    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS student_count
             FROM classes c WHERE c.teacher_id = ? ORDER BY c.created_at DESC'
        );
        $stmt->execute([$user['id']]);
        ok(['classes' => $stmt->fetchAll()]);
    } else {
        // Student — get joined classes with teacher info
        $stmt = $db->prepare(
            'SELECT c.*, u.name AS teacher_name
             FROM enrollments e
             JOIN classes c ON e.class_id = c.id
             JOIN users u ON c.teacher_id = u.id
             WHERE e.student_id = ?
             ORDER BY e.joined_at DESC'
        );
        $stmt->execute([$user['id']]);
        ok(['classes' => $stmt->fetchAll()]);
    }
}

// ── CREATE CLASS (teacher) ─────────────────────────────
if ($method === 'POST' && $action === 'create') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b = getBody();
    $subject = trim($b['subject'] ?? '');
    $color   = trim($b['color']   ?? '#7c3aed');
    if (!$subject) fail('Subject name required');

    // Generate unique join code
    do {
        $code = strtoupper(substr(md5(uniqid()), 0, 6));
        $check = $db->prepare('SELECT id FROM classes WHERE code = ?');
        $check->execute([$code]);
    } while ($check->fetch());

    $id = uniqid('cls_');
    $db->prepare('INSERT INTO classes (id, teacher_id, subject, code, color) VALUES (?, ?, ?, ?, ?)')
       ->execute([$id, $user['id'], $subject, $code, $color]);

    ok(['id' => $id, 'code' => $code, 'subject' => $subject, 'color' => $color]);
}

// ── CARD LOOK (teacher) ────────────────────────────────
if ($method === 'POST' && $action === 'style') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    if (!prism_ensure_class_cover($db)) fail('Could not save the card look.', 500);
    $b = getBody();
    $class_id = trim((string) ($b['class_id'] ?? ''));
    $color = prism_class_hex((string) ($b['color'] ?? ''));
    $cover = $b['cover'] ?? '';
    if ($class_id === '' || $color === '') fail('Choose a color for this subject.');
    if (!is_string($cover)) fail('Use a JPG, PNG, or WebP photo.');
    if ($cover !== '' && !preg_match('#^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$#', $cover)) {
        fail('Use a JPG, PNG, or WebP photo.');
    }
    if (strlen($cover) > 1200000) fail('That photo is too large to save.');
    $chk = $db->prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?');
    $chk->execute([$class_id, $user['id']]);
    if (!$chk->fetch()) fail('Not found or not yours', 404);
    $db->prepare('UPDATE classes SET color = ?, cover = ? WHERE id = ?')->execute([$color, $cover === '' ? null : $cover, $class_id]);
    ok(['color' => $color, 'has_cover' => $cover !== '']);
}

// ── JOIN CLASS (student) ───────────────────────────────
if ($method === 'POST' && $action === 'join') {
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    $b    = getBody();
    $code = strtoupper(trim($b['code'] ?? ''));
    if (!$code) fail('Code required');

    $stmt = $db->prepare('SELECT * FROM classes WHERE code = ?');
    $stmt->execute([$code]);
    $class = $stmt->fetch();
    if (!$class) fail('Invalid join code');

    // Check already enrolled
    $chk = $db->prepare('SELECT id FROM enrollments WHERE student_id = ? AND class_id = ?');
    $chk->execute([$user['id'], $class['id']]);
    if ($chk->fetch()) fail('Already joined this class');

    // Get student section
    $su = $db->prepare('SELECT section FROM users WHERE id = ?');
    $su->execute([$user['id']]);
    $section = $su->fetch()['section'] ?? '';

    $db->prepare('INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)')->execute([$user['id'], $class['id']]);

    // Fetch teacher info
    $tu = $db->prepare('SELECT name, avatar FROM users WHERE id = ?');
    $tu->execute([$class['teacher_id']]);
    $teacher = $tu->fetch();

    ok([
        'class'        => $class,
        'teacher_name' => $teacher['name'] ?? $class['teacher_id'],
        'teacher_avatar' => $teacher['avatar'] ?? null,
    ]);
}

// ── LEAVE CLASS (student) ──────────────────────────────
if ($method === 'POST' && $action === 'leave') {
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    $b = getBody();
    $class_id = $b['class_id'] ?? '';
    $db->prepare('DELETE FROM enrollments WHERE student_id = ? AND class_id = ?')->execute([$user['id'], $class_id]);
    ok();
}

// ── GET CLASS MEMBERS (teacher of the class, or an enrolled student) ─
if ($method === 'GET' && $action === 'students') {
    $class_id = trim((string) ($_GET['class_id'] ?? ''));
    if ($class_id === '') fail('Class required');
    $cls = $db->prepare(
        'SELECT c.teacher_id, u.name AS teacher_name, u.avatar AS teacher_avatar
         FROM classes c
         LEFT JOIN users u ON u.id = c.teacher_id
         WHERE c.id = ?'
    );
    $cls->execute([$class_id]);
    $class = $cls->fetch();
    if (!$class) fail('Not found', 404);
    $allowed = ($user['role'] === 'teacher' && (string) $class['teacher_id'] === (string) $user['id']);
    if (!$allowed && $user['role'] === 'student') {
        $en = $db->prepare('SELECT 1 FROM enrollments WHERE student_id = ? AND class_id = ?');
        $en->execute([$user['id'], $class_id]);
        $allowed = (bool) $en->fetch();
    }
    if (!$allowed) fail('Forbidden', 403);
    $wantAvatars = (string) ($_GET['avatars'] ?? '') === '1';
    $cols = $wantAvatars
        ? 'u.id, u.name, u.section, u.avatar, e.joined_at'
        : 'u.id, u.name, u.section, e.joined_at';
    $stmt = $db->prepare(
        'SELECT ' . $cols . '
         FROM enrollments e JOIN users u ON e.student_id = u.id
         WHERE e.class_id = ? ORDER BY u.name'
    );
    $stmt->execute([$class_id]);
    ok([
        'students' => $stmt->fetchAll(),
        'teacher' => [
            'id' => $class['teacher_id'],
            'name' => $class['teacher_name'] ?: $class['teacher_id'],
            'avatar' => $class['teacher_avatar'] ?? null,
        ],
    ]);
}

// ── REGENERATE JOIN CODE (teacher) ─────────────────────
if ($method === 'POST' && $action === 'regen_code') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b         = getBody();
    $class_id  = $b['class_id'] ?? '';
    $new_code  = strtoupper(preg_replace('/\s+/', '', $b['code'] ?? ''));
    if (!$class_id || strlen($new_code) < 4) fail('Invalid class or code');

    $chk = $db->prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?');
    $chk->execute([$class_id, $user['id']]);
    if (!$chk->fetch()) fail('Not found or not yours', 404);

    $dup = $db->prepare('SELECT id FROM classes WHERE code = ? AND id != ?');
    $dup->execute([$new_code, $class_id]);
    if ($dup->fetch()) fail('That code is already in use');

    $db->prepare('UPDATE classes SET code = ? WHERE id = ?')->execute([$new_code, $class_id]);
    ok(['code' => $new_code]);
}

// ── DELETE CLASS (teacher) ─────────────────────────────
if ($method === 'DELETE' && $action === 'delete') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b = getBody();
    $class_id = $b['class_id'] ?? '';
    // Verify ownership
    $chk = $db->prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?');
    $chk->execute([$class_id, $user['id']]);
    if (!$chk->fetch()) fail('Not found or not yours', 404);
    $db->prepare('DELETE FROM classes WHERE id = ?')->execute([$class_id]);
    ok();
}

fail('Unknown action');

