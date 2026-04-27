<?php
// api/content.php — Posts, Materials, Assignments, Records
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();

// ══════════════════════════════════════════════════════
//  POSTS (stream)
// ══════════════════════════════════════════════════════

if ($action === 'get_posts') {
    $class_id = $_GET['class_id'] ?? '';
    prism_assert_class_access($db, $user, $class_id);
    $stuSec = prism_student_section_for_filter($db, $user);
    if ($stuSec !== null && prism_table_has_column($db, 'posts', 'target_section')) {
        $stmt = $db->prepare(
            'SELECT * FROM posts WHERE class_id = ? AND (target_section IS NULL OR TRIM(target_section) = "" OR TRIM(target_section) = ?) ORDER BY created_at DESC'
        );
        $stmt->execute([$class_id, $stuSec]);
    } else {
        $stmt = $db->prepare('SELECT * FROM posts WHERE class_id = ? ORDER BY created_at DESC');
        $stmt->execute([$class_id]);
    }
    ok(['posts' => $stmt->fetchAll()]);
}

if ($action === 'add_post') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b = getBody();
    prism_assert_teacher_owns_class($db, $user['id'], (string) ($b['class_id'] ?? ''));
    $id = uniqid('post_');
    $ts = prism_target_section_from_body($b);
    if (prism_table_has_column($db, 'posts', 'target_section')) {
        $db->prepare('INSERT INTO posts (id, class_id, teacher_id, target_section, type, body, attachment, quiz_id, author) VALUES (?,?,?,?,?,?,?,?,?)')
           ->execute([$id, $b['class_id'], $user['id'], $ts, $b['type'], $b['body'], $b['attachment']??null, $b['quiz_id']??null, $b['author']??$user['name']]);
    } else {
        $db->prepare('INSERT INTO posts (id, class_id, teacher_id, type, body, attachment, quiz_id, author) VALUES (?,?,?,?,?,?,?,?)')
           ->execute([$id, $b['class_id'], $user['id'], $b['type'], $b['body'], $b['attachment']??null, $b['quiz_id']??null, $b['author']??$user['name']]);
    }
    ok(['id' => $id]);
}

if ($action === 'delete_post') {
    $b = getBody();
    $db->prepare('DELETE FROM posts WHERE id = ? AND teacher_id = ?')->execute([$b['id'], $user['id']]);
    ok();
}

// ══════════════════════════════════════════════════════
//  MATERIALS
// ══════════════════════════════════════════════════════

if ($action === 'get_materials') {
    $class_id = $_GET['class_id'] ?? '';
    prism_assert_class_access($db, $user, $class_id);
    $stuSec = prism_student_section_for_filter($db, $user);
    if ($stuSec !== null && prism_table_has_column($db, 'materials', 'target_section')) {
        $stmt = $db->prepare(
            'SELECT id, class_id, teacher_id, target_section, title, type, url, file_name, file_data, file_path, mime_type, description, created_at FROM materials WHERE class_id = ? AND (target_section IS NULL OR TRIM(target_section) = "" OR TRIM(target_section) = ?) ORDER BY created_at DESC'
        );
        $stmt->execute([$class_id, $stuSec]);
    } else {
        $sel = prism_table_has_column($db, 'materials', 'target_section')
            ? 'id, class_id, teacher_id, target_section, title, type, url, file_name, file_data, file_path, mime_type, description, created_at'
            : 'id, class_id, teacher_id, title, type, url, file_name, file_data, file_path, mime_type, description, created_at';
        $stmt = $db->prepare('SELECT ' . $sel . ' FROM materials WHERE class_id = ? ORDER BY created_at DESC');
        $stmt->execute([$class_id]);
    }
    ok(['materials' => $stmt->fetchAll()]);
}

