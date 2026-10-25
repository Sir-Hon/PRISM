<?php
// Learner record sheets (teacher) and certificates of registration (admin → student).
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();

function prism_sheet_tables($db) {
    $db->exec(
        'CREATE TABLE IF NOT EXISTS learner_sheets (
            class_id VARCHAR(50) NOT NULL,
            student_id VARCHAR(50) NOT NULL,
            kind VARCHAR(20) NOT NULL,
            payload MEDIUMTEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (class_id, student_id, kind)
        )'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS student_cors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(50) NOT NULL,
            school_year VARCHAR(20) NOT NULL,
            semester VARCHAR(40) NOT NULL,
            label VARCHAR(80) NOT NULL,
            payload MEDIUMTEXT NOT NULL,
            sent_by VARCHAR(50) NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_student_term (student_id, school_year, semester)
        )'
    );
}

function prism_decode_sheet($raw) {
    if ($raw === null || $raw === '') return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function prism_clean_text($value, $max) {
    $text = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', (string) $value));
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $max);
    }
    return substr($text, 0, $max);
}

try {
    prism_sheet_tables($db);
} catch (PDOException $e) {
    error_log('records tables: ' . $e->getMessage());
    fail('Could not prepare records storage', 500);
}

$feeKeys = ['tuition', 'athletics', 'computer', 'cultural', 'development', 'guidance', 'laboratory', 'library', 'medical', 'registration'];
$semesters = ['1st Semester', '2nd Semester', 'Summer'];

if ($method === 'GET' && $action === 'sheet') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $classId = trim($_GET['class_id'] ?? '');
    $studentId = trim($_GET['student_id'] ?? '');
    $kind = trim($_GET['kind'] ?? '');
    if ($classId === '' || $studentId === '' || !in_array($kind, ['attendance', 'assessment'], true)) {
        fail('Missing sheet');
    }
    $own = $db->prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?');
    $own->execute([$classId, $user['id']]);
    if (!$own->fetch()) fail('Class not found', 404);
    $en = $db->prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?');
    $en->execute([$classId, $studentId]);
    if (!$en->fetch()) fail('That student is not in this class', 404);
    $stmt = $db->prepare('SELECT payload FROM learner_sheets WHERE class_id = ? AND student_id = ? AND kind = ?');
    $stmt->execute([$classId, $studentId, $kind]);
    $row = $stmt->fetch();
    $sheet = null;
    if ($row) {
        $decoded = json_decode($row['payload'], true);
        if (is_array($decoded)) $sheet = $decoded;
    }
    ok(['sheet' => $sheet]);
}

if ($method === 'POST' && $action === 'save_sheet') {
    if ($user['role'] !== 'teacher') fail('Forbidden', 403);
    $b = getBody();
    $classId = trim($b['class_id'] ?? '');
    $studentId = trim($b['student_id'] ?? '');
    $kind = trim($b['kind'] ?? '');
    $payload = $b['payload'] ?? null;
    if ($classId === '' || $studentId === '' || !in_array($kind, ['attendance', 'assessment'], true)) {
        fail('Missing sheet');
    }
    if (!is_array($payload)) fail('Invalid sheet');
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > 400000) fail('Sheet is too large');
    $own = $db->prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?');
    $own->execute([$classId, $user['id']]);
    if (!$own->fetch()) fail('Class not found', 404);
    $en = $db->prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?');
    $en->execute([$classId, $studentId]);
    if (!$en->fetch()) fail('That student is not in this class', 404);
    $stmt = $db->prepare(
        'INSERT INTO learner_sheets (class_id, student_id, kind, payload)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP'
    );
    $stmt->execute([$classId, $studentId, $kind, $json]);
    ok(['saved' => true]);
}

if ($method === 'GET' && $action === 'my_status') {
    if ($user['role'] !== 'student') fail('Forbidden', 403);
    $stmt = $db->prepare(
        'SELECT c.id AS class_id, c.subject, c.code, c.color, u.name AS teacher_name,
                a.payload AS attendance_payload, a.updated_at AS attendance_updated,
                s.payload AS assessment_payload, s.updated_at AS assessment_updated
         FROM enrollments e
         JOIN classes c ON e.class_id = c.id
         JOIN users u ON c.teacher_id = u.id
         LEFT JOIN learner_sheets a ON a.class_id = c.id AND a.student_id = e.student_id AND a.kind = \'attendance\'
         LEFT JOIN learner_sheets s ON s.class_id = c.id AND s.student_id = e.student_id AND s.kind = \'assessment\'
         WHERE e.student_id = ?
         ORDER BY c.subject ASC, c.code ASC'
    );
    $stmt->execute([$user['id']]);
    $records = [];
    foreach ($stmt->fetchAll() as $row) {
        $records[] = [
            'class_id' => $row['class_id'],
            'subject' => $row['subject'],
            'code' => $row['code'],
            'color' => $row['color'],
            'teacher_name' => $row['teacher_name'],
            'attendance' => prism_decode_sheet($row['attendance_payload']),
            'assessment' => prism_decode_sheet($row['assessment_payload']),
            'attendance_updated' => $row['attendance_updated'],
            'assessment_updated' => $row['assessment_updated'],
        ];
    }
    ok(['records' => $records]);
}

