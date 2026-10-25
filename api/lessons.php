<?php
// Teacher lesson plans and the slides, PDFs, and images used to teach them.
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();

if ($user['role'] !== 'teacher') {
    fail('Forbidden', 403);
}

function lesson_tables($db) {
    $db->exec(
        'CREATE TABLE IF NOT EXISTS lesson_plans (
            id VARCHAR(50) PRIMARY KEY,
            class_id VARCHAR(50) NOT NULL,
            teacher_id VARCHAR(50) NOT NULL,
            title VARCHAR(160) NOT NULL,
            lesson_date DATE DEFAULT NULL,
            plan MEDIUMTEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS lesson_files (
            id VARCHAR(50) PRIMARY KEY,
            lesson_id VARCHAR(50) NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            mime_type VARCHAR(120) DEFAULT \'\',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )'
    );
}

function lesson_ext_ok($ext) {
    return in_array($ext, ['pdf', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'], true);
}

function lesson_mime($name, $fallback) {
    $ext = strtolower((string) pathinfo((string) $name, PATHINFO_EXTENSION));
    $map = [
        'pdf' => 'application/pdf',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'bmp' => 'image/bmp',
    ];
    if (!$fallback || $fallback === 'application/octet-stream') {
        return $map[$ext] ?? 'application/octet-stream';
    }
    return $fallback;
}

function lesson_store($id, $fileName, $bin, $mime) {
    if ($bin === false || $bin === null || $bin === '') {
        fail('Could not read the uploaded file.', 400);
    }
    if (strlen($bin) > MAX_FILE_SIZE) {
        fail('File too large. Max 15 MB.', 400);
    }
    $ext = strtolower((string) pathinfo((string) $fileName, PATHINFO_EXTENSION));
    if (!lesson_ext_ok($ext)) {
        fail('Attach a PDF, PowerPoint, or image.', 400);
    }
    if (!is_dir(UPLOAD_DIR)) {
        @mkdir(UPLOAD_DIR, 0775, true);
    }
    $safe = $id . '.' . $ext;
    if (file_put_contents(UPLOAD_DIR . $safe, $bin) === false) {
        fail('Could not save the file on the server.', 500);
    }
    return [lesson_mime($fileName, $mime), UPLOAD_URL . $safe];
}

function lesson_owns_class($db, $classId, $teacherId) {
    $own = $db->prepare('SELECT id, subject FROM classes WHERE id = ? AND teacher_id = ?');
    $own->execute([$classId, $teacherId]);
    return $own->fetch();
}

function lesson_collect_uploads() {
    if (empty($_FILES['files']) || !is_array($_FILES['files'])) {
        return [];
    }
    $f = $_FILES['files'];
    $names = $f['name'] ?? [];
    if (!is_array($names)) {
        $names = [$names];
        $f['type'] = [$f['type'] ?? ''];
        $f['tmp_name'] = [$f['tmp_name'] ?? ''];
        $f['error'] = [$f['error'] ?? UPLOAD_ERR_NO_FILE];
        $f['size'] = [$f['size'] ?? 0];
    }
    $out = [];
    $count = count($names);
    for ($i = 0; $i < $count; $i++) {
        $err = $f['error'][$i] ?? UPLOAD_ERR_NO_FILE;
        if ($err === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($err !== UPLOAD_ERR_OK) {
            fail('File upload failed. Try a smaller file.', 400);
        }
        if (($f['size'][$i] ?? 0) > MAX_FILE_SIZE) {
            fail('File too large. Max 15 MB.', 400);
        }
        $tmp = $f['tmp_name'][$i] ?? '';
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            fail('Could not read the uploaded file.', 400);
        }
        $bin = file_get_contents($tmp);
        $out[] = [
            'name' => $names[$i] ?: 'file',
            'mime' => $f['type'][$i] ?? 'application/octet-stream',
            'bin' => $bin,
        ];
    }
    if (count($out) > 8) {
        fail('Attach up to 8 files on one lesson.', 400);
    }
    return $out;
}

function lesson_unlink($path) {
    if (!$path || strpos($path, UPLOAD_URL) !== 0) {
        return;
    }
    $disk = UPLOAD_DIR . substr($path, strlen(UPLOAD_URL));
    if (is_file($disk)) {
        @unlink($disk);
    }
}

try {
    lesson_tables($db);
} catch (PDOException $e) {
    error_log('lesson tables: ' . $e->getMessage());
    fail('Could not prepare lesson storage', 500);
}

if ($method === 'GET' && $action === 'list') {
    $classId = trim($_GET['class_id'] ?? '');
    if ($classId === '' || !lesson_owns_class($db, $classId, $user['id'])) {
        fail('Class not found', 404);
    }
    $stmt = $db->prepare('SELECT id, title, lesson_date, plan, created_at FROM lesson_plans WHERE class_id = ? AND teacher_id = ? ORDER BY COALESCE(lesson_date, created_at) DESC, created_at DESC');
    $stmt->execute([$classId, $user['id']]);
    $lessons = $stmt->fetchAll();
    $fileStmt = $db->prepare('SELECT id, lesson_id, file_name, file_path, mime_type FROM lesson_files WHERE lesson_id = ? ORDER BY created_at ASC');
    foreach ($lessons as &$lesson) {
        $fileStmt->execute([$lesson['id']]);
        $lesson['files'] = $fileStmt->fetchAll();
        $lesson['lesson_date'] = $lesson['lesson_date'] ?: '';
        $lesson['plan'] = $lesson['plan'] ?: '';
    }
    unset($lesson);
    ok(['lessons' => $lessons]);
}

if ($method === 'POST' && $action === 'save') {
    $classId = trim($_POST['class_id'] ?? '');
    $title = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', (string) ($_POST['title'] ?? '')));
    $date = trim($_POST['lesson_date'] ?? '');
    $plan = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', (string) ($_POST['plan'] ?? '')));
    if ($classId === '' || !lesson_owns_class($db, $classId, $user['id'])) {
        fail('Class not found', 404);
    }
    if ($title === '') {
        fail('Give the lesson a title.');
    }
    if (function_exists('mb_substr')) {
        $title = mb_substr($title, 0, 160);
        $plan = mb_substr($plan, 0, 20000);
    } else {
        $title = substr($title, 0, 160);
        $plan = substr($plan, 0, 20000);
    }
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        fail('Use a real lesson date.');
    }
    $uploads = lesson_collect_uploads();
    foreach ($uploads as $up) {
        $ext = strtolower((string) pathinfo((string) $up['name'], PATHINFO_EXTENSION));
        if (!lesson_ext_ok($ext)) {
            fail('Attach a PDF, PowerPoint, or image.', 400);
        }
        if (strlen((string) $up['bin']) > MAX_FILE_SIZE) {
            fail('File too large. Max 15 MB.', 400);
        }
    }
    $id = bin2hex(random_bytes(8));
    $db->prepare('INSERT INTO lesson_plans (id, class_id, teacher_id, title, lesson_date, plan) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$id, $classId, $user['id'], $title, $date !== '' ? $date : null, $plan]);
    $insertFile = $db->prepare('INSERT INTO lesson_files (id, lesson_id, file_name, file_path, mime_type) VALUES (?, ?, ?, ?, ?)');
    $saved = [];
    foreach ($uploads as $i => $up) {
        $fileId = $id . 'f' . $i;
        $cleanName = preg_replace('/[^\w.\- ]+/u', '', (string) $up['name']);
        if ($cleanName === '') {
            $cleanName = 'file';
        }
        list($mime, $path) = lesson_store($fileId, $up['name'], $up['bin'], $up['mime']);
        $insertFile->execute([$fileId, $id, $cleanName, $path, $mime]);
        $saved[] = ['id' => $fileId, 'file_name' => $cleanName, 'file_path' => $path, 'mime_type' => $mime];
    }
    ok(['id' => $id, 'files' => $saved]);
}

if ($method === 'POST' && $action === 'delete') {
    $body = getBody();
    $id = trim($body['id'] ?? '');
    $stmt = $db->prepare('SELECT id FROM lesson_plans WHERE id = ? AND teacher_id = ?');
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) {
        fail('Lesson not found', 404);
    }
    $files = $db->prepare('SELECT file_path FROM lesson_files WHERE lesson_id = ?');
    $files->execute([$id]);
    foreach ($files->fetchAll() as $row) {
        lesson_unlink($row['file_path']);
    }
    $db->prepare('DELETE FROM lesson_files WHERE lesson_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM lesson_plans WHERE id = ?')->execute([$id]);
    ok();
}

fail('Unknown action', 404);
