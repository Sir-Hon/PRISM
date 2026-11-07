<?php
/**
 * Admin access rules. Accounts themselves stay on the roster.
 * A saved admin_perms JSON may include role_id, overrides, and the
 * coarse keys the rest of the portal already checks.
 */

function prism_fine_catalog(): array {
    return [
        'students.view' => ['group' => 'Students', 'label' => 'View students', 'gate' => 'users'],
        'students.create' => ['group' => 'Students', 'label' => 'Create students', 'gate' => 'roster'],
        'students.edit' => ['group' => 'Students', 'label' => 'Edit students', 'gate' => 'roster'],
        'students.delete' => ['group' => 'Students', 'label' => 'Delete students', 'gate' => 'users'],
        'teachers.view' => ['group' => 'Teachers', 'label' => 'View teachers', 'gate' => 'users'],
        'teachers.create' => ['group' => 'Teachers', 'label' => 'Create teachers', 'gate' => 'roster'],
        'teachers.edit' => ['group' => 'Teachers', 'label' => 'Edit teachers', 'gate' => 'roster'],
        'teachers.delete' => ['group' => 'Teachers', 'label' => 'Delete teachers', 'gate' => 'users'],
        'announcements.view' => ['group' => 'Announcements', 'label' => 'View announcements', 'gate' => 'announcements'],
        'announcements.create' => ['group' => 'Announcements', 'label' => 'Post announcements', 'gate' => 'announcements'],
        'cor.view' => ['group' => 'Records', 'label' => 'View certificates of registration', 'gate' => 'cor'],
        'cor.send' => ['group' => 'Records', 'label' => 'Send certificates of registration', 'gate' => 'cor'],
        'calendar.view' => ['group' => 'Calendar', 'label' => 'View the calendar', 'gate' => 'calendar'],
        'calendar.edit' => ['group' => 'Calendar', 'label' => 'Add and change events', 'gate' => 'calendar'],
        'security.view' => ['group' => 'Security', 'label' => 'Open security', 'gate' => 'security'],
        'security.logs' => ['group' => 'Security', 'label' => 'View the security log', 'gate' => 'security'],
        'security.settings' => ['group' => 'Security', 'label' => 'Change the passphrase and sign-in lock', 'gate' => 'security'],
    ];
}

function prism_empty_fine(bool $on = false): array {
    $out = [];
    foreach (array_keys(prism_fine_catalog()) as $key) {
        $out[$key] = $on;
    }
    return $out;
}

function prism_builtin_roles(): array {
    $all = prism_empty_fine(true);
    $none = prism_empty_fine(false);
    $academic = $none;
    $academic['students.view'] = true;
    $academic['teachers.view'] = true;
    $academic['announcements.view'] = true;
    $academic['announcements.create'] = true;
    $academic['calendar.view'] = true;
    $academic['calendar.edit'] = true;
    $records = $none;
    foreach (['students.view', 'students.create', 'students.edit', 'students.delete', 'teachers.view', 'teachers.create', 'teachers.edit', 'teachers.delete', 'cor.view', 'cor.send'] as $key) {
        $records[$key] = true;
    }
    $support = $none;
    foreach (['students.view', 'students.edit', 'teachers.view', 'teachers.edit'] as $key) {
        $support[$key] = true;
    }
    $security = $none;
    foreach (['security.view', 'security.logs', 'security.settings'] as $key) {
        $security[$key] = true;
    }
    $users = $none;
    $users['students.view'] = true;
    $users['teachers.view'] = true;
    $roster = $none;
    foreach (['students.view', 'students.create', 'students.edit', 'students.delete', 'teachers.view', 'teachers.create', 'teachers.edit', 'teachers.delete'] as $key) {
        $roster[$key] = true;
    }
    $cor = $none;
    $cor['cor.view'] = true;
    $cor['cor.send'] = true;
    $calendar = $none;
    $calendar['calendar.view'] = true;
    $calendar['calendar.edit'] = true;
    $announcements = $none;
    $announcements['announcements.view'] = true;
    $announcements['announcements.create'] = true;
    return [
        'administrator' => ['name' => 'Administrator', 'builtin' => true, 'fine' => $all],
        'academic' => ['name' => 'Academic Admin', 'builtin' => true, 'fine' => $academic],
        'records' => ['name' => 'Records Admin', 'builtin' => true, 'fine' => $records],
        'support' => ['name' => 'Support Admin', 'builtin' => true, 'fine' => $support],
        'security' => ['name' => 'Security', 'builtin' => true, 'fine' => $security],
        'users' => ['name' => 'User management', 'builtin' => true, 'fine' => $users],
        'roster' => ['name' => 'Roster', 'builtin' => true, 'fine' => $roster],
        'cor' => ['name' => 'COR', 'builtin' => true, 'fine' => $cor],
        'calendar' => ['name' => 'Calendar', 'builtin' => true, 'fine' => $calendar],
        'announcements' => ['name' => 'Announcements', 'builtin' => true, 'fine' => $announcements],
    ];
}

