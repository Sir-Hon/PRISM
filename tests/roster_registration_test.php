<?php
/**
 * CLI checks for admin-created roster accounts.
 * Usage: C:\xampp\php\php.exe tests\roster_registration_test.php
 */
require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/roster_lib.php';

$fail = 0;
function check(bool $cond, string $label): void {
    global $fail;
    if ($cond) {
        echo "PASS {$label}\n";
        return;
    }
    $fail++;
    echo "FAIL {$label}\n";
}

$db = getDB();
prism_ensure_student_roster($db);

$ids = ['9000001', '9000002', '9000007', '9000009'];
$teacherIds = ['t9000001'];
$marks = implode(',', array_fill(0, count($ids), '?'));
$db->prepare("DELETE FROM registration_audit_log WHERE roster_id_number IN ($marks)")->execute($ids);
$db->prepare("UPDATE student_roster SET claimed_by_user_id = NULL WHERE id_number IN ($marks)")->execute($ids);
$db->prepare("UPDATE users SET id_number = NULL WHERE id IN ($marks)")->execute($ids);
$db->prepare("DELETE FROM users WHERE id IN ($marks)")->execute($ids);
$db->prepare("DELETE FROM student_roster WHERE id_number IN ($marks)")->execute($ids);
$db->prepare('DELETE FROM teacher_roster WHERE id = ?')->execute($teacherIds);
$db->prepare('DELETE FROM users WHERE id = ?')->execute($teacherIds);

$pw = 'RosterTest9';
$admin = ['id' => 'admin001', 'role' => 'admin', 'name' => 'Portal Admin'];
$adminRow = $db->prepare('SELECT id FROM users WHERE id = ?');
$adminRow->execute(['admin001']);
if (!$adminRow->fetch()) {
    $db->prepare('INSERT INTO users (id, `password`, role, name, section) VALUES (?,?,?,?,?)')
        ->execute(['admin001', prism_hash_secret($pw), 'admin', 'Portal Admin', 'Admin Office']);
}

$added = prism_roster_add($db, $admin, [
    'id_number' => '9000001',
    'email' => '  Ada.One@ctu.edu.ph  ',
    'first_name' => 'Ada',
    'last_name' => 'Lovelace',
    'college' => 'CoTE',
    'program' => 'BSIT',
    'year' => '1',
    'section' => 'a',
    'password' => $pw,
    'confirm_password' => $pw,
], '203.0.113.10');
check(!empty($added['ok']) && empty($added['registration_code']), 'add creates the account without a registration code');
$user = $db->prepare('SELECT name, section, email, role, `password` FROM users WHERE id = ?');
$user->execute(['9000001']);
$row = $user->fetch();
check($row && $row['name'] === 'Ada Lovelace' && $row['section'] === 'BSIT 1-A' && $row['role'] === 'student', 'student profile uses program, year, and section');
check($row && $row['password'] !== $pw && password_verify($pw, $row['password']), 'password stored as a hash');
$roster = $db->prepare('SELECT college, course, year_level, section_letter, claimed_at, reg_code_hash FROM student_roster WHERE id_number = ?');
$roster->execute(['9000001']);
$rosterRow = $roster->fetch();
check($rosterRow && $rosterRow['college'] === 'CoTE' && $rosterRow['course'] === 'BSIT' && $rosterRow['year_level'] === '1-A' && $rosterRow['section_letter'] === 'A' && !empty($rosterRow['claimed_at']), 'roster stores college, program, year, and section');
check($rosterRow && $rosterRow['reg_code_hash'] !== $pw && !password_verify($pw, $rosterRow['reg_code_hash']), 'password is not stored on the roster row');

$closed = prism_register_from_roster($db, ['id_number' => '9000001', 'password' => $pw], '203.0.113.21');
check(empty($closed['ok']) && (int) $closed['status'] === 403, 'public registration is closed');

$badPlace = prism_roster_add($db, $admin, [
    'id_number' => '9000002',
    'email' => 'ada.two@ctu.edu.ph',
    'first_name' => 'Ada',
    'last_name' => 'Two',
    'college' => 'CoED',
    'program' => 'BSIT',
    'year' => '1',
    'section' => 'A',
    'password' => $pw,
    'confirm_password' => $pw,
], '203.0.113.10');
check(empty($badPlace['ok']) && ($badPlace['error'] ?? '') === 'Choose a program in that college.', 'program must belong to the college');

$listed = prism_roster_list($db, '', '', 1, 20, 'CoTE', 'BSIT', '1', 'A');
$found = false;
foreach ($listed['rows'] as $item) {
    if ($item['id_number'] === '9000001' && $item['college'] === 'CoTE' && $item['program'] === 'BSIT' && $item['year'] === '1' && $item['section'] === 'A') {
        $found = true;
    }
}
check($found, 'list filters by college, program, year, and section');

