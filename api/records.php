<?php
// Learner record sheets (teacher) and certificates of registration (admin → student).
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();
if (($user['role'] ?? '') === 'admin') {
    prism_require_admin_perm($db, $user, 'cor');
}

function prism_records_schema_flag(): string {
    return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'prism-records-schema-v2-' . substr(hash('sha256', DB_HOST . '|' . DB_NAME), 0, 16) . '.ok';
}

function prism_sheet_tables($db, $force = false) {
    static $done = false;
    if ($done && !$force) {
        return;
    }
    $flag = prism_records_schema_flag();
    if (!$force && is_file($flag)) {
        $done = true;
        return;
    }
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    // An older table can use a different collation than users.id. The list joins those
    // columns, and MySQL then aborts the whole request.
    try {
        $db->exec('ALTER TABLE student_cors CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    } catch (PDOException $e) {
        error_log('student_cors charset: ' . $e->getMessage());
    }
    @file_put_contents(prism_records_schema_flag(), '1');
    $done = true;
}

function prism_decode_sheet($raw) {
    if ($raw === null || $raw === '') return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function prism_passing_rate(): float {
    return 75.0;
}

function prism_grade_label($n): string {
    $n = round((float) $n, 1);
    if (abs($n - round($n)) < 0.05) return (string) (int) round($n);
    return rtrim(rtrim(number_format($n, 1, '.', ''), '0'), '.');
}

function prism_sheet_sum($scores): ?float {
    if (!is_array($scores)) return null;
    $n = 0.0;
    $any = false;
    foreach ($scores as $value) {
        if ($value === '' || $value === null || !is_numeric($value)) continue;
        $n += (float) $value;
        $any = true;
    }
    return $any ? $n : null;
}

function prism_sheet_paired($scores, $outs): ?array {
    if (!is_array($scores)) return null;
    $earned = 0.0;
    $possible = 0.0;
    $any = false;
    foreach ($scores as $i => $value) {
        if ($value === '' || $value === null || !is_numeric($value)) continue;
        $cap = is_array($outs) && array_key_exists($i, $outs) ? $outs[$i] : null;
        if (!is_numeric($cap) || (float) $cap <= 0) continue;
        $earned += (float) $value;
        $possible += (float) $cap;
        $any = true;
    }
    return $any ? ['earned' => $earned, 'possible' => $possible] : null;
}

function prism_sheet_part($scores, $hps, $outs): ?float {
    $paired = prism_sheet_paired($scores, $outs);
    if ($paired) return ($paired['earned'] / $paired['possible']) * 100;
    $total = prism_sheet_sum($scores);
    $h = is_numeric($hps) ? (float) $hps : 0;
    if ($total === null || $h <= 0) return null;
    return ($total / $h) * 100;
}

function prism_sheet_missing($value): bool {
    return strtoupper(trim((string) $value)) === 'M';
}

function prism_sheet_exam($q): ?float {
    if (!is_array($q) || !array_key_exists('exam', $q) || $q['exam'] === '' || $q['exam'] === null) return null;
    if (prism_sheet_missing($q['exam']) || !is_numeric($q['exam'])) return null;
    $hps = isset($q['examHps']) && is_numeric($q['examHps']) ? (float) $q['examHps'] : 0;
    if ($hps <= 0) return null;
    return ((float) $q['exam'] / $hps) * 100;
}

function prism_sheet_tables($saved): array {
    $tables = [];
    if (is_array($saved) && isset($saved['tables']) && is_array($saved['tables']) && $saved['tables']) {
        foreach ($saved['tables'] as $i => $table) {
            if (!is_array($table)) continue;
            $part = preg_replace('/[^a-z0-9_]/i', '', (string) ($table['part'] ?? ('t' . $i))) ?? '';
            $part = substr($part, 0, 24);
            if ($part === '') $part = 't' . $i;
            $title = (string) ($table['title'] ?? 'Table');
            $weight = isset($table['weight']) ? preg_replace('/[^0-9.]/', '', (string) $table['weight']) : '';
            $name = strtolower($title);
            if (($part === 'qz' || $part === 'rec' || $name === 'quizzes' || strpos($name, 'recitation') === 0) && $weight === '25') {
                $weight = '';
            }
            $tables[] = ['part' => $part, 'title' => $title, 'weight' => $weight];
        }
    }
    if ($tables) return $tables;
    return [
        ['part' => 'ww', 'title' => 'Written Works', 'weight' => ''],
        ['part' => 'pt', 'title' => 'Performance Task', 'weight' => ''],
        ['part' => 'qz', 'title' => 'Quizzes', 'weight' => ''],
        ['part' => 'rec', 'title' => 'Recitation', 'weight' => ''],
    ];
}

function prism_sheet_quarter($q, array $tables, $examWeight): ?float {
    if (!is_array($q)) return null;
    $scored = [];
    $anyWeight = false;
    foreach ($tables as $table) {
        $weight = is_numeric($table['weight'] ?? null) ? (float) $table['weight'] : 0;
        if ($weight > 0) $anyWeight = true;
        $part = $table['part'];
        $pct = prism_sheet_part($q[$part] ?? null, $q[$part . 'Hps'] ?? null, $q[$part . 'Out'] ?? null);
        if ($pct === null || !is_finite($pct) || $weight <= 0) continue;
        $scored[] = ['pct' => $pct, 'weight' => $weight];
    }
    $examShare = is_numeric($examWeight) ? (float) $examWeight : 0;
    if ($examShare > 0) $anyWeight = true;
    $examPercent = prism_sheet_exam($q);
    if ($examPercent !== null && $examShare > 0) $scored[] = ['pct' => $examPercent, 'weight' => $examShare];
    if (!$anyWeight) {
        $plain = [];
        foreach ($tables as $table) {
            $part = $table['part'];
            $pct = prism_sheet_part($q[$part] ?? null, $q[$part . 'Hps'] ?? null, $q[$part . 'Out'] ?? null);
            if ($pct !== null && is_finite($pct)) $plain[] = $pct;
        }
        if ($examPercent !== null) $plain[] = $examPercent;
        if (!$plain) return null;
        return array_sum($plain) / count($plain);
    }
    if (!$scored) return null;
    $weightSum = 0.0;
    $weighted = 0.0;
    foreach ($scored as $row) {
        $weightSum += $row['weight'];
        $weighted += $row['pct'] * $row['weight'];
    }
    return $weightSum > 0 ? $weighted / $weightSum : null;
}

function prism_quarter_name(int $i): string {
    $names = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    return $names[$i] ?? (($i + 1) . 'th');
}

function prism_push_grade_alert(array &$alerts, string $id, string $subject, string $text, string $pill = 'Below 75%'): void {
    if (count($alerts) >= 12) return;
    $alerts[] = [
        'id' => $id,
        'subject' => $subject,
        'text' => $text,
        'pill' => $pill,
        'href' => 'status.html',
    ];
}

function prism_percent_to_point(float $pct): float {
    // CTU scale: 100% is 1.00, 75% is 3.00, and 50% or lower is 5.00.
    if ($pct >= 100) return 1.0;
    if ($pct <= 50) return 5.0;
    return round(1 + (100 - $pct) * 0.08, 2);
}

function prism_subject_grade_alerts(PDO $db, string $studentId): array {
    $alerts = [];
    $pass = prism_passing_rate();
    try {
        $stmt = $db->prepare(
            'SELECT s.class_id, s.payload, c.subject
             FROM learner_sheets s
             JOIN classes c ON c.id = s.class_id
             WHERE s.student_id = ? AND s.kind = ?'
        );
        $stmt->execute([$studentId, 'assessment']);
        $rows = $stmt->fetchAll();
    } catch (PDOException $e) {
        error_log('grade alert sheets: ' . $e->getMessage());
        $rows = [];
    }
    $graded = [];
    $scores = [];
    foreach ($rows as $row) {
        $saved = prism_decode_sheet($row['payload'] ?? null);
        if (!$saved) continue;
        $subject = trim((string) ($row['subject'] ?? ''));
        if ($subject === '') $subject = trim((string) ($saved['subject'] ?? 'Subject'));
        if ($subject === '') $subject = 'Subject';
        $tables = prism_sheet_tables($saved);
        $examWeight = $saved['examWeight'] ?? '';
        $quarters = isset($saved['quarters']) && is_array($saved['quarters']) ? array_slice($saved['quarters'], 0, 8) : [];
        $finals = [];
        foreach ($quarters as $quarter) {
            $pct = prism_sheet_quarter($quarter, $tables, $examWeight);
            if ($pct === null || !is_finite($pct)) continue;
            $finals[] = $pct;
        }
        if (!$finals) continue;
        $units = isset($saved['units']) && is_numeric($saved['units']) ? (float) $saved['units'] : 0.0;
        $graded[] = [
            'final' => array_sum($finals) / count($finals),
            'units' => $units > 0 ? $units : 0.0,
        ];
        $classId = (string) ($row['class_id'] ?? '');
        foreach ($quarters as $qi => $quarter) {
            if (!is_array($quarter)) continue;
            foreach ($tables as $table) {
                $part = (string) ($table['part'] ?? '');
                if ($part === '') continue;
                $scores = $quarter[$part] ?? null;
                $outs = $quarter[$part . 'Out'] ?? null;
                if (!is_array($scores)) continue;
                foreach ($scores as $i => $value) {
                    if ($value === '' || $value === null || prism_sheet_missing($value) || !is_numeric($value)) continue;
                    $cap = is_array($outs) && array_key_exists($i, $outs) ? $outs[$i] : null;
                    if (!is_numeric($cap) || (float) $cap <= 0) continue;
                    $pct = ((float) $value / (float) $cap) * 100;
                    if ($pct >= $pass) continue;
                    $title = trim((string) ($table['title'] ?? 'Score')) ?: 'Score';
                    prism_push_grade_alert(
                        $scores,
                        'score:' . $classId . ':' . $qi . ':' . $part . ':' . $i,
                        $subject,
                        'You received ' . prism_grade_label($value) . ' out of ' . prism_grade_label($cap) . ' (' . prism_grade_label($pct) . '%) on ' . $title . ' in ' . $subject . '. That is below 75%.'
                    );
                }
            }
            $examPct = prism_sheet_exam($quarter);
            if ($examPct !== null && $examPct < $pass) {
                prism_push_grade_alert(
                    $scores,
                    'exam:' . $classId . ':' . $qi,
                    $subject,
                    'You received ' . prism_grade_label($quarter['exam']) . ' out of ' . prism_grade_label($quarter['examHps']) . ' (' . prism_grade_label($examPct) . '%) on the ' . prism_quarter_name((int) $qi) . ' exam in ' . $subject . '. That is below 75%.'
                );
            }
        }
    }
    if ($graded) {
        $knownUnits = 0;
        foreach ($graded as $row) {
            if ($row['units'] > 0) $knownUnits++;
        }
        $useUnits = $knownUnits === count($graded);
        $weightSum = 0.0;
        $weighted = 0.0;
        foreach ($graded as $row) {
            $weight = $useUnits ? $row['units'] : 1.0;
            $weightSum += $weight;
            $weighted += prism_percent_to_point($row['final']) * $weight;
        }
        if ($weightSum > 0) {
            $gwa = round($weighted / $weightSum, 2);
            if ($gwa > 3) {
                prism_push_grade_alert(
                    $alerts,
                    'gwa',
                    'Overall GWA',
                    'Your overall GWA is ' . number_format($gwa, 2) . '. That is above 3.00.',
                    'Above 3.00'
                );
            }
        }
    }
    return ['gwa' => $alerts, 'scores' => $scores];
}

function prism_scored_work_alerts(PDO $db, string $studentId, array $alerts): array {
    $pass = prism_passing_rate();
    try {
        $stmt = $db->prepare(
            'SELECT q.id, q.title, q.total_points, qs.score, c.subject
             FROM quiz_scores qs
             JOIN quizzes q ON q.id = qs.quiz_id
             JOIN classes c ON c.id = q.class_id
             WHERE qs.student_id = ?'
        );
        $stmt->execute([$studentId]);
        foreach ($stmt->fetchAll() as $row) {
            $max = (int) ($row['total_points'] ?? 0);
            $score = (int) ($row['score'] ?? 0);
            if ($max <= 0) continue;
            $pct = ($score / $max) * 100;
            if ($pct >= $pass) continue;
            $subject = trim((string) ($row['subject'] ?? 'Subject')) ?: 'Subject';
            $title = trim((string) ($row['title'] ?? 'Quiz')) ?: 'Quiz';
            prism_push_grade_alert(
                $alerts,
                'quiz:' . (string) $row['id'],
                $subject,
                'You received ' . $score . ' out of ' . $max . ' (' . prism_grade_label($pct) . '%) on ' . $title . ' in ' . $subject . '. That is below 75%.'
            );
        }
    } catch (PDOException $e) {
        error_log('grade alert quizzes: ' . $e->getMessage());
    }
    try {
        if (!prism_table_has_column($db, 'submissions', 'score')) return $alerts;
        $stmt = $db->prepare(
            'SELECT a.id, a.title, a.points, s.score, c.subject
             FROM submissions s
             JOIN assignments a ON a.id = s.assignment_id
             JOIN classes c ON c.id = a.class_id
             WHERE s.student_id = ? AND s.score IS NOT NULL'
        );
        $stmt->execute([$studentId]);
        foreach ($stmt->fetchAll() as $row) {
            $max = (int) ($row['points'] ?? 0);
            if ($max <= 0 || !is_numeric($row['score'])) continue;
            $score = (int) $row['score'];
            $pct = ($score / $max) * 100;
            if ($pct >= $pass) continue;
            $subject = trim((string) ($row['subject'] ?? 'Subject')) ?: 'Subject';
            $title = trim((string) ($row['title'] ?? 'Assignment')) ?: 'Assignment';
            prism_push_grade_alert(
                $alerts,
                'work:' . (string) $row['id'],
                $subject,
                'You received ' . $score . ' out of ' . $max . ' (' . prism_grade_label($pct) . '%) on ' . $title . ' in ' . $subject . '. That is below 75%.'
            );
        }
    } catch (PDOException $e) {
        error_log('grade alert work: ' . $e->getMessage());
    }
    return $alerts;
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
    // Students can still open the subject list if sheet storage is not ready yet.
    if (!($method === 'GET' && ($action === 'my_status' || $action === 'grade_alerts'))) {
        fail('Could not prepare records storage', 500);
    }
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
    // Same class list the student home already loads. Sheets are attached afterwards
    // so a records-table problem does not hide every subject.
    $stmt = $db->prepare(
        'SELECT c.id, c.subject, c.code, c.color, u.name AS teacher_name
         FROM enrollments e
         JOIN classes c ON e.class_id = c.id
         JOIN users u ON c.teacher_id = u.id
         WHERE e.student_id = ?
         ORDER BY c.subject ASC, c.code ASC'
    );
    $stmt->execute([$user['id']]);
    $records = [];
    foreach ($stmt->fetchAll() as $row) {
        $cover = isset($row['cover']) ? (string) $row['cover'] : '';
        if (!preg_match('#^data:image/(jpeg|png|webp);base64,#', $cover)) $cover = '';
        $records[$row['id']] = [
            'class_id' => $row['id'],
            'subject' => $row['subject'],
            'code' => $row['code'],
            'color' => $row['color'],
            'cover' => $cover,
            'teacher_name' => $row['teacher_name'],
            'attendance' => null,
            'assessment' => null,
            'attendance_updated' => null,
            'assessment_updated' => null,
        ];
    }
    try {
        $sheets = $db->prepare(
            'SELECT class_id, kind, payload, updated_at
             FROM learner_sheets
             WHERE student_id = ?'
        );
        $sheets->execute([$user['id']]);
        foreach ($sheets->fetchAll() as $sheet) {
            $classId = $sheet['class_id'];
            if (!isset($records[$classId])) continue;
            $decoded = prism_decode_sheet($sheet['payload'] ?? null);
            if ($sheet['kind'] === 'attendance') {
                $records[$classId]['attendance'] = $decoded;
                $records[$classId]['attendance_updated'] = $sheet['updated_at'] ?? null;
            } elseif ($sheet['kind'] === 'assessment') {
                $records[$classId]['assessment'] = $decoded;
                $records[$classId]['assessment_updated'] = $sheet['updated_at'] ?? null;
            }
        }
    } catch (PDOException $e) {
        error_log('my_status sheets: ' . $e->getMessage());
    }
    ok(['records' => array_values($records)]);
}

if ($method === 'GET' && $action === 'grade_alerts') {
    if (($user['role'] ?? '') !== 'student') ok(['alerts' => []]);
    $pack = prism_subject_grade_alerts($db, (string) $user['id']);
    $alerts = prism_scored_work_alerts($db, (string) $user['id'], $pack['gwa']);
    foreach ($pack['scores'] as $score) {
        if (count($alerts) >= 12) break;
        $alerts[] = $score;
    }
    ok(['alerts' => $alerts]);
}

if ($method === 'GET' && $action === 'cors') {
    if ($user['role'] !== 'student' && $user['role'] !== 'admin') fail('Forbidden', 403);
    $schoolYear = trim((string) ($_GET['school_year'] ?? ''));
    $semester = trim((string) ($_GET['semester'] ?? ''));
    $q = trim((string) ($_GET['q'] ?? ''));
    if ($schoolYear !== '' && !preg_match('/^\d{4}-\d{4}$/', $schoolYear)) fail('Enter a school year like 2026-2027');
    if ($semester !== '' && !in_array($semester, $semesters, true)) fail('Choose a semester');
    if (strlen($q) > 80) $q = substr($q, 0, 80);

    $where = ' WHERE 1=1';
    $params = [];
    if ($user['role'] === 'student') {
        $where .= ' AND c.student_id = ?';
        $params[] = $user['id'];
    }
    if ($schoolYear !== '') {
        $where .= ' AND c.school_year = ?';
        $params[] = $schoolYear;
    }
    if ($semester !== '') {
        $where .= ' AND c.semester = ?';
        $params[] = $semester;
    }
    if ($user['role'] === 'admin' && $q !== '') {
        $where .= " AND (u.name LIKE ? ESCAPE '\\\\' OR c.student_id LIKE ? ESCAPE '\\\\' OR IFNULL(u.email, '') LIKE ? ESCAPE '\\\\')";
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
    }

    $yearSql = 'SELECT DISTINCT school_year FROM student_cors';
    $yearParams = [];
    if ($user['role'] === 'student') {
        $yearSql .= ' WHERE student_id = ?';
        $yearParams[] = $user['id'];
    }
    $yearSql .= ' ORDER BY school_year DESC';

    $sql = 'SELECT c.id, c.student_id, c.school_year, c.semester, c.label, c.sent_at, u.name AS student_name,
                   JSON_UNQUOTE(JSON_EXTRACT(c.payload, \'$.program\')) AS program,
                   JSON_UNQUOTE(JSON_EXTRACT(c.payload, \'$.block\')) AS block
            FROM student_cors c
            JOIN users u ON u.id COLLATE utf8mb4_unicode_ci = c.student_id COLLATE utf8mb4_unicode_ci'
        . $where
        . ' ORDER BY c.school_year DESC, c.sent_at DESC, u.name ASC
            LIMIT 1000';
    try {
        try {
            $yearStmt = $db->prepare($yearSql);
            $yearStmt->execute($yearParams);
        } catch (PDOException $e) {
            if (stripos($e->getMessage(), 'student_cors') === false) throw $e;
            prism_sheet_tables($db, true);
            $yearStmt = $db->prepare($yearSql);
            $yearStmt->execute($yearParams);
        }
        $years = [];
        foreach ($yearStmt->fetchAll() as $yearRow) {
            $years[] = $yearRow['school_year'];
        }
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $cors = $stmt->fetchAll();
    } catch (PDOException $e) {
        error_log('PRISM cors: ' . $e->getMessage());
        fail('Certificates could not be loaded. Please try again.', 500);
    }
    ok(['cors' => $cors, 'years' => $years, 'capped' => count($cors) >= 1000]);
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

function prism_cor_official_name(string $name): string {
    $raw = trim((string) (preg_replace('/\s+/', ' ', $name) ?? ''));
    if ($raw === '') return '';
    if (strpos($raw, ',') !== false) return strtoupper($raw);
    $parts = explode(' ', $raw);
    if (count($parts) < 2) return strtoupper($raw);
    $last = array_pop($parts);
    return strtoupper($last . ', ' . implode(' ', $parts));
}

if ($method === 'POST' && $action === 'send_cor') {
    if ($user['role'] !== 'admin') fail('Forbidden', 403);
    require_once __DIR__ . '/security_lib.php';
    prism_require_fine($db, $user, 'cor.send');
    $b = getBody();
    $ids = [];
    if (is_array($b['student_ids'] ?? null)) {
        foreach ($b['student_ids'] as $rawId) {
            $rawId = trim((string) $rawId);
            if ($rawId !== '' && !in_array($rawId, $ids, true)) $ids[] = $rawId;
        }
    }
    if (!$ids) {
        $single = trim((string) ($b['student_id'] ?? ''));
        if ($single !== '') $ids[] = $single;
    }
    if (!$ids) fail('Choose who should receive this certificate');
    if (count($ids) > 80) fail('Send to 80 students at a time. Narrow the section and send again.');
    $schoolYear = trim($b['school_year'] ?? '');
    $semester = trim($b['semester'] ?? '');
    if (!preg_match('/^\d{4}-\d{4}$/', $schoolYear)) fail('Enter a school year like 2026-2027');
    if (!in_array($semester, $semesters, true)) fail('Choose a semester');
    $stu = $db->prepare('SELECT id, name, role FROM users WHERE id = ?');
    $students = [];
    foreach ($ids as $studentId) {
        $stu->execute([$studentId]);
        $student = $stu->fetch();
        if (!$student || $student['role'] !== 'student') fail('One of those students is not on the roster');
        $students[] = $student;
    }
    $customName = count($students) === 1 ? prism_clean_text($b['student_name'] ?? '', 120) : '';

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
    $shared = [
        'program' => prism_clean_text($b['program'] ?? '', 80),
        'block' => prism_clean_text($b['block'] ?? '', 80),
        'registrar' => prism_clean_text($b['registrar'] ?? '', 120),
        'issuedOn' => prism_clean_text($b['issued_on'] ?? '', 40),
        'schoolYear' => $schoolYear,
        'semester' => $semester,
        'subjects' => $subjects,
        'fees' => $fees,
    ];
    $stmt = $db->prepare(
        'INSERT INTO student_cors (student_id, school_year, semester, label, payload, sent_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), payload = VALUES(payload), sent_by = VALUES(sent_by), sent_at = CURRENT_TIMESTAMP'
    );
    $db->beginTransaction();
    try {
        foreach ($students as $student) {
            $payload = $shared;
            $payload['studentId'] = $student['id'];
            $payload['studentName'] = $customName !== '' ? $customName : prism_cor_official_name((string) $student['name']);
            if ($payload['studentName'] === '') $payload['studentName'] = $student['name'];
            $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
            if ($json === false) throw new RuntimeException('encode');
            $stmt->execute([$student['id'], $schoolYear, $semester, $label, $json, $user['id']]);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log('PRISM send cor: ' . $e->getMessage());
        fail('Could not save the certificate');
    }
    ok(['count' => count($students), 'label' => $label]);
}

if ($method === 'POST' && $action === 'delete_cor') {
    if ($user['role'] !== 'admin') fail('Forbidden', 403);
    require_once __DIR__ . '/security_lib.php';
    prism_require_fine($db, $user, 'cor.send');
    $b = getBody();
    $id = (int) ($b['id'] ?? 0);
    if ($id <= 0) fail('Missing certificate');
    $stmt = $db->prepare('DELETE FROM student_cors WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() < 1) fail('Certificate not found', 404);
    ok(['deleted' => $id]);
}

fail('Unknown action', 404);