if ($action === 'add_material') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b = getBody();
    prism_assert_teacher_owns_class($db, $user['id'], (string) ($b['class_id'] ?? ''));
    $id = uniqid('mat_');

    $file_data = null; $file_name = null; $file_path = null; $mime = null;

    if ($b['type'] === 'file' && !empty($b['fileData']['base64'])) {
        $file_name = $b['fileData']['name'] ?? 'file';
        $mime      = $b['fileData']['mime'] ?? 'application/octet-stream';
        // Store as file on server instead of base64 in DB (better performance)
        $ext       = pathinfo($file_name, PATHINFO_EXTENSION);
        $safe_name = $id . '.' . $ext;
        $upload_path = UPLOAD_DIR . $safe_name;
        $base64_data = $b['fileData']['base64'];
        // Strip the data:...;base64, prefix
        if (strpos($base64_data, ',') !== false) {
            $base64_data = explode(',', $base64_data, 2)[1];
        }
        if (file_put_contents($upload_path, base64_decode($base64_data)) !== false) {
            $file_path = UPLOAD_URL . $safe_name;
        } else {
            // Fallback: store base64 in DB
            $file_data = $b['fileData']['base64'];
        }
    }

    $ts = prism_target_section_from_body($b);
    if (prism_table_has_column($db, 'materials', 'target_section')) {
        $db->prepare('INSERT INTO materials (id, class_id, teacher_id, target_section, title, type, url, file_name, file_data, file_path, mime_type, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([$id, $b['class_id'], $user['id'], $ts, $b['title'], $b['type'], $b['url']??'', $file_name, $file_data, $file_path, $mime, $b['desc']??'']);
    } else {
        $db->prepare('INSERT INTO materials (id, class_id, teacher_id, title, type, url, file_name, file_data, file_path, mime_type, description) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([$id, $b['class_id'], $user['id'], $b['title'], $b['type'], $b['url']??'', $file_name, $file_data, $file_path, $mime, $b['desc']??'']);
    }
    ok(['id' => $id, 'file_path' => $file_path]);
}

if ($action === 'delete_material') {
    $b = getBody();
    // Remove file from disk if exists
    $stmt = $db->prepare('SELECT file_path FROM materials WHERE id = ?');
    $stmt->execute([$b['id']]);
    $mat = $stmt->fetch();
    if ($mat && $mat['file_path']) {
        $disk_path = str_replace(UPLOAD_URL, UPLOAD_DIR, $mat['file_path']);
        if (file_exists($disk_path)) unlink($disk_path);
    }
    $db->prepare('DELETE FROM materials WHERE id = ? AND teacher_id = ?')->execute([$b['id'], $user['id']]);
    ok();
}

// ══════════════════════════════════════════════════════
//  ASSIGNMENTS
// ══════════════════════════════════════════════════════

if ($action === 'get_assignments') {
    $class_id = $_GET['class_id'] ?? '';
    prism_assert_class_access($db, $user, $class_id);
    $stuSec = prism_student_section_for_filter($db, $user);
    if ($stuSec !== null && prism_table_has_column($db, 'assignments', 'target_section')) {
        $stmt = $db->prepare(
            'SELECT * FROM assignments WHERE class_id = ? AND (target_section IS NULL OR TRIM(target_section) = "" OR TRIM(target_section) = ?) ORDER BY created_at DESC'
        );
        $stmt->execute([$class_id, $stuSec]);
    } else {
        $stmt = $db->prepare('SELECT * FROM assignments WHERE class_id = ? ORDER BY created_at DESC');
        $stmt->execute([$class_id]);
    }
    ok(['assignments' => $stmt->fetchAll()]);
}

if ($action === 'add_assignment') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b = getBody();
    prism_assert_teacher_owns_class($db, $user['id'], (string) ($b['class_id'] ?? ''));
    $id = uniqid('asgn_');
    $dueA     = $b['due'] ?? null;
    $dueA     = ($dueA !== null && $dueA !== '') ? $dueA : null;
    $dueTimeA = null;

    $attach_url = trim((string) ($b['attach_url'] ?? ''));
    $attach_url = $attach_url !== '' ? $attach_url : null;
    $afn = null;
    $afp = null;
    $amm = null;
    $hasAssignAttach = prism_table_has_column($db, 'assignments', 'attach_url')
        || prism_table_has_column($db, 'assignments', 'attach_file_path');
    $fd = $b['fileData'] ?? $b['file_data'] ?? null;
    if ($hasAssignAttach && is_array($fd) && !empty($fd['base64'])) {
        $fn = $fd['name'] ?? 'file';
        $amm = $fd['mime'] ?? 'application/octet-stream';
        $raw = $fd['base64'];
        if (strpos($raw, ',') !== false) {
            $raw = explode(',', $raw, 2)[1];
        }
        $raw = preg_replace('/\s+/', '', $raw);
        $bin = base64_decode($raw, true);
        if ($bin === false) {
            $bin = base64_decode($raw, false);
        }
        $ext = pathinfo($fn, PATHINFO_EXTENSION);
        $safe_name = $id . '_ref.' . ($ext ?: 'bin');
        $upload_path = UPLOAD_DIR . $safe_name;
        if ($bin !== false && strlen($bin) <= MAX_FILE_SIZE && file_put_contents($upload_path, $bin) !== false) {
            $afn = $fn;
            $afp = UPLOAD_URL . $safe_name;
        }
    }

    $tsAsgn = prism_target_section_from_body($b);
    $cols = ['id', 'class_id', 'teacher_id', 'title', 'type', 'instructions'];
    $vals = [$id, $b['class_id'], $user['id'], $b['title'], $b['type'] ?? 'written', $b['instructions'] ?? ''];
    if (prism_table_has_column($db, 'assignments', 'target_section')) {
        array_splice($cols, 3, 0, ['target_section']);
        array_splice($vals, 3, 0, [$tsAsgn]);
    }
    if ($hasAssignAttach) {
        array_push($cols, 'attach_url', 'attach_file_name', 'attach_file_path', 'attach_mime');
        array_push($vals, $attach_url, $afn, $afp, $amm);
    }
    $cols[] = 'points';
    $cols[] = 'due_date';
    array_push($vals, intval($b['pts'] ?? 0), $dueA);
    if (prism_table_has_column($db, 'assignments', 'due_time')) {
        $cols[] = 'due_time';
        $vals[] = $dueTimeA;
    }
    $ph = implode(',', array_fill(0, count($vals), '?'));
    $db->prepare('INSERT INTO assignments (' . implode(',', $cols) . ') VALUES (' . $ph . ')')->execute($vals);
    ok(['id' => $id, 'attach_file_path' => $afp]);
}

