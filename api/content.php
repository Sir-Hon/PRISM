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
            'SELECT * FROM posts WHERE class_id = ? AND (target_section IS NULL OR TRIM(target_section) = \'\' OR TRIM(target_section) = ?) ORDER BY created_at DESC'
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

function prism_normalize_http_url($raw) {
    $url = trim((string) $raw);
    if ($url === '') {
        return '';
    }
    if (preg_match('#^(javascript|data|file|vbscript):#i', $url)) {
        return '';
    }
    if (!preg_match('#^[a-z][a-z0-9+.-]*://#i', $url)) {
        $url = 'https://' . $url;
    }
    if (!preg_match('#^https?://#i', $url)) {
        return '';
    }
    if (filter_var($url, FILTER_VALIDATE_URL) === false) {
        return '';
    }
    return $url;
}

function prism_is_video_page_url($url) {
    return (bool) preg_match('/youtube\.com|youtu\.be|vimeo\.com/i', (string) $url);
}

function prism_upload_ext_ok($ext) {
    static $ok = [
        'pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'txt',
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
        'mp4', 'webm', 'mov', 'ogg', 'ogv', 'zip',
    ];
    return in_array(strtolower((string) $ext), $ok, true);
}

function prism_mime_from_filename($name, $fallback = 'application/octet-stream') {
    $ext = strtolower((string) pathinfo((string) $name, PATHINFO_EXTENSION));
    $map = [
        'pdf' => 'application/pdf',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
        'bmp' => 'image/bmp',
        'txt' => 'text/plain',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'ogg' => 'video/ogg',
        'ogv' => 'video/ogg',
        'mov' => 'video/quicktime',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'zip' => 'application/zip',
    ];
    return $map[$ext] ?? $fallback;
}

function prism_request_is_multipart() {
    $ct = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'multipart/form-data') !== false) {
        return true;
    }
    return !empty($_FILES);
}

function prism_store_binary_upload($id, $suffix, $fileName, $bin, $mime) {
    if ($bin === false || $bin === null || $bin === '') {
        fail('Could not read the uploaded file.', 400);
    }
    if (strlen($bin) > MAX_FILE_SIZE) {
        fail('File too large. Max 15 MB. For longer videos, paste a YouTube or website link instead.', 400);
    }
    $ext = strtolower((string) pathinfo((string) $fileName, PATHINFO_EXTENSION));
    if ($ext === '' || !prism_upload_ext_ok($ext)) {
        fail('That file type is not allowed. Use PDF, PPT, Word, Excel, image, video, text, or ZIP.', 400);
    }
    if (!$mime || $mime === 'application/octet-stream') {
        $mime = prism_mime_from_filename($fileName);
    }
    if (!is_dir(UPLOAD_DIR)) {
        @mkdir(UPLOAD_DIR, 0775, true);
    }
    $safe_name = $id . $suffix . '.' . $ext;
    $upload_path = UPLOAD_DIR . $safe_name;
    if (file_put_contents($upload_path, $bin) === false) {
        fail('Could not save the file on the server.', 500);
    }
    $urlPath = UPLOAD_URL . $safe_name;
    prism_save_upload_blob($urlPath, (string) $fileName, (string) $mime, $bin);
    return [$fileName, $urlPath, $mime];
}

function prism_read_multipart_file($key) {
    if (empty($_FILES[$key]) || !is_array($_FILES[$key])) {
        return null;
    }
    $f = $_FILES[$key];
    $err = $f['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($err === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($err !== UPLOAD_ERR_OK) {
        fail('File upload failed. Try a smaller file or a link instead.', 400);
    }
    if (($f['size'] ?? 0) > MAX_FILE_SIZE) {
        fail('File too large. Max 15 MB. For longer videos, paste a YouTube or website link instead.', 400);
    }
    if (empty($f['tmp_name']) || !is_uploaded_file($f['tmp_name'])) {
        return null;
    }
    $bin = file_get_contents($f['tmp_name']);
    if ($bin === false) {
        fail('Could not read the uploaded file.', 400);
    }
    return [
        'name' => $f['name'] ?? 'file',
        'mime' => $f['type'] ?? 'application/octet-stream',
        'bin'  => $bin,
    ];
}

