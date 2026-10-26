<?php
/**
 * CLI checks for roster-verified registration.
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

$ids = [];
for ($n = 9000001; $n <= 9000020; $n++) {
    $ids[] = (string) $n;
}
$marks = implode(',', array_fill(0, count($ids), '?'));
$db->prepare("DELETE FROM registration_audit_log WHERE roster_id_number IN ($marks)")->execute($ids);
$db->prepare("UPDATE student_roster SET claimed_by_user_id = NULL WHERE id_number IN ($marks)")->execute($ids);
$db->prepare("DELETE FROM users WHERE id IN ($marks) OR id = 'rosteradmin'")->execute($ids);
$db->prepare("DELETE FROM student_roster WHERE id_number IN ($marks)")->execute($ids);

$pw = 'RosterTest9';
$admin = ['id' => 'admin001', 'role' => 'admin', 'name' => 'Portal Admin'];
$adminRow = $db->prepare('SELECT id FROM users WHERE id = ?');
$adminRow->execute(['admin001']);
if (!$adminRow->fetch()) {
    $db->prepare('INSERT INTO users (id, `password`, role, name, section) VALUES (?,?,?,?,?)')
        ->execute(['admin001', prism_hash_secret($pw), 'admin', 'Portal Admin', 'Admin Office']);
}

function addStudent(PDO $db, array $admin, string $id, string $email): string {
    $result = prism_roster_add($db, $admin, [
        'id_number' => $id,
        'email' => '  ' . strtoupper($email) . '  ',
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
        'course' => 'BSIT',
        'year_level' => '1-A',
    ], '203.0.113.10');
    if (empty($result['ok'])) {
        throw new RuntimeException($result['error'] ?? 'add failed');
    }
    return $result['registration_code'];
}

$generic = PRISM_ROSTER_GENERIC;
$code1 = addStudent($db, $admin, '9000001', 'ada.one@ctu.edu.ph');
$ok = prism_register_from_roster($db, [
    'id' => ' 9000001 ',
    'email' => ' Ada.One@ctu.edu.ph ',
    'code' => strtolower($code1),
    'password' => $pw,
    'confirm_password' => $pw,
], '203.0.113.21');
check(!empty($ok['ok']), 'successful registration');
$user = $db->prepare('SELECT name, section, email, id_number, `password` FROM users WHERE id = ?');
$user->execute(['9000001']);
$row = $user->fetch();
check($row && $row['name'] === 'Ada Lovelace' && $row['section'] === 'BSIT 1-A', 'profile copied from roster');
check($row && $row['password'] !== $pw && password_verify($pw, $row['password']), 'password stored as a hash');
$hash = $db->prepare('SELECT reg_code_hash, claimed_at FROM student_roster WHERE id_number = ?');
$hash->execute(['9000001']);
$roster = $hash->fetch();
check($roster && $roster['reg_code_hash'] !== $code1 && password_verify($code1, $roster['reg_code_hash']) && !empty($roster['claimed_at']), 'code stored as a hash and claimed');
$audit = $db->prepare('SELECT event_type, ip_address FROM registration_audit_log WHERE roster_id_number = ?');
$audit->execute(['9000001']);
$events = $audit->fetchAll();
$blob = json_encode($events);
check(strpos($blob, $code1) === false && strpos($blob, $pw) === false, 'audit log has no code or password');

$code2 = addStudent($db, $admin, '9000002', 'ada.two@ctu.edu.ph');
$attempts = [
    ['9000099', 'ada.two@ctu.edu.ph', $code2, 'wrong id'],
    ['9000002', 'other.two@ctu.edu.ph', $code2, 'wrong email'],
    ['9000002', 'ada.two@ctu.edu.ph', 'ZZZZZZZZ', 'wrong code'],
];
$seen = [];
foreach ($attempts as $i => $case) {
    $res = prism_register_from_roster($db, [
        'id_number' => $case[0],
        'email' => $case[1],
        'code' => $case[2],
        'password' => $pw,
        'confirm_password' => $pw,
    ], '203.0.113.22');
    $seen[] = ($res['error'] ?? '') . '|' . ($res['status'] ?? 0);
    check(empty($res['ok']) && ($res['error'] ?? '') === $generic && (int) $res['status'] === 400, $case[3] . ' generic error');
}
check(count(array_unique($seen)) === 1, 'wrong id, email, and code share one error');

$code3 = addStudent($db, $admin, '9000003', 'ada.three@ctu.edu.ph');
$db->prepare('UPDATE student_roster SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id_number = ?')->execute(['9000003']);
$expired = prism_register_from_roster($db, [
    'id_number' => '9000003', 'email' => 'ada.three@ctu.edu.ph', 'code' => $code3,
    'password' => $pw, 'confirm_password' => $pw,
], '203.0.113.23');
check(empty($expired['ok']) && ($expired['error'] ?? '') === $generic, 'expired code generic error');
$claimedAgain = prism_register_from_roster($db, [
    'id_number' => '9000001', 'email' => 'ada.one@ctu.edu.ph', 'code' => $code1,
    'password' => $pw, 'confirm_password' => $pw,
], '203.0.113.24');
check(empty($claimedAgain['ok']) && ($claimedAgain['error'] ?? '') === $generic, 'already claimed generic error');

$limitedIp = '203.0.113.77';
$code4 = addStudent($db, $admin, '9000004', 'ada.four@ctu.edu.ph');
$last = null;
for ($i = 0; $i < 5; $i++) {
    $last = prism_register_from_roster($db, [
        'id_number' => '9000004', 'email' => 'ada.four@ctu.edu.ph', 'code' => 'BADCODE1',
        'password' => $pw, 'confirm_password' => $pw,
    ], $limitedIp);
}
check(empty($last['ok']) && (int) ($last['status'] ?? 0) === 400, 'fifth failure is still a generic mismatch');
$blocked = prism_register_from_roster($db, [
    'id_number' => '9000004', 'email' => 'ada.four@ctu.edu.ph', 'code' => $code4,
    'password' => $pw, 'confirm_password' => $pw,
], $limitedIp);
check((int) ($blocked['status'] ?? 0) === 429, 'sixth attempt from the same IP is rate limited');

$code5 = addStudent($db, $admin, '9000005', 'ada.five@ctu.edu.ph');
$idLimited = null;
for ($i = 0; $i < 5; $i++) {
    $idLimited = prism_register_from_roster($db, [
        'id_number' => '9000005', 'email' => 'ada.five@ctu.edu.ph', 'code' => 'BADCODE2',
        'password' => $pw, 'confirm_password' => $pw,
    ], '203.0.113.' . (30 + $i));
}
$blockedId = prism_register_from_roster($db, [
    'id_number' => '9000005', 'email' => 'ada.five@ctu.edu.ph', 'code' => $code5,
    'password' => $pw, 'confirm_password' => $pw,
], '203.0.113.99');
check((int) ($blockedId['status'] ?? 0) === 429, 'sixth attempt for the same ID is rate limited');

$code6 = addStudent($db, $admin, '9000006', 'ada.six@ctu.edu.ph');
$old = $code6;
$regen = prism_roster_regenerate($db, $admin, '9000006', '203.0.113.10');
check(!empty($regen['ok']) && $regen['registration_code'] !== $old, 'regenerate returns a new code');
$oldTry = prism_register_from_roster($db, [
    'id_number' => '9000006', 'email' => 'ada.six@ctu.edu.ph', 'code' => $old,
    'password' => $pw, 'confirm_password' => $pw,
], '203.0.113.40');
check(empty($oldTry['ok']) && ($oldTry['error'] ?? '') === $generic, 'old code is invalid after regenerate');
$newTry = prism_register_from_roster($db, [
    'id_number' => '9000006', 'email' => 'ada.six@ctu.edu.ph', 'code' => $regen['registration_code'],
    'password' => $pw, 'confirm_password' => $pw,
], '203.0.113.41');
check(!empty($newTry['ok']), 'new code registers');

$csv = "id_number,email,first_name,last_name,course,year_level\n"
    . "9000007,ada.seven@ctu.edu.ph,Grace,Hopper,BSIT,2-B\n"
    . "9000007,ada.dup@ctu.edu.ph,Dup,Id,BSIT,2-B\n"
    . "9000008,not-an-email,Bad,Domain,BSIT,2-B\n"
    . "9000008,ada.seven@ctu.edu.ph,Dup,Email,BSIT,2-B\n"
    . "9000009,ada.nine@ctu.edu.ph,Ken,Thompson,BSIT,3-C\n";
$parsed = prism_parse_csv_text($csv);
$preview = prism_roster_preview_rows($db, $parsed);
$byLine = [];
foreach ($preview['rows'] as $r) {
    $byLine[$r['line']] = $r;
}
check(!empty($byLine[2]['valid']), 'csv valid row preview');
check(empty($byLine[3]['valid']), 'csv duplicate id in file');
check(empty($byLine[4]['valid']), 'csv bad domain');
check(empty($byLine[5]['valid']), 'csv duplicate email in file');
$imported = prism_roster_import($db, $admin, $parsed, '203.0.113.10');
check(!empty($imported['ok']) && (int) $imported['imported'] === 2, 'csv commits only valid rows');
$plainHit = false;
foreach ($imported['codes'] as $c) {
    $stored = $db->prepare('SELECT reg_code_hash FROM student_roster WHERE id_number = ?');
    $stored->execute([$c['id_number']]);
    $h = (string) $stored->fetchColumn();
    if ($h === '' || $h === $c['registration_code'] || !password_verify($c['registration_code'], $h)) {
        $plainHit = true;
    }
}
check(!$plainHit && count($imported['codes']) === 2, 'imported codes are hashed');
check(prism_csv_safe('=cmd') === "'=cmd" && prism_csv_safe('Ada') === 'Ada', 'csv export formula guard');

$php = 'C:\\xampp\\php\\php.exe';
$code7 = addStudent($db, $admin, '9000010', 'ada.ten@ctu.edu.ph');
$job = json_encode([
    'id_number' => '9000010',
    'email' => 'ada.ten@ctu.edu.ph',
    'code' => $code7,
    'password' => $pw,
]);
$spec = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
$a = proc_open([$php, __DIR__ . '/roster_lock_worker.php', json_encode(json_decode($job, true) + ['hold' => 2, 'ip' => '203.0.113.60'])], $spec, $pipesA);
$b = proc_open([$php, __DIR__ . '/roster_lock_worker.php', json_encode(json_decode($job, true) + ['hold' => 0, 'ip' => '203.0.113.61'])], $spec, $pipesB);
$outA = stream_get_contents($pipesA[1]);
$outB = stream_get_contents($pipesB[1]);
fclose($pipesA[1]); fclose($pipesA[2]); fclose($pipesB[1]); fclose($pipesB[2]);
proc_close($a);
proc_close($b);
$resA = json_decode($outA, true) ?: [];
$resB = json_decode($outB, true) ?: [];
$wins = (int) !empty($resA['ok']) + (int) !empty($resB['ok']);
check($wins === 1, 'concurrent claim has a single success');
$claimed = $db->prepare('SELECT COUNT(*) FROM users WHERE id = ?');
$claimed->execute(['9000010']);
check((int) $claimed->fetchColumn() === 1, 'concurrent claim creates one user');

$base = 'http://localhost:8765/api/roster.php';
function http_status(string $url, string $method = 'GET', ?string $cookie = null, ?string $body = null): int {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
    }
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
check(http_status($base . '?action=add', 'POST', null, '{}') === 403, 'roster add requires admin');
check(http_status($base . '?action=preview', 'POST') === 403, 'roster preview requires admin');
check(http_status($base . '?action=import', 'POST') === 403, 'roster import requires admin');
check(http_status($base . '?action=regenerate', 'POST', null, '{}') === 403, 'roster regenerate requires admin');
check(http_status($base . '?action=revoke', 'POST', null, '{}') === 403, 'roster revoke requires admin');
check(http_status($base . '?action=delete', 'POST', null, '{}') === 403, 'roster delete requires admin');

$ids[] = '9000099';
$marks = implode(',', array_fill(0, count($ids), '?'));
$db->prepare("DELETE FROM registration_audit_log WHERE roster_id_number IN ($marks)")->execute($ids);
$db->prepare("UPDATE student_roster SET claimed_by_user_id = NULL WHERE id_number IN ($marks)")->execute($ids);
$db->prepare('DELETE FROM users WHERE id IN (' . $marks . ')')->execute($ids);
$db->prepare('DELETE FROM student_roster WHERE id_number IN (' . $marks . ')')->execute($ids);

echo $fail === 0 ? "ALL PASSED\n" : "FAILED {$fail}\n";
exit($fail === 0 ? 0 : 1);
