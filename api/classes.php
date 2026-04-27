<?php
// api/classes.php — Create, list, join, leave classes
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();

// ── LIST MY CLASSES ────────────────────────────────────
if ($method === 'GET' && $action === 'mine') {
    if ($user['role'] === 'teacher') {
        $stmt = $db->prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC');
        $stmt->execute([$user['id']]);
        ok(['classes' => $stmt->fetchAll()]);
    } else {
        // Student — get joined classes with teacher info
        $stmt = $db->prepare(
            'SELECT c.*, u.name AS teacher_name, u.avatar AS teacher_avatar
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

// ── GET STUDENTS IN CLASS (teacher) ───────────────────
if ($method === 'GET' && $action === 'students') {
    $class_id = $_GET['class_id'] ?? '';
    $stmt = $db->prepare(
        'SELECT u.id, u.name, u.section, u.avatar, e.joined_at
         FROM enrollments e JOIN users u ON e.student_id = u.id
         WHERE e.class_id = ? ORDER BY u.name'
    );
    $stmt->execute([$class_id]);
    ok(['students' => $stmt->fetchAll()]);
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