function prism_read_base64_file($fd) {
    if (!is_array($fd) || empty($fd['base64'])) {
        return null;
    }
    $raw = $fd['base64'];
    if (strpos($raw, ',') !== false) {
        $raw = explode(',', $raw, 2)[1];
    }
    $raw = preg_replace('/\s+/', '', $raw);
    $bin = base64_decode($raw, true);
    if ($bin === false) {
        $bin = base64_decode($raw, false);
    }
    if ($bin === false) {
        fail('Could not read the uploaded file.', 400);
    }
    return [
        'name' => $fd['name'] ?? 'file',
        'mime' => $fd['mime'] ?? 'application/octet-stream',
        'bin'  => $bin,
    ];
}

function prism_material_type_from_ui($rawType, $url, $mime, $fileName) {
    $t = strtolower(trim((string) $rawType));
    if ($t === 'image' || $t === 'video-file') {
        $t = 'file';
    }
    if ($t !== 'file' && $t !== 'link' && $t !== 'video') {
        $t = 'file';
    }
    if ($t === 'link' && $url && prism_is_video_page_url($url)) {
        return 'video';
    }
    if ($t === 'file') {
        $kindMime = strtolower((string) $mime);
        $ext = strtolower((string) pathinfo((string) $fileName, PATHINFO_EXTENSION));
        if (strpos($kindMime, 'video/') === 0 || in_array($ext, ['mp4', 'webm', 'mov', 'ogg', 'ogv'], true)) {
            return 'file';
        }
    }
    return $t;
}

function prism_ensure_material_attachments(PDO $db): bool {
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }
    try {
        $stmt = $db->query('SHOW COLUMNS FROM `materials` LIKE ' . $db->quote('attachments_json'));
        $ready = $stmt && $stmt->rowCount() > 0;
    } catch (PDOException $e) {
        $ready = false;
    }
    if ($ready) {
        return true;
    }
    try {
        $db->exec('ALTER TABLE materials ADD COLUMN attachments_json MEDIUMTEXT NULL');
        $ready = true;
    } catch (PDOException $e) {
        error_log('PRISM materials attachments: ' . $e->getMessage());
        $ready = false;
    }
    return $ready;
}

function prism_read_multipart_files($key) {
    if (empty($_FILES[$key]) || !is_array($_FILES[$key])) {
        return [];
    }
    $f = $_FILES[$key];
    if (!is_array($f['name'] ?? null)) {
        $one = prism_read_multipart_file($key);
        return $one ? [$one] : [];
    }
    $out = [];
    $count = count($f['name']);
    for ($i = 0; $i < $count; $i++) {
        $err = $f['error'][$i] ?? UPLOAD_ERR_NO_FILE;
        if ($err === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($err !== UPLOAD_ERR_OK) {
            fail('File upload failed. Try a smaller file or a link instead.', 400);
        }
        if (($f['size'][$i] ?? 0) > MAX_FILE_SIZE) {
            fail('File too large. Max 15 MB. For longer videos, paste a YouTube or website link instead.', 400);
        }
        if (empty($f['tmp_name'][$i]) || !is_uploaded_file($f['tmp_name'][$i])) {
            continue;
        }
        $bin = file_get_contents($f['tmp_name'][$i]);
        if ($bin === false) {
            fail('Could not read the uploaded file.', 400);
        }
        $out[] = [
            'name' => $f['name'][$i] ?? 'file',
            'mime' => $f['type'][$i] ?? 'application/octet-stream',
            'bin'  => $bin,
        ];
    }
    return $out;
}

function prism_collect_material_urls($b) {
    $candidates = [];
    if (isset($b['urls'])) {
        $raw = $b['urls'];
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : preg_split('/\r\n|\r|\n/', $raw);
        }
        if (is_array($raw)) {
            foreach ($raw as $item) {
                if (is_array($item)) {
                    $item = $item['url'] ?? '';
                }
                $candidates[] = trim((string) $item);
            }
        }
    }
    if (isset($b['url'])) {
        $candidates[] = trim((string) $b['url']);
    }
    $urls = [];
    foreach ($candidates as $cand) {
        if ($cand === '') {
            continue;
        }
        $norm = prism_normalize_http_url($cand);
        if ($norm === '') {
            fail('That link does not look valid. Use http:// or https://', 400);
        }
        if (!in_array($norm, $urls, true)) {
            $urls[] = $norm;
        }
    }
    if (count($urls) > 8) {
        fail('You can attach up to 8 links.', 400);
    }
    return $urls;
}