if ($method === 'GET' && $action === 'cors') {
    if ($user['role'] === 'student') {
        $stmt = $db->prepare(
            'SELECT id, school_year, semester, label, sent_at
             FROM student_cors WHERE student_id = ?
             ORDER BY school_year DESC, semester ASC'
        );
        $stmt->execute([$user['id']]);
        ok(['cors' => $stmt->fetchAll()]);
    }
    if ($user['role'] === 'admin') {
        $stmt = $db->query(
            'SELECT c.id, c.student_id, c.school_year, c.semester, c.label, c.sent_at, u.name AS student_name
             FROM student_cors c
             JOIN users u ON u.id = c.student_id
             ORDER BY c.sent_at DESC
             LIMIT 40'
        );
        ok(['cors' => $stmt->fetchAll()]);
    }
    fail('Forbidden', 403);
}

if ($method === 'GET' && $action === 'cor') {
    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) fail('Missing certificate');
    $stmt = $db->prepare(
        'SELECT id, student_id, school_year, semester, label, payload, sent_at
         FROM student_cors WHERE id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) fail('Certificate not found', 404);
    if ($user['role'] === 'student' && $row['student_id'] !== $user['id']) fail('Forbidden', 403);
    if ($user['role'] !== 'student' && $user['role'] !== 'admin') fail('Forbidden', 403);
    $decoded = json_decode($row['payload'], true);
    if (!is_array($decoded)) fail('Certificate could not be read', 500);
    ok([
        'cor' => [
            'id' => (int) $row['id'],
            'student_id' => $row['student_id'],
            'school_year' => $row['school_year'],
            'semester' => $row['semester'],
            'label' => $row['label'],
            'sent_at' => $row['sent_at'],
            'payload' => $decoded,
        ],
    ]);
}

if ($method === 'POST' && $action === 'send_cor') {
    if ($user['role'] !== 'admin') fail('Forbidden', 403);
    $b = getBody();
    $studentId = trim($b['student_id'] ?? '');
    $schoolYear = trim($b['school_year'] ?? '');
    $semester = trim($b['semester'] ?? '');
    if (!preg_match('/^\d{4}-\d{4}$/', $schoolYear)) fail('Enter a school year like 2026-2027');
    if (!in_array($semester, $semesters, true)) fail('Choose a semester');
    $stu = $db->prepare('SELECT id, name, role FROM users WHERE id = ?');
    $stu->execute([$studentId]);
    $student = $stu->fetch();
    if (!$student || $student['role'] !== 'student') fail('Choose a student');

    $subjects = [];
    foreach (($b['subjects'] ?? []) as $row) {
        if (!is_array($row)) continue;
        $item = [
            'section' => prism_clean_text($row['section'] ?? '', 40),
            'code' => prism_clean_text($row['code'] ?? '', 40),
            'description' => prism_clean_text($row['description'] ?? '', 140),
            'units' => prism_clean_text($row['units'] ?? '', 10),
            'time' => prism_clean_text($row['time'] ?? '', 40),
            'day' => prism_clean_text($row['day'] ?? '', 20),
            'room' => prism_clean_text($row['room'] ?? '', 40),
        ];
        if ($item['description'] === '' && $item['code'] === '') continue;
        $subjects[] = $item;
        if (count($subjects) >= 24) break;
    }
    if (!$subjects) fail('Add at least one subject');

    $rawFees = is_array($b['fees'] ?? null) ? $b['fees'] : [];
    $fees = [];
    foreach ($feeKeys as $key) {
        $n = isset($rawFees[$key]) ? (float) $rawFees[$key] : 0;
        if ($n < 0) $n = 0;
        if ($n > 1000000) $n = 1000000;
        $fees[$key] = round($n, 2);
    }

    $label = 'AY ' . $schoolYear . ' (' . $semester . ')';
    $payload = [
        'studentId' => $student['id'],
        'studentName' => prism_clean_text($b['student_name'] ?? $student['name'], 120),
        'program' => prism_clean_text($b['program'] ?? '', 80),
        'block' => prism_clean_text($b['block'] ?? '', 80),
        'registrar' => prism_clean_text($b['registrar'] ?? '', 120),
        'issuedOn' => prism_clean_text($b['issued_on'] ?? '', 40),
        'schoolYear' => $schoolYear,
        'semester' => $semester,
        'subjects' => $subjects,
        'fees' => $fees,
    ];
    if ($payload['studentName'] === '') $payload['studentName'] = $student['name'];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($json === false) fail('Could not save the certificate');

    $stmt = $db->prepare(
        'INSERT INTO student_cors (student_id, school_year, semester, label, payload, sent_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), payload = VALUES(payload), sent_by = VALUES(sent_by), sent_at = CURRENT_TIMESTAMP'
    );
    $stmt->execute([$studentId, $schoolYear, $semester, $label, $json, $user['id']]);
    $idStmt = $db->prepare('SELECT id FROM student_cors WHERE student_id = ? AND school_year = ? AND semester = ?');
    $idStmt->execute([$studentId, $schoolYear, $semester]);
    $saved = $idStmt->fetch();
    ok(['id' => (int) ($saved['id'] ?? 0), 'label' => $label]);
}

fail('Unknown action', 404);
