<?php
require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/roster_lib.php';

$raw = $argv[1] ?? '';
$job = json_decode($raw, true);
if (!is_array($job)) {
    fwrite(STDERR, "bad job\n");
    exit(2);
}
$hold = (int) ($job['hold'] ?? 0);
if ($hold > 0) {
    putenv('PRISM_ROSTER_LOCK_HOLD=' . $hold);
}
$result = prism_register_from_roster(getDB(), [
    'id_number' => (string) $job['id_number'],
    'email' => (string) $job['email'],
    'code' => (string) $job['code'],
    'password' => (string) $job['password'],
    'confirm_password' => (string) $job['password'],
], (string) ($job['ip'] ?? '203.0.113.50'));
echo json_encode([
    'ok' => !empty($result['ok']),
    'status' => (int) ($result['status'] ?? 0),
    'generic' => (($result['error'] ?? '') === PRISM_ROSTER_GENERIC),
]);