function prism_delete_material_files($row) {
    $paths = [];
    if (!empty($row['file_path'])) {
        $paths[] = $row['file_path'];
    }
    $raw = $row['attachments_json'] ?? '';
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            foreach ($decoded as $item) {
                if (is_array($item) && !empty($item['path'])) {
                    $paths[] = $item['path'];
                }
            }
        }
    }
    foreach (array_unique($paths) as $path) {
        $disk = str_replace(UPLOAD_URL, UPLOAD_DIR, $path);
        if ($disk && file_exists($disk)) {
            @unlink($disk);
        }
        prism_delete_upload_blob($path);
    }
}

// ══════════════════════════════════════════════════════
//  MATERIALS
// ══════════════════════════════════════════════════════

if ($action === 'get_materials') {
    $class_id = $_GET['class_id'] ?? '';
    prism_assert_class_access($db, $user, $class_id);
    $stuSec = prism_student_section_for_filter($db, $user);
    $hasSec = prism_table_has_column($db, 'materials', 'target_section');
    $hasAttach = prism_ensure_material_attachments($db);
    $sel = $hasSec
        ? 'id, class_id, teacher_id, target_section, title, type, url, file_name, IF(file_path IS NULL OR file_path = \'\', file_data, NULL) AS file_data, file_path, mime_type, description, created_at'
        : 'id, class_id, teacher_id, title, type, url, file_name, IF(file_path IS NULL OR file_path = \'\', file_data, NULL) AS file_data, file_path, mime_type, description, created_at';
    if ($hasAttach) {
        $sel .= ', attachments_json';
    }
    if ($stuSec !== null && $hasSec) {
        $stmt = $db->prepare(
            'SELECT ' . $sel . ' FROM materials WHERE class_id = ? AND (target_section IS NULL OR TRIM(target_section) = \'\' OR TRIM(target_section) = ?) ORDER BY created_at DESC'
        );
        $stmt->execute([$class_id, $stuSec]);
    } else {
        $stmt = $db->prepare('SELECT ' . $sel . ' FROM materials WHERE class_id = ? ORDER BY created_at DESC');
        $stmt->execute([$class_id]);
    }
    ok(['materials' => $stmt->fetchAll()]);
}