if ($action === 'delete_assignment') {
    $b = getBody();
    $aid = $b['id'] ?? '';
    if (prism_table_has_column($db, 'assignments', 'attach_file_path')) {
        $st = $db->prepare('SELECT attach_file_path FROM assignments WHERE id = ? AND teacher_id = ?');
        $st->execute([$aid, $user['id']]);
        $row = $st->fetch();
        if ($row && !empty($row['attach_file_path'])) {
            $disk = str_replace(UPLOAD_URL, UPLOAD_DIR, $row['attach_file_path']);
            if ($disk && file_exists($disk)) {
                @unlink($disk);
            }
        }
    }
    $db->prepare('DELETE FROM assignments WHERE id = ? AND teacher_id = ?')->execute([$aid, $user['id']]);
    ok();
}

// ══════════════════════════════════════════════════════
//  SUBMISSIONS
// ══════════════════════════════════════════════════════

if ($action === 'get_submissions') {
    // Teacher: get all submissions for an assignment
    requireAuth(['teacher']);
    $asgn_id = $_GET['assignment_id'] ?? '';
    $chk = $db->prepare(
        'SELECT a.id FROM assignments a JOIN classes c ON a.class_id = c.id WHERE a.id = ? AND c.teacher_id = ?'
    );
    $chk->execute([$asgn_id, $user['id']]);
    if (!$chk->fetch()) {
        fail('Assignment not found', 404);
    }
    $stmt = $db->prepare(
        'SELECT s.*, u.name AS student_name, u.section
         FROM submissions s JOIN users u ON s.student_id = u.id
         WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC'
    );
    $stmt->execute([$asgn_id]);
    ok(['submissions' => $stmt->fetchAll()]);
}

if ($action === 'get_my_submission') {
    // Student: get own submission
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    $asgn_id  = $_GET['assignment_id'] ?? '';
    $class_id = $_GET['class_id']      ?? '';
    prism_assert_student_enrolled($db, $user['id'], $class_id);
    $chk = $db->prepare('SELECT class_id FROM assignments WHERE id = ?');
    $chk->execute([$asgn_id]);
    $ar = $chk->fetch();
    if (!$ar || $ar['class_id'] !== $class_id) {
        fail('Invalid assignment', 400);
    }
    $stmt = $db->prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?');
    $stmt->execute([$asgn_id, $user['id']]);
    ok(['submission' => $stmt->fetch() ?: null]);
}

