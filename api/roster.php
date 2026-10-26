<?php
require_once 'config.php';
require_once 'roster_lib.php';
setHeaders();
startSession();
prism_guard_mutating_request();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string) ($_GET['action'] ?? '');
$admin = prism_current_admin();
if (!$admin) {
    fail('Forbidden', 403);
}

$db = getDB();
$ip = prism_client_ip();

if ($method === 'GET' && $action === 'catalog') {
    ok([
        'colleges' => prism_ctu_programs_by_college(),
        'years' => ['1', '2', '3', '4'],
        'sections' => ['A', 'B', 'C', 'D', 'E', 'F'],
    ]);
}

if ($method === 'GET' && $action === 'list') {
    $q = trim((string) ($_GET['q'] ?? ''));
    $status = strtolower(trim((string) ($_GET['status'] ?? '')));
    $page = (int) ($_GET['page'] ?? 1);
    ok(prism_roster_list(
        $db,
        $q,
        $status,
        $page,
        20,
        (string) ($_GET['college'] ?? ''),
        (string) ($_GET['program'] ?? ''),
        (string) ($_GET['year'] ?? ''),
        (string) ($_GET['section'] ?? '')
    ));
}

if ($method === 'GET' && $action === 'teacher_list') {
    ok(prism_teacher_list(
        $db,
        trim((string) ($_GET['q'] ?? '')),
        (string) ($_GET['college'] ?? ''),
        (int) ($_GET['page'] ?? 1),
        20
    ));
}

if ($method === 'POST' && $action === 'teacher_add') {
    $result = prism_teacher_add($db, $admin, getBody());
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok($result);
}

if ($method === 'POST' && $action === 'teacher_update') {
    $result = prism_teacher_update($db, getBody());
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok($result);
}

if ($method === 'POST' && $action === 'teacher_delete') {
    $result = prism_teacher_delete($db, (string) (getBody()['id'] ?? ''));
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok($result);
}

if ($method === 'POST' && $action === 'add') {
    $result = prism_roster_add($db, $admin, getBody(), $ip);
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok($result);
}

if ($method === 'POST' && $action === 'update') {
    $result = prism_roster_update($db, $admin, getBody(), $ip);
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok($result);
}

if ($method === 'POST' && $action === 'preview') {
    $upload = prism_read_csv_upload($_FILES);
    if (empty($upload['ok'])) {
        fail($upload['error'], 400);
    }
    $parsed = prism_parse_csv_text($upload['text']);
    $preview = prism_roster_preview_rows($db, $parsed);
    if (empty($preview['ok'])) {
        fail($preview['error'], 400);
    }
    ok($preview);
}

if ($method === 'POST' && $action === 'import') {
    $upload = prism_read_csv_upload($_FILES);
    if (empty($upload['ok'])) {
        fail($upload['error'], 400);
    }
    $parsed = prism_parse_csv_text($upload['text']);
    $result = prism_roster_import($db, $admin, $parsed, $ip);
    if (empty($result['ok'])) {
        fail($result['error'] ?? 'Import failed', (int) ($result['status'] ?? 400));
    }
    ok($result);
}

if ($method === 'POST' && $action === 'regenerate') {
    $result = prism_roster_regenerate($db, $admin, (string) (getBody()['id_number'] ?? ''), $ip);
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok($result);
}

if ($method === 'POST' && $action === 'revoke') {
    $result = prism_roster_revoke($db, $admin, (string) (getBody()['id_number'] ?? ''), $ip);
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok($result);
}

if ($method === 'POST' && $action === 'delete') {
    $result = prism_roster_delete($db, $admin, (string) (getBody()['id_number'] ?? ''), $ip);
    if (empty($result['ok'])) {
        fail($result['error'], (int) ($result['status'] ?? 400));
    }
    ok($result);
}

fail('Unknown action');