$csv = "id_number,email,first_name,last_name,college,program,year,section,password\n"
    . "9000007,ada.seven@ctu.edu.ph,Grace,Hopper,CoTE,BSIT,2,B,{$pw}\n"
    . "9000007,ada.dup@ctu.edu.ph,Dup,Id,CoTE,BSIT,2,B,{$pw}\n"
    . "9000008,not-an-email,Bad,Domain,CoTE,BSIT,2,B,{$pw}\n"
    . "9000009,ada.nine@ctu.edu.ph,Ken,Thompson,CoED,BEEd,3,C,short\n";
$parsed = prism_parse_csv_text($csv);
$preview = prism_roster_preview_rows($db, $parsed);
$byLine = [];
$leaked = false;
foreach ($preview['rows'] as $r) {
    $byLine[$r['line']] = $r;
    if (isset($r['password']) || (isset($r['errors']) && strpos(json_encode($r['errors']), $pw) !== false)) {
        $leaked = true;
    }
}
check(!empty($byLine[2]['valid']), 'csv valid row preview');
check(empty($byLine[3]['valid']), 'csv duplicate id in file');
check(empty($byLine[4]['valid']), 'csv bad domain');
check(empty($byLine[5]['valid']), 'csv weak password is rejected');
check(!$leaked, 'csv preview does not include the password');
$imported = prism_roster_import($db, $admin, $parsed, '203.0.113.10');
check(!empty($imported['ok']) && (int) $imported['imported'] === 1, 'csv commits only valid rows');
$importedUser = $db->prepare('SELECT section FROM users WHERE id = ?');
$importedUser->execute(['9000007']);
check($importedUser->fetchColumn() === 'BSIT 2-B', 'imported student gets the categorized section');

$teacher = prism_teacher_add($db, $admin, [
    'id' => 't9000001',
    'email' => 'grace.hopper@ctu.edu.ph',
    'first_name' => 'Grace',
    'last_name' => 'Hopper',
    'college' => 'CoTE',
    'department' => 'Information Technology',
    'subjects' => "Programming\nDatabases",
    'password' => $pw,
    'confirm_password' => $pw,
]);
check(!empty($teacher['ok']), 'teacher account is created');
$teacherRow = $db->prepare('SELECT college, department, subjects FROM teacher_roster WHERE id = ?');
$teacherRow->execute(['t9000001']);
$t = $teacherRow->fetch();
check($t && $t['college'] === 'CoTE' && $t['department'] === 'Information Technology' && $t['subjects'] === 'Programming, Databases', 'teacher roster stores college, department, and subjects');
$teacherUser = $db->prepare('SELECT role, section, `password` FROM users WHERE id = ?');
$teacherUser->execute(['t9000001']);
$tu = $teacherUser->fetch();
check($tu && $tu['role'] === 'teacher' && $tu['section'] === 'Information Technology' && password_verify($pw, $tu['password']), 'teacher login uses the department and a password hash');

$base = 'http://localhost:8765/api/roster.php';
function http_status(string $url, string $method = 'GET', ?string $body = null): int {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Origin: http://localhost:8765']);
    }
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}
check(http_status($base . '?action=list') === 403, 'roster list requires admin');
check(http_status($base . '?action=teacher_list') === 403, 'teacher roster requires admin');
check(http_status($base . '?action=add', 'POST', '{}') === 403, 'roster add requires admin');
check(http_status($base . '?action=teacher_add', 'POST', '{}') === 403, 'teacher add requires admin');
check(http_status('http://localhost:8765/api/auth.php?action=register', 'POST', '{}') === 403, 'student registration endpoint is closed');

$db->prepare("DELETE FROM registration_audit_log WHERE roster_id_number IN ($marks)")->execute($ids);
$db->prepare("UPDATE student_roster SET claimed_by_user_id = NULL WHERE id_number IN ($marks)")->execute($ids);
$db->prepare("UPDATE users SET id_number = NULL WHERE id IN ($marks)")->execute($ids);
$db->prepare("DELETE FROM users WHERE id IN ($marks)")->execute($ids);
$db->prepare("DELETE FROM student_roster WHERE id_number IN ($marks)")->execute($ids);
$db->prepare('DELETE FROM teacher_roster WHERE id = ?')->execute($teacherIds);
$db->prepare('DELETE FROM users WHERE id = ?')->execute($teacherIds);

echo $fail === 0 ? "ALL PASSED\n" : "FAILED {$fail}\n";
exit($fail === 0 ? 0 : 1);
