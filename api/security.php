<?php
require_once 'config.php';
require_once 'security_lib.php';
setHeaders();
startSession();
prism_guard_mutating_request();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string) ($_GET['action'] ?? '');
$user = requireAuth(['admin']);
$db = getDB();
prism_require_admin_perm($db, $user, 'security');
$super = prism_is_superadmin_id((string) $user['id']);

function prism_security_roles_payload(PDO $db): array {
    $roles = [];
    foreach (prism_builtin_roles() as $id => $role) {
        $roles[] = [
            'id' => $id,
            'name' => $role['name'],
            'builtin' => true,
            'fine' => $role['fine'],
        ];
    }
    foreach (prism_custom_roles($db) as $role) {
        $roles[] = $role;
    }
    return $roles;
}

if ($method === 'GET' && $action === 'bootstrap') {
    $admins = [];
    if ($super) {
        prism_ensure_admin_perms($db);
        $stmt = $db->query("SELECT id, name, email, section, admin_perms FROM users WHERE role = 'admin' ORDER BY name, id");
        foreach ($stmt->fetchAll() as $row) {
            $decoded = prism_decode_admin_perms($row['admin_perms'] ?? null);
            $roleId = trim((string) ($decoded['role_id'] ?? ''));
            if ($roleId === '' || !prism_role_template($db, $roleId)) {
                $roleId = prism_role_id_for_type((string) ($row['section'] ?? ''));
                if (!prism_role_template($db, $roleId)) {
                    $roleId = 'custom';
                }
            }
            $fine = prism_admin_permissions($db, (string) $row['id']);
            $admins[] = [
                'id' => (string) $row['id'],
                'name' => (string) ($row['name'] ?? ''),
                'email' => (string) ($row['email'] ?? ''),
                'type' => (string) ($row['section'] ?? ''),
                'superadmin' => prism_is_superadmin_id((string) $row['id']),
                'role_id' => prism_is_superadmin_id((string) $row['id']) ? 'superadmin' : $roleId,
                'role_name' => prism_is_superadmin_id((string) $row['id']) ? 'Super Admin' : prism_role_name($db, $roleId),
                'fine' => $fine,
            ];
        }
    }
    ok([
        'superadmin' => $super,
        'catalog' => prism_fine_catalog(),
        'roles' => prism_security_roles_payload($db),
        'admins' => $admins,
        'policy' => prism_security_policy($db),
    ]);
}

if ($method === 'GET' && $action === 'log') {
    prism_require_fine($db, $user, 'security.logs');
    prism_ensure_security_log($db);
    $rows = $db->query('SELECT actor_id, event, detail, created_at FROM security_logs ORDER BY id DESC LIMIT 80')->fetchAll();
    ok(['rows' => $rows]);
}

if ($method === 'POST' && $action === 'save_access') {
    if (!$super) {
        fail('Only the superadmin can change admin access', 403);
    }
    $b = getBody();
    $target = trim((string) ($b['id'] ?? ''));
    if ($target === '' || prism_is_superadmin_id($target)) {
        fail('That admin access cannot be changed');
    }
    $lookup = $db->prepare("SELECT id, name FROM users WHERE id = ? AND role = 'admin'");
    $lookup->execute([$target]);
    $row = $lookup->fetch();
    if (!$row) {
        fail('Account not found', 404);
    }
    $roleId = trim((string) ($b['role_id'] ?? 'custom'));
    if ($roleId !== 'custom' && !prism_role_template($db, $roleId)) {
        fail('Choose a role');
    }
    $fine = prism_normalize_fine($b['fine'] ?? []);
    $packed = prism_pack_access($db, $roleId, $fine);
    $roleName = prism_role_name($db, (string) $packed['role_id']);
    prism_ensure_admin_perms($db);
    if (isset(prism_admin_types()[$roleName])) {
        $db->prepare('UPDATE users SET admin_perms = ?, section = ? WHERE id = ? AND role = ?')
            ->execute([json_encode($packed), $roleName, $target, 'admin']);
    } else {
        $db->prepare('UPDATE users SET admin_perms = ? WHERE id = ? AND role = ?')
            ->execute([json_encode($packed), $target, 'admin']);
    }
    prism_security_log($db, (string) $user['id'], 'permissions-updated', 'Updated access for ' . $target . ' (' . $roleName . ')');
    ok(['id' => $target, 'role_id' => $packed['role_id'], 'role_name' => $roleName, 'permissions' => prism_admin_permissions($db, $target)]);
}

if ($method === 'POST' && $action === 'save_role') {
    if (!$super) {
        fail('Only the superadmin can change roles', 403);
    }
    $b = getBody();
    $name = trim((string) ($b['name'] ?? ''));
    if ($name === '' || strlen($name) > 80) {
        fail('Enter a role name up to 80 characters');
    }
    if (isset(prism_builtin_roles()[prism_role_id_for_type($name)]) || strcasecmp($name, 'Super Admin') === 0) {
        fail('That name is already used by a built-in role');
    }
    $id = trim((string) ($b['id'] ?? ''));
    if ($id === '') {
        $id = 'role_' . bin2hex(random_bytes(4));
    } elseif (isset(prism_builtin_roles()[$id])) {
        fail('A built-in role cannot be changed');
    }
    prism_ensure_admin_roles($db);
    $fine = prism_normalize_fine($b['fine'] ?? []);
    $db->prepare(
        'INSERT INTO admin_roles (id, name, fine_json) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), fine_json = VALUES(fine_json)'
    )->execute([$id, $name, json_encode($fine)]);
    prism_refresh_role_members($db, $id);
    prism_security_log($db, (string) $user['id'], 'role-saved', 'Saved role ' . $name);
    ok(['id' => $id, 'name' => $name]);
}

if ($method === 'POST' && $action === 'delete_role') {
    if (!$super) {
        fail('Only the superadmin can change roles', 403);
    }
    $id = trim((string) (getBody()['id'] ?? ''));
    if ($id === '' || isset(prism_builtin_roles()[$id])) {
        fail('A built-in role cannot be removed');
    }
    prism_ensure_admin_roles($db);
    $db->prepare('DELETE FROM admin_roles WHERE id = ?')->execute([$id]);
    prism_security_log($db, (string) $user['id'], 'role-deleted', 'Removed role ' . $id);
    ok(['id' => $id]);
}

if ($method === 'POST' && $action === 'save_policy') {
    if (!$super) {
        fail('Only the superadmin can change the sign-in lock', 403);
    }
    prism_require_fine($db, $user, 'security.settings');
    $b = getBody();
    $fails = max(3, min(20, (int) ($b['max_fails'] ?? 5)));
    $minutes = max(5, min(120, (int) ($b['lock_minutes'] ?? 15)));
    prism_ensure_security_log($db);
    $db->prepare('UPDATE security_policy SET max_fails = ?, lock_minutes = ? WHERE id = 1')->execute([$fails, $minutes]);
    prism_security_log($db, (string) $user['id'], 'policy-updated', 'Sign-in lock set to ' . $fails . ' tries and ' . $minutes . ' minutes');
    ok(prism_security_policy($db));
}

fail('Unknown action');
