<?php
// api/quizzes.php — Quiz CRUD, taking quizzes, scores
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();

function prism_quiz_allow_skip_ready(PDO $db): bool {
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }
    if (!prism_table_has_column($db, 'quizzes', 'allow_skip')) {
        try {
            $db->exec('ALTER TABLE quizzes ADD COLUMN allow_skip TINYINT(1) NOT NULL DEFAULT 0');
        } catch (Throwable $e) {
            error_log('PRISM allow_skip: ' . $e->getMessage());
        }
    }
    $ready = prism_table_has_column($db, 'quizzes', 'allow_skip');
    return $ready;
}

// ── GET QUIZZES FOR A CLASS ────────────────────────────
if ($action === 'get') {
    $class_id = $_GET['class_id'] ?? '';
    prism_assert_class_access($db, $user, $class_id);
    if ($user['role'] === 'teacher') {
        $stmt = $db->prepare('SELECT * FROM quizzes WHERE class_id = ? AND teacher_id = ? ORDER BY created_at DESC');
        $stmt->execute([$class_id, $user['id']]);
    } else {
        $stuSec = prism_student_section_for_filter($db, $user);
        if ($stuSec !== null && prism_table_has_column($db, 'quizzes', 'target_section')) {
            $stmt = $db->prepare(
                'SELECT * FROM quizzes WHERE class_id = ? AND published = 1 AND (target_section IS NULL OR TRIM(target_section) = \'\' OR TRIM(target_section) = ?) ORDER BY created_at DESC'
            );
            $stmt->execute([$class_id, $stuSec]);
        } else {
            $stmt = $db->prepare('SELECT * FROM quizzes WHERE class_id = ? AND published = 1 ORDER BY created_at DESC');
            $stmt->execute([$class_id]);
        }
    }
    ok(['quizzes' => $stmt->fetchAll()]);
}

// ── GET ALL QUIZZES FOR ENROLLED CLASSES (student) ─────
if ($action === 'get_mine') {
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    if (prism_table_has_column($db, 'quizzes', 'target_section')) {
        $stmt = $db->prepare(
            'SELECT q.* FROM quizzes q
             JOIN enrollments e ON q.class_id = e.class_id
             JOIN users u ON u.id = e.student_id
             WHERE e.student_id = ? AND q.published = 1
             AND (q.target_section IS NULL OR TRIM(q.target_section) = \'\' OR TRIM(q.target_section) = TRIM(COALESCE(u.section, \'\')))
             ORDER BY q.created_at DESC'
        );
    } else {
        $stmt = $db->prepare(
            'SELECT q.* FROM quizzes q
             JOIN enrollments e ON q.class_id = e.class_id
             WHERE e.student_id = ? AND q.published = 1
             ORDER BY q.created_at DESC'
        );
    }
    $stmt->execute([$user['id']]);
    ok(['quizzes' => $stmt->fetchAll()]);
}

// ── SAVE/UPDATE QUIZ ───────────────────────────────────
if ($method === 'POST' && $action === 'save') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b = getBody();
    prism_assert_teacher_owns_class($db, $user['id'], (string) ($b['class_id'] ?? ''));
    $id = $b['id'] ?? uniqid('qz_');
    $ts = prism_target_section_from_body($b);

    $due     = $b['due'] ?? null;
    $due     = ($due !== null && $due !== '') ? $due : null;
    $dueTime = $b['due_time'] ?? null;
    $dueTime = ($dueTime !== null && $dueTime !== '') ? trim((string) $dueTime) : null;

    $hasTs = prism_table_has_column($db, 'quizzes', 'target_section');
    $hasDueTime = prism_table_has_column($db, 'quizzes', 'due_time');
    $hasSkip = prism_quiz_allow_skip_ready($db);

    $cols = ['id', 'class_id', 'teacher_id'];
    $vals = [$id, $b['class_id'], $user['id']];
    if ($hasTs) {
        $cols[] = 'target_section';
        $vals[] = $ts;
    }
    $cols = array_merge($cols, ['title', 'type', 'instructions', 'time_limit', 'due_date']);
    $vals = array_merge($vals, [
        $b['title'], $b['type'] ?? 'quiz', $b['instructions'] ?? '',
        intval($b['time'] ?? 0), $due,
    ]);
    if ($hasDueTime) {
        $cols[] = 'due_time';
        $vals[] = $dueTime;
    }
    $cols = array_merge($cols, ['attempts', 'shuffle', 'reveal']);
    $vals = array_merge($vals, [
        intval($b['attempts'] ?? 1), $b['shuffle'] === 'yes' ? 1 : 0,
        $b['reveal'] ?? 'submit',
    ]);
    if ($hasSkip) {
        $cols[] = 'allow_skip';
        $vals[] = !empty($b['allow_skip']) ? 1 : 0;
    }
    $cols = array_merge($cols, ['questions', 'total_points', 'published', 'published_at']);
    $vals = array_merge($vals, [
        json_encode($b['questions'] ?? []),
        intval($b['totalPoints'] ?? 0),
        $b['published'] ? 1 : 0,
        $b['published'] ? date('Y-m-d H:i:s') : null,
    ]);

    $upd = 'title=VALUES(title), type=VALUES(type), instructions=VALUES(instructions), time_limit=VALUES(time_limit), due_date=VALUES(due_date), attempts=VALUES(attempts), shuffle=VALUES(shuffle), reveal=VALUES(reveal), questions=VALUES(questions), total_points=VALUES(total_points), published=VALUES(published), published_at=VALUES(published_at)';
    if ($hasDueTime) {
        $upd = 'title=VALUES(title), type=VALUES(type), instructions=VALUES(instructions), time_limit=VALUES(time_limit), due_date=VALUES(due_date), due_time=VALUES(due_time), attempts=VALUES(attempts), shuffle=VALUES(shuffle), reveal=VALUES(reveal), questions=VALUES(questions), total_points=VALUES(total_points), published=VALUES(published), published_at=VALUES(published_at)';
    }
    if ($hasSkip) {
        $upd = 'allow_skip=VALUES(allow_skip), ' . $upd;
    }
    if ($hasTs) {
        $upd = 'target_section=VALUES(target_section), ' . $upd;
    }
    $ph = implode(',', array_fill(0, count($vals), '?'));
    $db->prepare(
        'INSERT INTO quizzes (' . implode(',', $cols) . ') VALUES (' . $ph . ')
         ON DUPLICATE KEY UPDATE ' . $upd
    )->execute($vals);
    ok(['id' => $id]);
}