if ($action === 'get_my_submissions') {
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    $class_id = $_GET['class_id'] ?? '';
    prism_assert_student_enrolled($db, $user['id'], $class_id);
    $stmt = $db->prepare('SELECT * FROM submissions WHERE student_id = ? AND class_id = ?');
    $stmt->execute([$user['id'], $class_id]);
    ok(['submissions' => $stmt->fetchAll()]);
}

if ($action === 'submit') {
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    try {
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    $multipartFiles = [];
    if (stripos($ct, 'multipart/form-data') !== false) {
        $b = [
            'assignment_id' => $_POST['assignment_id'] ?? '',
            'class_id'      => $_POST['class_id'] ?? '',
            'note'          => $_POST['note'] ?? '',
            'link_url'      => $_POST['link_url'] ?? '',
        ];
        if (!empty($_FILES['files'])) {
            $f = $_FILES['files'];
            if (is_array($f['name'])) {
                $n = count($f['name']);
                for ($i = 0; $i < $n; $i++) {
                    if (($f['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                        continue;
                    }
                    $multipartFiles[] = [
                        'tmp_name' => $f['tmp_name'][$i],
                        'name'     => $f['name'][$i],
                        'type'     => $f['type'][$i] ?? 'application/octet-stream',
                        'size'     => (int) ($f['size'][$i] ?? 0),
                    ];
                }
            } elseif (($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                $multipartFiles[] = [
                    'tmp_name' => $f['tmp_name'],
                    'name'     => $f['name'],
                    'type'     => $f['type'] ?? 'application/octet-stream',
                    'size'     => (int) ($f['size'] ?? 0),
                ];
            }
        }
    } else {
        $b = getBody();
    }
    $asgn_id  = $b['assignment_id'] ?? '';
    $class_id = $b['class_id']      ?? '';
    $note     = trim((string) ($b['note'] ?? ''));

    prism_assert_student_enrolled($db, $user['id'], $class_id);
    $asgnClassChk = $db->prepare('SELECT class_id, due_date FROM assignments WHERE id = ?');
    $asgnClassChk->execute([$asgn_id]);
    $asgnClassRow = $asgnClassChk->fetch();
    if (!$asgnClassRow || $asgnClassRow['class_id'] !== $class_id) {
        fail('Assignment does not belong to this class', 400);
    }

    $existingSub = null;
    if ($asgn_id !== '' && !empty($user['id'])) {
        try {
            $stPrev = $db->prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ? LIMIT 1');
            $stPrev->execute([$asgn_id, $user['id']]);
            $existingSub = $stPrev->fetch(PDO::FETCH_ASSOC) ?: null;
        } catch (Throwable $e) {
            $existingSub = null;
        }
    }

    $link_url = trim((string) ($b['link_url'] ?? ''));
    if ($link_url !== '' && strlen($link_url) > 500) {
        $link_url = substr($link_url, 0, 500);
    }
    $link_url = $link_url !== '' ? $link_url : null;

    $asgnRow = $asgnClassRow;
    if ($asgnRow && !empty($asgnRow['due_date']) && prism_is_past_deadline($asgnRow['due_date'], null)) {
        fail('The deadline for this assignment has passed. Please contact your teacher if you need more time.', 403);
    }

    $hasJson = prism_table_has_column($db, 'submissions', 'attachments_json');
    $hasLink = prism_table_has_column($db, 'submissions', 'link_url');
    $maxFiles = ($hasJson && $hasLink) ? 10 : 1;

    $attachments = [];
    $uidSafe = preg_replace('/[^a-zA-Z0-9_]/', '_', $user['id']);
    $asgnSafe = preg_replace('/[^a-zA-Z0-9_]/', '_', $asgn_id);

    if (!empty($multipartFiles)) {
        foreach ($multipartFiles as $up) {
            if (count($attachments) >= $maxFiles) {
                break;
            }
            if (($up['size'] ?? 0) > MAX_FILE_SIZE || empty($up['tmp_name']) || !is_uploaded_file($up['tmp_name'])) {
                continue;
            }
            $bin = file_get_contents($up['tmp_name']);
            if ($bin === false || strlen($bin) > MAX_FILE_SIZE) {
                continue;
            }
            $fn = $up['name'] ?? 'file';
            $mime = $up['type'] ?? 'application/octet-stream';
            $ext = pathinfo($fn, PATHINFO_EXTENSION);
            $safe_name = 'sub_' . $uidSafe . '_' . $asgnSafe . '_' . bin2hex(random_bytes(4)) . ($ext ? '.' . $ext : '');
            $upload_path = UPLOAD_DIR . $safe_name;
            if (file_put_contents($upload_path, $bin) !== false) {
                $attachments[] = ['name' => $fn, 'path' => UPLOAD_URL . $safe_name, 'mime' => $mime];
            }
        }
    }

    if (!empty($b['files']) && is_array($b['files'])) {
        foreach ($b['files'] as $fd) {
            if (count($attachments) >= $maxFiles) {
                break;
            }
            if (empty($fd['base64'])) {
                continue;
            }
            $fn = $fd['name'] ?? 'file';
            $mime = $fd['mime'] ?? 'application/octet-stream';
            $raw = $fd['base64'];
            if (strpos($raw, ',') !== false) {
                $raw = explode(',', $raw, 2)[1];
            }
            $raw = preg_replace('/\s+/', '', $raw);
            $bin = base64_decode($raw, true);
            if ($bin === false) {
                $bin = base64_decode($raw, false);
            }
            if ($bin === false || strlen($bin) > MAX_FILE_SIZE) {
                continue;
            }
            $ext = pathinfo($fn, PATHINFO_EXTENSION);
            $safe_name = 'sub_' . $uidSafe . '_' . $asgnSafe . '_' . bin2hex(random_bytes(4)) . ($ext ? '.' . $ext : '');
            $upload_path = UPLOAD_DIR . $safe_name;
            if (file_put_contents($upload_path, $bin) !== false) {
                $attachments[] = ['name' => $fn, 'path' => UPLOAD_URL . $safe_name, 'mime' => $mime];
            }
        }
    }

    if (empty($attachments) && !empty($b['fileData']['base64'])) {
        $fn = $b['fileData']['name'] ?? 'submission';
        $mime = $b['fileData']['mime'] ?? 'application/octet-stream';
        $ext = pathinfo($fn, PATHINFO_EXTENSION);
        $safe_name = 'sub_' . $uidSafe . '_' . $asgnSafe . '_' . bin2hex(random_bytes(4)) . ($ext ? '.' . $ext : '');
        $upload_path = UPLOAD_DIR . $safe_name;
        $raw = $b['fileData']['base64'];
        if (strpos($raw, ',') !== false) {
            $raw = explode(',', $raw, 2)[1];
        }
        $raw = preg_replace('/\s+/', '', $raw);
        $bin = base64_decode($raw, true);
        if ($bin === false) {
            $bin = base64_decode($raw, false);
        }
        if ($bin !== false && strlen($bin) <= MAX_FILE_SIZE && file_put_contents($upload_path, $bin) !== false) {
            $attachments[] = ['name' => $fn, 'path' => UPLOAD_URL . $safe_name, 'mime' => $mime];
        } elseif (!empty($b['fileData']['base64'])) {
            $attachments[] = [
                'name' => $fn,
                'path' => null,
                'mime' => $mime,
                'data' => $b['fileData']['base64'],
            ];
        }
    }

    if ($note === '' && !$link_url && empty($attachments)) {
        $jsonPrev = trim((string) ($existingSub['attachments_json'] ?? ''));
        $hadFiles = $existingSub && (
            !empty($existingSub['file_path'])
            || !empty($existingSub['file_data'])
            || ($jsonPrev !== '' && $jsonPrev !== '[]' && $jsonPrev !== 'null')
        );
        if (!$hadFiles) {
            fail('Add a written response, a link, or at least one file.', 400);
        }
    }

    if (!$hasLink && $link_url) {
        $note = trim(($note !== '' ? $note . "\n\n" : '') . 'Link: ' . $link_url);
        $link_url = null;
    }

    $file_data = null;
    $file_name = null;
    $file_path = null;
    $mime = null;
    $attachments_json = null;
    if (!empty($attachments)) {
        $clean = [];
        foreach ($attachments as $a) {
            if (!empty($a['data'])) {
                $clean[] = ['name' => $a['name'], 'mime' => $a['mime'] ?? 'application/octet-stream', 'inline' => true];
            } else {
                $clean[] = ['name' => $a['name'], 'path' => $a['path'], 'mime' => $a['mime'] ?? 'application/octet-stream'];
            }
        }
        $attachments_json = $hasJson ? json_encode($clean) : null;
        $first = $attachments[0];
        if (empty($first['data'])) {
            $file_name = $first['name'];
            $file_path = $first['path'];
            $mime = $first['mime'] ?? 'application/octet-stream';
        } else {
            $file_name = $first['name'];
            $file_data = $first['data'];
            $mime = $first['mime'] ?? 'application/octet-stream';
        }
    }

    if (empty($attachments) && $existingSub) {
        $jsonPrev = trim((string) ($existingSub['attachments_json'] ?? ''));
        $hadFiles = !empty($existingSub['file_path'])
            || !empty($existingSub['file_data'])
            || ($jsonPrev !== '' && $jsonPrev !== '[]' && $jsonPrev !== 'null');
        if ($hadFiles) {
            $file_name = $existingSub['file_name'];
            $file_data = $existingSub['file_data'];
            $file_path = $existingSub['file_path'];
            $mime = $existingSub['mime_type'];
            if ($hasJson) {
                $attachments_json = $existingSub['attachments_json'];
            }
        }
    }

    if ($hasJson && $hasLink) {
        $db->prepare(
            'INSERT INTO submissions (assignment_id, student_id, class_id, note, link_url, file_name, file_data, file_path, mime_type, attachments_json)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE note=VALUES(note), link_url=VALUES(link_url), file_name=VALUES(file_name), file_data=VALUES(file_data), file_path=VALUES(file_path), mime_type=VALUES(mime_type), attachments_json=VALUES(attachments_json), submitted_at=NOW()'
        )->execute([$asgn_id, $user['id'], $class_id, $note, $link_url, $file_name, $file_data, $file_path, $mime, $attachments_json]);
    } else {
        $db->prepare(
            'INSERT INTO submissions (assignment_id, student_id, class_id, note, file_name, file_data, file_path, mime_type)
             VALUES (?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE note=VALUES(note), file_name=VALUES(file_name), file_data=VALUES(file_data), file_path=VALUES(file_path), mime_type=VALUES(mime_type), submitted_at=NOW()'
        )->execute([$asgn_id, $user['id'], $class_id, $note, $file_name, $file_data, $file_path, $mime]);
    }
    ok(['file_path' => $file_path, 'attachments' => $attachments]);
    } catch (Throwable $e) {
        error_log('content.php submit: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
        fail('Could not save submission. Check file size limits and try again.', 500);
    }
}

// ══════════════════════════════════════════════════════
//  RECORDS (daily grades + attendance)
// ══════════════════════════════════════════════════════

if ($action === 'get_records') {
    requireAuth(['teacher']);
    $class_id = $_GET['class_id']     ?? '';
    $date     = $_GET['session_date'] ?? '';
    if ($date) {
        $stmt = $db->prepare('SELECT * FROM records WHERE class_id = ? AND session_date = ?');
        $stmt->execute([$class_id, $date]);
    } else {
        $stmt = $db->prepare('SELECT * FROM records WHERE class_id = ? ORDER BY session_date DESC');
        $stmt->execute([$class_id]);
    }
    ok(['records' => $stmt->fetchAll()]);
}

if ($action === 'get_session_dates') {
    requireAuth(['teacher']);
    $class_id = $_GET['class_id'] ?? '';
    $stmt = $db->prepare('SELECT DISTINCT session_date FROM records WHERE class_id = ? ORDER BY session_date DESC');
    $stmt->execute([$class_id]);
    ok(['dates' => array_column($stmt->fetchAll(), 'session_date')]);
}

if ($action === 'save_record') {
    requireAuth(['teacher']);
    $b = getBody();
    $db->prepare(
        'INSERT INTO records (class_id, student_id, session_date, attendance, quiz_grade, activity_grade, midterm_grade, final_grade, remarks)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE attendance=VALUES(attendance), quiz_grade=VALUES(quiz_grade), activity_grade=VALUES(activity_grade), midterm_grade=VALUES(midterm_grade), final_grade=VALUES(final_grade), remarks=VALUES(remarks), updated_at=NOW()'
    )->execute([
        $b['class_id'], $b['student_id'], $b['session_date'],
        $b['attendance'] ?? 'Present',
        $b['quiz']       !== '' ? $b['quiz']       : null,
        $b['activity']   !== '' ? $b['activity']   : null,
        $b['midterm']    !== '' ? $b['midterm']    : null,
        $b['final']      !== '' ? $b['final']      : null,
        $b['remarks']    ?? '',
    ]);
    ok();
}

fail('Unknown action');