function prism_role_id_for_type(string $type): string {
    $map = [
        'Administrator' => 'administrator',
        'Academic Admin' => 'academic',
        'Records Admin' => 'records',
        'Support Admin' => 'support',
        'Security' => 'security',
        'User management' => 'users',
        'Roster' => 'roster',
        'COR' => 'cor',
        'Calendar' => 'calendar',
        'Announcements' => 'announcements',
    ];
    return $map[$type] ?? 'custom';
}

function prism_normalize_fine($incoming): array {
    $incoming = is_array($incoming) ? $incoming : [];
    $out = prism_empty_fine(false);
    foreach ($out as $key => $on) {
        $out[$key] = !empty($incoming[$key]);
    }
    return $out;
}

function prism_fine_from_coarse(array $coarse): array {
    $out = prism_empty_fine(false);
    foreach (prism_fine_catalog() as $key => $meta) {
        $gate = $meta['gate'];
        $out[$key] = !empty($coarse[$gate]);
    }
    return $out;
}

function prism_coarse_from_fine(array $fine): array {
    $coarse = array_fill_keys(array_keys(prism_admin_catalog()), false);
    $coarse['dashboard'] = true;
    foreach (prism_fine_catalog() as $key => $meta) {
        if (!empty($fine[$key])) {
            $coarse[$meta['gate']] = true;
        }
    }
    return $coarse;
}