// ── DELETE QUIZ ────────────────────────────────────────
if ($method === 'DELETE' && $action === 'delete') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b = getBody();
    $db->prepare('DELETE FROM quizzes WHERE id = ? AND teacher_id = ?')->execute([$b['id'], $user['id']]);
    ok();
}

// ── GET SCORES ─────────────────────────────────────────
if ($action === 'get_scores') {
    $quiz_id = $_GET['quiz_id'] ?? '';
    if ($user['role'] === 'teacher') {
        $stmt = $db->prepare(
            'SELECT qs.*, u.name AS student_name FROM quiz_scores qs
             JOIN users u ON qs.student_id = u.id
             JOIN quizzes q ON qs.quiz_id = q.id
             WHERE qs.quiz_id = ? AND q.teacher_id = ?'
        );
        $stmt->execute([$quiz_id, $user['id']]);
        ok(['scores' => $stmt->fetchAll()]);
    } else {
        $qz = $db->prepare('SELECT * FROM quizzes WHERE id = ?');
        $qz->execute([$quiz_id]);
        $qrow = $qz->fetch();
        if (!$qrow) {
            fail('Quiz not found', 404);
        }
        prism_assert_student_enrolled($db, $user['id'], $qrow['class_id']);
        $stmt = $db->prepare('SELECT score, taken_at FROM quiz_scores WHERE quiz_id = ? AND student_id = ?');
        $stmt->execute([$quiz_id, $user['id']]);
        ok(['score' => $stmt->fetch() ?: null]);
    }
}

// ── GET ALL SCORES FOR STUDENT ─────────────────────────
if ($action === 'get_my_scores') {
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    $stmt = $db->prepare('SELECT quiz_id, score, taken_at FROM quiz_scores WHERE student_id = ?');
    $stmt->execute([$user['id']]);
    $rows = $stmt->fetchAll();
    $map = [];
    foreach ($rows as $r) $map[$r['quiz_id']] = intval($r['score']);
    ok(['scores' => $map]);
}