if ($action === 'add_material') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    if (prism_request_is_multipart()) {
        $b = [
            'class_id' => $_POST['class_id'] ?? '',
            'title' => $_POST['title'] ?? '',
            'type' => $_POST['type'] ?? 'file',
            'url' => $_POST['url'] ?? '',
            'urls' => $_POST['urls'] ?? '',
            'desc' => $_POST['desc'] ?? '',
            'target_section' => $_POST['target_section'] ?? '',
        ];
    } else {
        $b = getBody();
    }
    prism_assert_teacher_owns_class($db, $user['id'], (string) ($b['class_id'] ?? ''));
    $title = trim((string) ($b['title'] ?? ''));
    if ($title === '') {
        fail('Title is required', 400);
    }
    $id = uniqid('mat_');

    $file_data = null; $file_name = null; $file_path = null; $mime = null;
    $desc = trim((string) ($b['desc'] ?? $b['description'] ?? ''));
    $urls = prism_collect_material_urls($b);
    if (!$urls && $desc !== '') {
        if (preg_match('#https?://[^\s<>"\']+|www\.[^\s<>"\']+#i', $desc, $mUrl)) {
            $found = prism_normalize_http_url($mUrl[0]);
            if ($found !== '') {
                $urls[] = $found;
            }
        }
    }
    $uploads = prism_read_multipart_files('files');
    if (!$uploads) {
        $single = prism_read_multipart_file('file');
        if ($single) {
            $uploads = [$single];
        }
    }
    if (!$uploads) {
        $single = prism_read_base64_file($b['fileData'] ?? $b['file_data'] ?? null);
        if ($single) {
            $uploads = [$single];
        }
    }
    if (count($uploads) > 8) {
        fail('You can attach up to 8 files.', 400);
    }
    if (!$uploads && !$urls && $desc === '') {
        fail('Add a file, a link, or a short note.', 400);
    }
    $hasAttach = prism_ensure_material_attachments($db);
    if (!$hasAttach && (count($uploads) > 1 || count($urls) > 1)) {
        fail('Could not save more than one file or link.', 500);
    }
    $attachments = [];
    foreach ($uploads as $i => $up) {
        $suffix = count($uploads) > 1 || $i > 0 ? ('_' . $i) : '';
        list($storedName, $storedPath, $storedMime) = prism_store_binary_upload($id, $suffix, $up['name'], $up['bin'], $up['mime']);
        if ($file_path === null) {
            $file_name = $storedName;
            $file_path = $storedPath;
            $mime = $storedMime;
        }
        $attachments[] = [
            'kind' => 'file',
            'name' => $storedName,
            'path' => $storedPath,
            'mime' => $storedMime,
        ];
    }
    foreach ($urls as $oneUrl) {
        $attachments[] = ['kind' => 'link', 'url' => $oneUrl];
    }
    $url = $urls[0] ?? '';
    $uiType = strtolower(trim((string) ($b['type'] ?? '')));
    if ($uploads) {
        $uiType = 'file';
    } elseif ($url !== '') {
        $uiType = prism_is_video_page_url($url) ? 'video' : 'link';
    } else {
        $uiType = 'link';
    }
    $type = prism_material_type_from_ui($uiType, $url, $mime, $file_name);
    $attachJson = $hasAttach ? json_encode($attachments) : null;

    $ts = prism_target_section_from_body($b);
    $cols = ['id', 'class_id', 'teacher_id', 'title', 'type', 'url', 'file_name', 'file_data', 'file_path', 'mime_type', 'description'];
    $vals = [$id, $b['class_id'], $user['id'], $title, $type, $url, $file_name, $file_data, $file_path, $mime, $b['desc'] ?? ''];
    if (prism_table_has_column($db, 'materials', 'target_section')) {
        array_splice($cols, 3, 0, ['target_section']);
        array_splice($vals, 3, 0, [$ts]);
    }
    if ($hasAttach) {
        $cols[] = 'attachments_json';
        $vals[] = $attachJson;
    }
    $ph = implode(',', array_fill(0, count($vals), '?'));
    $db->prepare('INSERT INTO materials (' . implode(',', $cols) . ') VALUES (' . $ph . ')')->execute($vals);
    ok(['id' => $id, 'file_path' => $file_path, 'type' => $type, 'attachments' => $attachments]);
}