function prism_ensure_admin_roles(PDO $db): void {
    static $done = false;
    if ($done) {
        return;
    }
    $db->exec(
        'CREATE TABLE IF NOT EXISTS admin_roles (
            id VARCHAR(40) PRIMARY KEY,
            name VARCHAR(80) NOT NULL,
            fine_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $done = true;
}

function prism_ensure_security_log(PDO $db): void {
    static $done = false;
    if ($done) {
        return;
    }
    $db->exec(
        'CREATE TABLE IF NOT EXISTS security_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            actor_id VARCHAR(50) NULL,
            event VARCHAR(40) NOT NULL,
            detail VARCHAR(500) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_security_logs_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS security_policy (
            id TINYINT PRIMARY KEY,
            max_fails INT NOT NULL DEFAULT 5,
            lock_minutes INT NOT NULL DEFAULT 15
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS login_locks (
            account_key VARCHAR(120) PRIMARY KEY,
            fails INT NOT NULL DEFAULT 0,
            locked_until DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $db->exec('INSERT IGNORE INTO security_policy (id, max_fails, lock_minutes) VALUES (1, 5, 15)');
    $done = true;
}

function prism_custom_roles(PDO $db): array {
    prism_ensure_admin_roles($db);
    $rows = [];
    foreach ($db->query('SELECT id, name, fine_json FROM admin_roles ORDER BY name')->fetchAll() as $row) {
        $rows[] = [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'builtin' => false,
            'fine' => prism_normalize_fine(json_decode((string) $row['fine_json'], true)),
        ];
    }
    return $rows;
}

function prism_role_template(PDO $db, string $roleId): ?array {
    $builtin = prism_builtin_roles();
    if (isset($builtin[$roleId])) {
        return $builtin[$roleId]['fine'];
    }
    if ($roleId === '' || $roleId === 'custom') {
        return null;
    }
    prism_ensure_admin_roles($db);
    $stmt = $db->prepare('SELECT fine_json FROM admin_roles WHERE id = ?');
    $stmt->execute([$roleId]);
    $raw = $stmt->fetchColumn();
    if ($raw === false || $raw === null) {
        return null;
    }
    return prism_normalize_fine(json_decode((string) $raw, true));
}

function prism_role_name(PDO $db, string $roleId): string {
    $builtin = prism_builtin_roles();
    if (isset($builtin[$roleId])) {
        return $builtin[$roleId]['name'];
    }
    if ($roleId === '' || $roleId === 'custom') {
        return 'Custom';
    }
    prism_ensure_admin_roles($db);
    $stmt = $db->prepare('SELECT name FROM admin_roles WHERE id = ?');
    $stmt->execute([$roleId]);
    $name = $stmt->fetchColumn();
    return $name ? (string) $name : 'Custom';
}

function prism_effective_fine(PDO $db, array $decoded): array {
    $roleId = trim((string) ($decoded['role_id'] ?? ''));
    $template = $roleId !== '' ? prism_role_template($db, $roleId) : null;
    if ($template) {
        $fine = $template;
        $overrides = is_array($decoded['overrides'] ?? null) ? $decoded['overrides'] : [];
        foreach ($fine as $key => $on) {
            if (array_key_exists($key, $overrides)) {
                $fine[$key] = !empty($overrides[$key]);
            }
        }
        return $fine;
    }
    if (is_array($decoded['fine'] ?? null)) {
        return prism_normalize_fine($decoded['fine']);
    }
    return prism_fine_from_coarse($decoded);
}

function prism_access_overrides(array $template, array $fine): array {
    $overrides = [];
    foreach ($fine as $key => $on) {
        $base = !empty($template[$key]);
        if ((bool) $on !== $base) {
            $overrides[$key] = (bool) $on;
        }
    }
    return $overrides;
}

function prism_pack_access(PDO $db, string $roleId, array $fine): array {
    $template = prism_role_template($db, $roleId);
    $fine = prism_normalize_fine($fine);
    $packed = prism_coarse_from_fine($fine);
    $packed['dashboard'] = true;
    if ($template) {
        $packed['role_id'] = $roleId;
        $packed['overrides'] = prism_access_overrides($template, $fine);
    } else {
        $packed['role_id'] = 'custom';
        $packed['fine'] = $fine;
    }
    return $packed;
}

function prism_decode_admin_perms($raw): array {
    if (is_array($raw)) {
        return $raw;
    }
    if (!is_string($raw) || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function prism_require_fine(PDO $db, array $user, string $key): void {
    if (($user['role'] ?? '') !== 'admin') {
        fail('Forbidden', 403);
    }
    if (prism_is_superadmin_id((string) ($user['id'] ?? ''))) {
        return;
    }
    if (!isset(prism_fine_catalog()[$key])) {
        fail('You do not have access to that feature', 403);
    }
    $perms = prism_admin_permissions($db, (string) $user['id']);
    if (empty($perms[$key])) {
        fail('You do not have access to that feature', 403);
    }
}

function prism_security_log(PDO $db, string $actorId, string $event, string $detail): void {
    try {
        prism_ensure_security_log($db);
        $event = substr(preg_replace('/[^a-z0-9_-]/i', '', $event) ?? '', 0, 40);
        if ($event === '') {
            $event = 'event';
        }
        $detail = substr(trim($detail), 0, 500);
        $db->prepare('INSERT INTO security_logs (actor_id, event, detail) VALUES (?,?,?)')
            ->execute([$actorId !== '' ? $actorId : null, $event, $detail]);
    } catch (Throwable $e) {
        error_log('PRISM security log: ' . $e->getMessage());
    }
}

function prism_security_policy(PDO $db): array {
    prism_ensure_security_log($db);
    $row = $db->query('SELECT max_fails, lock_minutes FROM security_policy WHERE id = 1')->fetch();
    $fails = (int) ($row['max_fails'] ?? 5);
    $minutes = (int) ($row['lock_minutes'] ?? 15);
    return [
        'max_fails' => max(3, min(20, $fails ?: 5)),
        'lock_minutes' => max(5, min(120, $minutes ?: 15)),
    ];
}

function prism_login_account_key(string $role, string $id): string {
    return strtolower($role . ':' . trim($id));
}

function prism_login_locked_message(PDO $db, string $role, string $id): ?string {
    if ($role === 'admin' && prism_is_superadmin_id($id)) {
        return null;
    }
    try {
        prism_ensure_security_log($db);
        $stmt = $db->prepare('SELECT locked_until FROM login_locks WHERE account_key = ?');
        $stmt->execute([prism_login_account_key($role, $id)]);
        $until = $stmt->fetchColumn();
        if (!$until) {
            return null;
        }
        $left = strtotime((string) $until) - time();
        if ($left <= 0) {
            return null;
        }
        $mins = max(1, (int) ceil($left / 60));
        return 'This account is locked. Try again in ' . $mins . ' minute' . ($mins === 1 ? '' : 's') . '.';
    } catch (Throwable $e) {
        error_log('PRISM login lock: ' . $e->getMessage());
        return null;
    }
}

function prism_login_note_failure(PDO $db, string $role, string $id): void {
    if ($role === 'admin' && prism_is_superadmin_id($id)) {
        return;
    }
    try {
        $policy = prism_security_policy($db);
        $key = prism_login_account_key($role, $id);
        $stmt = $db->prepare('SELECT fails, locked_until FROM login_locks WHERE account_key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        $fails = (int) ($row['fails'] ?? 0) + 1;
        $until = null;
        if ($fails >= $policy['max_fails']) {
            $until = date('Y-m-d H:i:s', time() + ($policy['lock_minutes'] * 60));
            $fails = 0;
        }
        $db->prepare(
            'INSERT INTO login_locks (account_key, fails, locked_until) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE fails = VALUES(fails), locked_until = VALUES(locked_until)'
        )->execute([$key, $fails, $until]);
        prism_security_log($db, $id, $until ? 'locked' : 'sign-in-failed', $role . ' sign-in failed');
    } catch (Throwable $e) {
        error_log('PRISM login failure: ' . $e->getMessage());
    }
}

function prism_login_note_success(PDO $db, string $role, string $id): void {
    try {
        prism_ensure_security_log($db);
        $db->prepare('DELETE FROM login_locks WHERE account_key = ?')->execute([prism_login_account_key($role, $id)]);
        if ($role === 'admin') {
            prism_security_log($db, $id, 'sign-in', 'Admin signed in');
        }
    } catch (Throwable $e) {
        error_log('PRISM login success: ' . $e->getMessage());
    }
}

function prism_refresh_role_members(PDO $db, string $roleId): void {
    prism_ensure_admin_perms($db);
    $stmt = $db->prepare("SELECT id, admin_perms FROM users WHERE role = 'admin'");
    $stmt->execute();
    $update = $db->prepare('UPDATE users SET admin_perms = ? WHERE id = ?');
    foreach ($stmt->fetchAll() as $row) {
        $decoded = prism_decode_admin_perms($row['admin_perms'] ?? null);
        if ((string) ($decoded['role_id'] ?? '') !== $roleId) {
            continue;
        }
        $fine = prism_effective_fine($db, $decoded);
        $update->execute([json_encode(prism_pack_access($db, $roleId, $fine)), $row['id']]);
    }
}