// ── SUBMIT QUIZ SCORE ──────────────────────────────────
if ($method === 'POST' && $action === 'submit_score') {
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    $b = getBody();
    $qid = $b['quiz_id'] ?? '';
    $qz = $db->prepare('SELECT * FROM quizzes WHERE id = ?');
    $qz->execute([$qid]);
    $qrow = $qz->fetch();
    if (!$qrow) {
        fail('Quiz not found', 404);
    }
    prism_assert_student_enrolled($db, $user['id'], $qrow['class_id']);
    prism_assert_student_matches_quiz_section($db, $user, $qrow);
    $dueTimeCol = $qrow['due_time'] ?? null;
    if ($qrow && !empty($qrow['due_date']) && prism_is_past_deadline($qrow['due_date'], $dueTimeCol)) {
        fail('The deadline for this quiz has passed. Please contact your teacher if you need an extension.', 403);
    }
    $db->prepare(
        'INSERT INTO quiz_scores (quiz_id, student_id, score, answers)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE score=VALUES(score), answers=VALUES(answers), taken_at=NOW()'
    )->execute([$b['quiz_id'], $user['id'], intval($b['score']), json_encode($b['answers']??[])]);
    ok();
}

// ── LOG QUIZ ACTIVITY ──────────────────────────────────
if ($method === 'POST' && $action === 'log') {
    if (($user['role'] ?? '') !== 'student') fail('Forbidden', 403);
    $b = getBody();
    $qid = $b['quiz_id'] ?? '';
    $qc = $db->prepare('SELECT * FROM quizzes WHERE id = ?');
    $qc->execute([$qid]);
    $qr = $qc->fetch();
    if (!$qr) fail('Quiz not found', 404);
    prism_assert_student_enrolled($db, $user['id'], $qr['class_id']);
    prism_assert_student_matches_quiz_section($db, $user, $qr);
    $db->prepare('INSERT INTO quiz_logs (quiz_id, student_id, type, detail) VALUES (?,?,?,?)')
       ->execute([$qid, $user['id'], $b['type'], $b['detail']??'']);
    ok();
}

// ── GET QUIZ LOG (teacher) ─────────────────────────────
if ($action === 'get_log') {
    requireAuth(['teacher']);
    $quiz_id = $_GET['quiz_id'] ?? '';
    $chk = $db->prepare('SELECT id FROM quizzes WHERE id = ? AND teacher_id = ?');
    $chk->execute([$quiz_id, $user['id']]);
    if (!$chk->fetch()) fail('Quiz not found', 404);
    $stmt = $db->prepare(
        'SELECT ql.*, u.name AS student_name FROM quiz_logs ql
         JOIN users u ON ql.student_id = u.id
         WHERE ql.quiz_id = ? ORDER BY ql.logged_at DESC'
    );
    $stmt->execute([$quiz_id]);
    ok(['log' => $stmt->fetchAll()]);
}

if ($method === 'POST' && $action === 'upload_image') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $f = $_FILES['image'] ?? null;
    if (!$f || !is_array($f)) fail('Choose an image.', 400);
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) fail('Image upload failed.', 400);
    if (($f['size'] ?? 0) > MAX_FILE_SIZE) fail('Image is too large. Max 15 MB.', 400);
    if (empty($f['tmp_name']) || !is_uploaded_file($f['tmp_name'])) fail('Could not read the image.', 400);
    $ext = strtolower((string) pathinfo((string) ($f['name'] ?? ''), PATHINFO_EXTENSION));
    $okExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
    if (!in_array($ext, $okExt, true)) fail('Use a PNG, JPG, GIF, or WebP image.', 400);
    $bin = file_get_contents($f['tmp_name']);
    if ($bin === false || $bin === '') fail('Could not read the image.', 400);
    if (!is_dir(UPLOAD_DIR)) @mkdir(UPLOAD_DIR, 0775, true);
    $safe = 'qimg_' . bin2hex(random_bytes(8)) . '.' . $ext;
    if (file_put_contents(UPLOAD_DIR . $safe, $bin) === false) fail('Could not save the image.', 500);
    $mimeMap = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'bmp' => 'image/bmp'];
    $path = UPLOAD_URL . $safe;
    prism_save_upload_blob($path, (string) $f['name'], $mimeMap[$ext], $bin);
    ok(['path' => $path]);
}

fail('Unknown action');