if ($action === 'delete_material') {
    $b = getBody();
    // Remove file from disk if exists
    $cols = 'file_path';
    if (prism_ensure_material_attachments($db)) {
        $cols .= ', attachments_json';
    }
    $stmt = $db->prepare('SELECT ' . $cols . ' FROM materials WHERE id = ?');
    $stmt->execute([$b['id']]);
    $mat = $stmt->fetch();
    if ($mat) {
        prism_delete_material_files($mat);
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
            'SELECT * FROM assignments WHERE class_id = ? AND (target_section IS NULL OR TRIM(target_section) = \'\' OR TRIM(target_section) = ?) ORDER BY created_at DESC'
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
    if (prism_request_is_multipart()) {
        $b = [
            'class_id' => $_POST['class_id'] ?? '',
            'title' => $_POST['title'] ?? '',
            'type' => $_POST['type'] ?? 'written',
            'instructions' => $_POST['instructions'] ?? '',
            'pts' => $_POST['pts'] ?? 0,
            'due' => $_POST['due'] ?? null,
            'attach_url' => $_POST['attach_url'] ?? '',
            'target_section' => $_POST['target_section'] ?? '',
        ];
    } else {
        $b = getBody();
    }
    prism_assert_teacher_owns_class($db, $user['id'], (string) ($b['class_id'] ?? ''));
    $id = uniqid('asgn_');
    $dueA     = $b['due'] ?? null;
    $dueA     = ($dueA !== null && $dueA !== '') ? $dueA : null;
    $dueTimeA = null;

    $attach_url = prism_normalize_http_url($b['attach_url'] ?? '');
    $attach_url = $attach_url !== '' ? $attach_url : null;
    $afn = null;
    $afp = null;
    $amm = null;
    $hasAssignAttach = prism_table_has_column($db, 'assignments', 'attach_url')
        || prism_table_has_column($db, 'assignments', 'attach_file_path');
    if ($hasAssignAttach) {
        $up = prism_read_multipart_file('file');
        if (!$up) {
            $up = prism_read_base64_file($b['fileData'] ?? $b['file_data'] ?? null);
        }
        if ($up) {
            list($afn, $afp, $amm) = prism_store_binary_upload($id, '_ref', $up['name'], $up['bin'], $up['mime']);
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
        'SELECT s.*, u.name AS student_name, u.section, u.avatar AS student_avatar
         FROM submissions s JOIN users u ON s.student_id = u.id
         WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC'
    );
    $stmt->execute([$asgn_id]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        if (!empty($r['file_path'])) {
            $r['file_data'] = null;
        }
    }
    unset($r);
    ok(['submissions' => $rows]);
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
    if (stripos($ct, 'multipart/form-data') !== false || !empty($_FILES)) {
        $b = [
            'assignment_id' => $_POST['assignment_id'] ?? '',
            'class_id'      => $_POST['class_id'] ?? '',
            'note'          => $_POST['note'] ?? '',
            'link_url'      => $_POST['link_url'] ?? '',
        ];
        foreach (['files', 'file'] as $fk) {
            if (empty($_FILES[$fk])) {
                continue;
            }
            $f = $_FILES[$fk];
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
    if ($link_url !== '') {
        $link_url = prism_normalize_http_url($link_url);
        if ($link_url !== '' && strlen($link_url) > 500) {
            $link_url = substr($link_url, 0, 500);
        }
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
        if (!is_dir(UPLOAD_DIR)) {
            @mkdir(UPLOAD_DIR, 0775, true);
        }
        foreach ($multipartFiles as $up) {
            if (count($attachments) >= $maxFiles) {
                break;
            }
            if (($up['size'] ?? 0) > MAX_FILE_SIZE || empty($up['tmp_name']) || !is_uploaded_file($up['tmp_name'])) {
                fail('File too large. Max 15 MB. For longer videos, paste a YouTube or website link instead.', 400);
            }
            $fn = $up['name'] ?? 'file';
            $ext = strtolower((string) pathinfo($fn, PATHINFO_EXTENSION));
            if ($ext === '' || !prism_upload_ext_ok($ext)) {
                fail('That file type is not allowed. Use PDF, PPT, Word, Excel, image, video, text, or ZIP.', 400);
            }
            $bin = file_get_contents($up['tmp_name']);
            if ($bin === false || strlen($bin) > MAX_FILE_SIZE) {
                fail('Could not read the uploaded file.', 400);
            }
            $mime = prism_mime_from_filename($fn, $up['type'] ?? 'application/octet-stream');
            $safe_name = 'sub_' . $uidSafe . '_' . $asgnSafe . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
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
    prism_assert_teacher_owns_class($db, $user['id'], (string) $class_id);
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
    prism_assert_teacher_owns_class($db, $user['id'], (string) $class_id);
    $stmt = $db->prepare('SELECT DISTINCT session_date FROM records WHERE class_id = ? ORDER BY session_date DESC');
    $stmt->execute([$class_id]);
    ok(['dates' => array_column($stmt->fetchAll(), 'session_date')]);
}

if ($action === 'save_record') {
    requireAuth(['teacher']);
    $b = getBody();
    prism_assert_teacher_owns_class($db, $user['id'], (string) ($b['class_id'] ?? ''));
    $stu = trim((string) ($b['student_id'] ?? ''));
    if ($stu === '') {
        fail('student_id required', 400);
    }
    prism_assert_student_enrolled($db, $stu, (string) $b['class_id']);
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

