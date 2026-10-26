<?php
/**
 * Roster-verified student registration.
 * Codes and passwords are hashed with password_hash() and never returned after creation.
 */

const PRISM_ROSTER_GENERIC = "Your details don't match our records. Please check them or contact the registrar/admin.";
const PRISM_ROSTER_DUMMY_HASH = '$2y$10$iwPAcwDzEtBI0rLqVBFTseA21Y1TwSeO45jllqFD3XHTSlS1IQDgK';

function prism_roster_code_days(): int {
    $n = (int) (getenv('PRISM_ROSTER_CODE_DAYS') ?: 14);
    if ($n < 1) {
        $n = 14;
    }
    if ($n > 365) {
        $n = 365;
    }
    return $n;
}

function prism_email_verify_enabled(): bool {
    $v = strtolower(trim((string) (getenv('PRISM_EMAIL_VERIFY') ?: '0')));
    return $v === '1' || $v === 'true' || $v === 'yes';
}

function prism_reg_code_alphabet(): string {
    return 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
}

function prism_generate_reg_code(): string {
    $alpha = prism_reg_code_alphabet();
    $max = strlen($alpha) - 1;
    $out = '';
    for ($i = 0; $i < 8; $i++) {
        $out .= $alpha[random_int(0, $max)];
    }
    return $out;
}

function prism_roster_expires_at(): string {
    return date('Y-m-d H:i:s', time() + (prism_roster_code_days() * 86400));
}

function prism_hash_secret(string $plain): string {
    return password_hash($plain, PASSWORD_DEFAULT);
}

function prism_dummy_code_hash(): string {
    return PRISM_ROSTER_DUMMY_HASH;
}

function prism_password_format_error(string $pw, string $confirm): ?string {
    if (strlen($pw) < 8) {
        return 'Password must be at least 8 characters.';
    }
    if (!preg_match('/[A-Za-z]/', $pw) || !preg_match('/[0-9]/', $pw)) {
        return 'Password must include a letter and a number.';
    }
    if ($pw !== $confirm) {
        return 'Passwords do not match.';
    }
    return null;
}

function prism_roster_status(array $row): string {
    if (!empty($row['revoked_at'])) {
        return 'revoked';
    }
    if (!empty($row['claimed_at'])) {
        return 'claimed';
    }
    $exp = strtotime((string) ($row['expires_at'] ?? ''));
    if ($exp !== false && $exp <= time()) {
        return 'expired';
    }
    return 'unclaimed';
}

function prism_csv_safe($value): string {
    $s = (string) $value;
    if ($s !== '' && preg_match('/^[=+\-@\t\r]/', $s)) {
        return "'" . $s;
    }
    return $s;
}

function prism_ensure_student_roster(PDO $db): void {
    static $done = false;
    if ($done) {
        return;
    }
    $db->exec(
        'CREATE TABLE IF NOT EXISTS student_roster (
            id_number VARCHAR(20) PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            first_name VARCHAR(80) NOT NULL,
            last_name VARCHAR(80) NOT NULL,
            course VARCHAR(80) NOT NULL,
            year_level VARCHAR(20) NOT NULL,
            reg_code_hash VARCHAR(255) NOT NULL,
            expires_at DATETIME NOT NULL,
            claimed_at DATETIME DEFAULT NULL,
            claimed_by_user_id VARCHAR(50) DEFAULT NULL,
            created_by_admin_id VARCHAR(50) DEFAULT NULL,
            revoked_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_roster_email (email),
            KEY idx_roster_claimed (claimed_at),
            KEY idx_roster_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS registration_audit_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_id VARCHAR(50) DEFAULT NULL,
            roster_id_number VARCHAR(20) NOT NULL,
            event_type VARCHAR(40) NOT NULL,
            ip_address VARCHAR(45) DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_audit_roster (roster_id_number),
            KEY idx_audit_event (event_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS email_verifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_verify_user (user_id),
            KEY idx_verify_hash (token_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    prism_ensure_user_column($db, 'id_number', 'VARCHAR(20) NULL DEFAULT NULL');
    prism_ensure_user_column($db, 'email_verified_at', 'DATETIME NULL DEFAULT NULL');
    try {
        $db->exec('ALTER TABLE users MODIFY email VARCHAR(255) NULL DEFAULT NULL');
    } catch (PDOException $e) {
        error_log('PRISM users.email widen: ' . $e->getMessage());
    }
    try {
        $db->exec("UPDATE users SET email = NULL WHERE email = ''");
    } catch (PDOException $e) {
        error_log('PRISM users.email blank: ' . $e->getMessage());
    }
    prism_ensure_index($db, 'users', 'uq_users_id_number', 'UNIQUE KEY uq_users_id_number (id_number)');
    prism_ensure_index($db, 'users', 'uq_users_email', 'UNIQUE KEY uq_users_email (email)');
    prism_ensure_fk($db, 'users', 'fk_users_roster_id', 'FOREIGN KEY (id_number) REFERENCES student_roster(id_number)');
    prism_ensure_fk($db, 'student_roster', 'fk_roster_claimed_by', 'FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL');
    prism_ensure_fk($db, 'student_roster', 'fk_roster_created_by', 'FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE SET NULL');
    $done = true;
}

function prism_ensure_user_column(PDO $db, string $column, string $definition): void {
    if (!preg_match('/^[a-z_]+$/', $column)) {
        return;
    }
    try {
        $stmt = $db->query('SHOW COLUMNS FROM users LIKE ' . $db->quote($column));
        if ($stmt && $stmt->fetch()) {
            return;
        }
        $db->exec('ALTER TABLE users ADD COLUMN `' . $column . '` ' . $definition);
    } catch (PDOException $e) {
        error_log('PRISM users column ' . $column . ': ' . $e->getMessage());
    }
}

function prism_ensure_index(PDO $db, string $table, string $name, string $definition): void {
    if (!preg_match('/^[a-z_]+$/', $table) || !preg_match('/^[a-z0-9_]+$/', $name)) {
        return;
    }
    try {
        $stmt = $db->prepare('SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?');
        $stmt->execute([$table, $name]);
        if ($stmt->fetch()) {
            return;
        }
        $db->exec('ALTER TABLE `' . $table . '` ADD ' . $definition);
    } catch (PDOException $e) {
        error_log('PRISM index ' . $name . ': ' . $e->getMessage());
    }
}

function prism_ensure_fk(PDO $db, string $table, string $name, string $definition): void {
    if (!preg_match('/^[a-z_]+$/', $table) || !preg_match('/^[a-z0-9_]+$/', $name)) {
        return;
    }
    try {
        $stmt = $db->prepare('SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?');
        $stmt->execute([$table, $name]);
        if ($stmt->fetch()) {
            return;
        }
        $db->exec('ALTER TABLE `' . $table . '` ADD CONSTRAINT `' . $name . '` ' . $definition);
    } catch (PDOException $e) {
        error_log('PRISM fk ' . $name . ': ' . $e->getMessage());
    }
}

function prism_roster_audit(PDO $db, ?string $adminId, string $idNumber, string $event, string $ip): void {
    $allowed = ['roster_created', 'code_regenerated', 'roster_revoked', 'registration_success', 'registration_failed'];
    if (!in_array($event, $allowed, true)) {
        return;
    }
    $db->prepare('INSERT INTO registration_audit_log (admin_id, roster_id_number, event_type, ip_address) VALUES (?,?,?,?)')
        ->execute([$adminId !== '' ? $adminId : null, substr($idNumber, 0, 20), $event, substr($ip, 0, 45)]);
}

function prism_normalize_roster_input(array $b): array {
    return [
        'id_number' => trim((string) ($b['id_number'] ?? $b['id'] ?? '')),
        'email' => prism_normalize_ctu_email($b['email'] ?? ''),
        'code' => strtoupper(trim((string) ($b['code'] ?? $b['registration_code'] ?? ''))),
        'password' => (string) ($b['password'] ?? ''),
        'confirm' => (string) ($b['confirm_password'] ?? $b['password2'] ?? ''),
        'first_name' => trim((string) ($b['first_name'] ?? '')),
        'last_name' => trim((string) ($b['last_name'] ?? '')),
        'course' => trim((string) ($b['course'] ?? '')),
        'year_level' => trim((string) ($b['year_level'] ?? '')),
    ];
}

function prism_roster_field_errors(array $row, bool $forStudent = false): array {
    $errors = [];
    if (!prism_is_ctu_student_id($row['id_number'] ?? '')) {
        $errors[] = 'ID number must be exactly 7 digits.';
    }
    if (!prism_is_ctu_email($row['email'] ?? '')) {
        $errors[] = 'Email must be a CTU address ending in @ctu.edu.ph.';
    }
    if (!$forStudent) {
        if (($row['first_name'] ?? '') === '') {
            $errors[] = 'First name is required.';
        }
        if (($row['last_name'] ?? '') === '') {
            $errors[] = 'Last name is required.';
        }
        if (($row['course'] ?? '') === '') {
            $errors[] = 'Course is required.';
        }
        if (($row['year_level'] ?? '') === '') {
            $errors[] = 'Year level is required.';
        }
    }
    return $errors;
}

function prism_register_format_error(array $in): ?string {
    if (!prism_is_ctu_student_id($in['id_number'])) {
        return 'Student ID must be exactly 7 digits.';
    }
    if (!prism_is_ctu_email($in['email'])) {
        return 'Email must be a CTU address ending in @ctu.edu.ph.';
    }
    return prism_password_format_error($in['password'], $in['confirm']);
}

function prism_registration_limited(string $idNumber, string $ip): bool {
    return prism_rate_limit_blocked('reg_ip', $ip, 5, 900)
        || prism_rate_limit_blocked('reg_id', $idNumber, 5, 900);
}

function prism_registration_record_failure(string $idNumber, string $ip): void {
    prism_rate_limit_record('reg_ip', $ip, 900);
    if ($idNumber !== '') {
        prism_rate_limit_record('reg_id', $idNumber, 900);
    }
}

function prism_register_from_roster(PDO $db, array $body, string $ip): array {
    prism_ensure_student_roster($db);
    $in = prism_normalize_roster_input($body);
    $format = prism_register_format_error($in);
    if ($format !== null) {
        return ['ok' => false, 'status' => 400, 'error' => $format];
    }
    if (prism_registration_limited($in['id_number'], $ip)) {
        return ['ok' => false, 'status' => 429, 'error' => 'Too many attempts. Please wait a few minutes and try again.'];
    }

    $stmt = $db->prepare('SELECT id_number, email, reg_code_hash, expires_at, claimed_at, revoked_at FROM student_roster WHERE id_number = ? AND email = ? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()');
    $stmt->execute([$in['id_number'], $in['email']]);
    $row = $stmt->fetch();
    $hash = ($row && !empty($row['reg_code_hash'])) ? (string) $row['reg_code_hash'] : prism_dummy_code_hash();
    $codeOk = password_verify($in['code'], $hash);
    if (!$row || !$codeOk) {
        prism_registration_record_failure($in['id_number'], $ip);
        prism_roster_audit($db, null, $in['id_number'], 'registration_failed', $ip);
        return ['ok' => false, 'status' => 400, 'error' => PRISM_ROSTER_GENERIC];
    }

    try {
        $db->beginTransaction();
        $lock = $db->prepare('SELECT * FROM student_roster WHERE id_number = ? AND email = ? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > NOW() FOR UPDATE');
        $lock->execute([$in['id_number'], $in['email']]);
        $locked = $lock->fetch();
        if (!$locked || !password_verify($in['code'], (string) $locked['reg_code_hash'])) {
            $db->rollBack();
            prism_registration_record_failure($in['id_number'], $ip);
            prism_roster_audit($db, null, $in['id_number'], 'registration_failed', $ip);
            return ['ok' => false, 'status' => 400, 'error' => PRISM_ROSTER_GENERIC];
        }
        $hold = (int) (getenv('PRISM_ROSTER_LOCK_HOLD') ?: 0);
        if ($hold > 0 && $hold <= 3) {
            sleep($hold);
        }
        $name = trim($locked['first_name'] . ' ' . $locked['last_name']);
        $section = trim($locked['course'] . ' ' . $locked['year_level']);
        $pwHash = prism_hash_secret($in['password']);
        $verifiedAt = prism_email_verify_enabled() ? null : date('Y-m-d H:i:s');
        $db->prepare('INSERT INTO users (id, `password`, role, name, section, email, id_number, email_verified_at) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$locked['id_number'], $pwHash, 'student', $name, $section, $locked['email'], $locked['id_number'], $verifiedAt]);
        $db->prepare('UPDATE student_roster SET claimed_at = NOW(), claimed_by_user_id = ?, updated_at = NOW() WHERE id_number = ?')
            ->execute([$locked['id_number'], $locked['id_number']]);
        prism_roster_audit($db, null, $locked['id_number'], 'registration_success', $ip);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM roster register: ' . $e->getMessage());
        prism_registration_record_failure($in['id_number'], $ip);
        try {
            prism_roster_audit($db, null, $in['id_number'], 'registration_failed', $ip);
        } catch (Throwable $e2) {
            error_log('PRISM roster audit: ' . $e2->getMessage());
        }
        return ['ok' => false, 'status' => 400, 'error' => PRISM_ROSTER_GENERIC];
    }

    if (prism_email_verify_enabled()) {
        prism_issue_verification($db, $locked['id_number'], $locked['email']);
    }
    return ['ok' => true, 'status' => 200, 'id' => $locked['id_number']];
}

/**
 * STUB: no mail service is configured. The token is not logged.
 * Returns false so callers know the message was not delivered.
 */
function prism_send_verification_email(string $email, string $link): bool {
    unset($email, $link);
    error_log('PRISM email verification is enabled but no mail service is configured.');
    return false;
}

function prism_issue_verification(PDO $db, string $userId, string $email): void {
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $exp = date('Y-m-d H:i:s', time() + 86400);
    $db->prepare('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?,?,?)')->execute([$userId, $hash, $exp]);
    $link = 'verify.html?token=' . rawurlencode($token);
    prism_send_verification_email($email, $link);
}

function prism_consume_verification(PDO $db, string $token): bool {
    prism_ensure_student_roster($db);
    $token = trim($token);
    if ($token === '' || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        return false;
    }
    $hash = hash('sha256', $token);
    try {
        $db->beginTransaction();
        $stmt = $db->prepare('SELECT id, user_id FROM email_verifications WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE');
        $stmt->execute([$hash]);
        $row = $stmt->fetch();
        if (!$row) {
            $db->rollBack();
            return false;
        }
        $db->prepare('UPDATE email_verifications SET used_at = NOW() WHERE id = ?')->execute([$row['id']]);
        $db->prepare('UPDATE users SET email_verified_at = NOW() WHERE id = ?')->execute([$row['user_id']]);
        $db->commit();
        return true;
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM verify email: ' . $e->getMessage());
        return false;
    }
}

function prism_resend_verification(PDO $db, string $id, string $email, string $ip): void {
    prism_ensure_student_roster($db);
    if (prism_rate_limit_blocked('verify_resend', $ip, 5, 900)) {
        fail('Too many attempts. Please wait a few minutes and try again.', 429);
    }
    prism_rate_limit_record('verify_resend', $ip, 900);
    if (!prism_email_verify_enabled()) {
        return;
    }
    $id = trim($id);
    $email = prism_normalize_ctu_email($email);
    $stmt = $db->prepare('SELECT id, email, email_verified_at, role FROM users WHERE id = ? AND role = ?');
    $stmt->execute([$id, 'student']);
    $user = $stmt->fetch();
    if (!$user || prism_normalize_ctu_email($user['email'] ?? '') !== $email || !empty($user['email_verified_at'])) {
        return;
    }
    prism_issue_verification($db, $user['id'], $email);
}

function prism_student_needs_email_verify(PDO $db, string $userId): bool {
    if (!prism_email_verify_enabled()) {
        return false;
    }
    prism_ensure_student_roster($db);
    $stmt = $db->prepare('SELECT email_verified_at FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    return !$row || empty($row['email_verified_at']);
}

function prism_current_admin(): ?array {
    startSession();
    if (empty($_SESSION['user_id']) || (string) ($_SESSION['role'] ?? '') !== 'admin') {
        return null;
    }
    return [
        'id' => (string) $_SESSION['user_id'],
        'role' => 'admin',
        'name' => (string) ($_SESSION['name'] ?? ''),
    ];
}

function prism_roster_public_row(array $row): array {
    return [
        'id_number' => $row['id_number'],
        'email' => $row['email'],
        'first_name' => $row['first_name'],
        'last_name' => $row['last_name'],
        'course' => $row['course'],
        'year_level' => $row['year_level'],
        'status' => prism_roster_status($row),
        'expires_at' => $row['expires_at'],
        'claimed_at' => $row['claimed_at'],
        'revoked_at' => $row['revoked_at'] ?? null,
        'created_at' => $row['created_at'] ?? null,
    ];
}

function prism_roster_list(PDO $db, string $q, string $status, int $page, int $perPage): array {
    prism_ensure_student_roster($db);
    $page = max(1, $page);
    $perPage = min(50, max(1, $perPage));
    $where = ' WHERE 1=1';
    $params = [];
    if ($q !== '') {
        $where .= " AND (id_number LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ? ESCAPE '\\\\')";
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
        $params = [$like, $like, $like, $like];
    }
    if ($status === 'revoked') {
        $where .= ' AND revoked_at IS NOT NULL';
    } elseif ($status === 'claimed') {
        $where .= ' AND revoked_at IS NULL AND claimed_at IS NOT NULL';
    } elseif ($status === 'expired') {
        $where .= ' AND revoked_at IS NULL AND claimed_at IS NULL AND expires_at <= NOW()';
    } elseif ($status === 'unclaimed') {
        $where .= ' AND revoked_at IS NULL AND claimed_at IS NULL AND expires_at > NOW()';
    }
    $count = $db->prepare('SELECT COUNT(*) FROM student_roster' . $where);
    $count->execute($params);
    $total = (int) $count->fetchColumn();
    $sql = 'SELECT id_number, email, first_name, last_name, course, year_level, expires_at, claimed_at, revoked_at, created_at FROM student_roster'
        . $where . ' ORDER BY created_at DESC LIMIT ' . (int) $perPage . ' OFFSET ' . (int) (($page - 1) * $perPage);
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $rows[] = prism_roster_public_row($row);
    }
    $pages = max(1, (int) ceil($total / $perPage));
    return ['rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages, 'per_page' => $perPage];
}

function prism_roster_add(PDO $db, array $admin, array $body, string $ip): array {
    prism_ensure_student_roster($db);
    $in = prism_normalize_roster_input($body);
    $errors = prism_roster_field_errors($in, false);
    if ($errors) {
        return ['ok' => false, 'status' => 400, 'error' => $errors[0]];
    }
    $taken = prism_roster_conflicts($db, [$in]);
    if (!empty($taken[$in['id_number']]) || !empty($taken['email:' . $in['email']])) {
        return ['ok' => false, 'status' => 400, 'error' => 'That ID number or email is already on the roster or in use.'];
    }
    $code = prism_generate_reg_code();
    $db->prepare('INSERT INTO student_roster (id_number, email, first_name, last_name, course, year_level, reg_code_hash, expires_at, created_by_admin_id) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([
            $in['id_number'], $in['email'], $in['first_name'], $in['last_name'], $in['course'], $in['year_level'],
            prism_hash_secret($code), prism_roster_expires_at(), $admin['id'],
        ]);
    prism_roster_audit($db, $admin['id'], $in['id_number'], 'roster_created', $ip);
    return [
        'ok' => true,
        'id_number' => $in['id_number'],
        'email' => $in['email'],
        'registration_code' => $code,
        'expires_at' => prism_roster_expires_at(),
        'warning' => 'This code will not be shown again.',
    ];
}

function prism_roster_conflicts(PDO $db, array $rows): array {
    $ids = [];
    $emails = [];
    foreach ($rows as $row) {
        if (!empty($row['id_number'])) {
            $ids[] = $row['id_number'];
        }
        if (!empty($row['email'])) {
            $emails[] = $row['email'];
        }
    }
    $hit = [];
    if ($ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare('SELECT id_number FROM student_roster WHERE id_number IN (' . $marks . ')');
        $stmt->execute(array_values($ids));
        foreach ($stmt->fetchAll() as $r) {
            $hit[$r['id_number']] = true;
        }
        $stmt = $db->prepare('SELECT id FROM users WHERE id IN (' . $marks . ')');
        $stmt->execute(array_values($ids));
        foreach ($stmt->fetchAll() as $r) {
            $hit[$r['id']] = true;
        }
    }
    if ($emails) {
        $marks = implode(',', array_fill(0, count($emails), '?'));
        $stmt = $db->prepare('SELECT email FROM student_roster WHERE email IN (' . $marks . ')');
        $stmt->execute(array_values($emails));
        foreach ($stmt->fetchAll() as $r) {
            $hit['email:' . $r['email']] = true;
        }
        $stmt = $db->prepare('SELECT email FROM users WHERE email IN (' . $marks . ') AND email IS NOT NULL');
        $stmt->execute(array_values($emails));
        foreach ($stmt->fetchAll() as $r) {
            $hit['email:' . prism_normalize_ctu_email($r['email'])] = true;
        }
    }
    return $hit;
}

function prism_parse_csv_text(string $text): array {
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    $fh = fopen('php://temp', 'r+');
    fwrite($fh, $text);
    rewind($fh);
    $header = fgetcsv($fh);
    if (!$header) {
        fclose($fh);
        return ['error' => 'The CSV file is empty.', 'rows' => []];
    }
    $map = [];
    foreach ($header as $i => $name) {
        $map[strtolower(trim((string) $name))] = $i;
    }
    $need = ['id_number', 'email', 'first_name', 'last_name', 'course', 'year_level'];
    foreach ($need as $col) {
        if (!array_key_exists($col, $map)) {
            fclose($fh);
            return ['error' => 'Missing column: ' . $col, 'rows' => []];
        }
    }
    $rows = [];
    $line = 1;
    while (($data = fgetcsv($fh)) !== false) {
        $line++;
        if (count($data) === 1 && trim((string) $data[0]) === '') {
            continue;
        }
        $raw = [];
        foreach ($need as $col) {
            $raw[$col] = isset($data[$map[$col]]) ? (string) $data[$map[$col]] : '';
        }
        $norm = prism_normalize_roster_input($raw);
        $rows[] = ['line' => $line] + $norm;
    }
    fclose($fh);
    return ['error' => '', 'rows' => $rows];
}

function prism_read_csv_upload(array $files): array {
    $file = $files['file'] ?? null;
    if (!$file || !is_array($file)) {
        return ['ok' => false, 'error' => 'Choose a CSV file.'];
    }
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => 'The CSV file could not be read.'];
    }
    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0 || $size > 2 * 1024 * 1024) {
        return ['ok' => false, 'error' => 'CSV files must be 2 MB or smaller.'];
    }
    $name = strtolower((string) ($file['name'] ?? ''));
    $type = strtolower((string) ($file['type'] ?? ''));
    $okType = $type === '' || in_array($type, ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'], true);
    if (!$okType || substr($name, -4) !== '.csv') {
        return ['ok' => false, 'error' => 'Upload a .csv file.'];
    }
    $text = file_get_contents((string) $file['tmp_name']);
    if ($text === false) {
        return ['ok' => false, 'error' => 'The CSV file could not be read.'];
    }
    return ['ok' => true, 'text' => $text];
}

function prism_roster_preview_rows(PDO $db, array $parsed): array {
    if (($parsed['error'] ?? '') !== '') {
        return ['ok' => false, 'error' => $parsed['error'], 'rows' => []];
    }
    $seenId = [];
    $seenEmail = [];
    $conflicts = prism_roster_conflicts($db, $parsed['rows']);
    $out = [];
    foreach ($parsed['rows'] as $row) {
        $errors = prism_roster_field_errors($row, false);
        if (isset($seenId[$row['id_number']])) {
            $errors[] = 'Duplicate ID number in this file.';
        }
        if (isset($seenEmail[$row['email']])) {
            $errors[] = 'Duplicate email in this file.';
        }
        if (!empty($conflicts[$row['id_number']])) {
            $errors[] = 'That ID number is already on the roster or already registered.';
        }
        if (!empty($conflicts['email:' . $row['email']])) {
            $errors[] = 'That email is already on the roster or already registered.';
        }
        $seenId[$row['id_number']] = true;
        $seenEmail[$row['email']] = true;
        $out[] = [
            'line' => $row['line'],
            'id_number' => $row['id_number'],
            'email' => $row['email'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'course' => $row['course'],
            'year_level' => $row['year_level'],
            'errors' => $errors,
            'valid' => count($errors) === 0,
        ];
    }
    return ['ok' => true, 'rows' => $out];
}

function prism_roster_import(PDO $db, array $admin, array $parsed, string $ip): array {
    $preview = prism_roster_preview_rows($db, $parsed);
    if (empty($preview['ok'])) {
        return $preview + ['status' => 400];
    }
    $valid = array_values(array_filter($preview['rows'], static function ($row) {
        return !empty($row['valid']);
    }));
    if (!$valid) {
        return ['ok' => true, 'imported' => 0, 'rows' => $preview['rows'], 'codes' => [], 'warning' => ''];
    }
    $codes = [];
    $db->beginTransaction();
    try {
        $ins = $db->prepare('INSERT INTO student_roster (id_number, email, first_name, last_name, course, year_level, reg_code_hash, expires_at, created_by_admin_id) VALUES (?,?,?,?,?,?,?,?,?)');
        foreach ($valid as $row) {
            $code = prism_generate_reg_code();
            $ins->execute([
                $row['id_number'], $row['email'], $row['first_name'], $row['last_name'], $row['course'], $row['year_level'],
                prism_hash_secret($code), prism_roster_expires_at(), $admin['id'],
            ]);
            prism_roster_audit($db, $admin['id'], $row['id_number'], 'roster_created', $ip);
            $codes[] = [
                'id_number' => $row['id_number'],
                'email' => $row['email'],
                'registration_code' => $code,
            ];
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM roster import: ' . $e->getMessage());
        return ['ok' => false, 'status' => 400, 'error' => 'The import could not be saved. Check for duplicates and try again.', 'rows' => $preview['rows'], 'codes' => []];
    }
    return [
        'ok' => true,
        'imported' => count($codes),
        'rows' => $preview['rows'],
        'codes' => $codes,
        'warning' => 'This code will not be shown again.',
    ];
}

function prism_roster_regenerate(PDO $db, array $admin, string $idNumber, string $ip): array {
    prism_ensure_student_roster($db);
    $idNumber = trim($idNumber);
    $stmt = $db->prepare('SELECT * FROM student_roster WHERE id_number = ?');
    $stmt->execute([$idNumber]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['ok' => false, 'status' => 404, 'error' => 'That roster entry was not found.'];
    }
    $status = prism_roster_status($row);
    if ($status === 'claimed' || $status === 'revoked') {
        return ['ok' => false, 'status' => 400, 'error' => 'Only unclaimed or expired entries can get a new code.'];
    }
    $code = prism_generate_reg_code();
    $exp = prism_roster_expires_at();
    $db->prepare('UPDATE student_roster SET reg_code_hash = ?, expires_at = ?, updated_at = NOW() WHERE id_number = ? AND claimed_at IS NULL AND revoked_at IS NULL')
        ->execute([prism_hash_secret($code), $exp, $idNumber]);
    prism_roster_audit($db, $admin['id'], $idNumber, 'code_regenerated', $ip);
    return [
        'ok' => true,
        'id_number' => $idNumber,
        'email' => $row['email'],
        'registration_code' => $code,
        'expires_at' => $exp,
        'warning' => 'This code will not be shown again.',
    ];
}

function prism_roster_revoke(PDO $db, array $admin, string $idNumber, string $ip): array {
    prism_ensure_student_roster($db);
    $idNumber = trim($idNumber);
    $stmt = $db->prepare('SELECT * FROM student_roster WHERE id_number = ?');
    $stmt->execute([$idNumber]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['ok' => false, 'status' => 404, 'error' => 'That roster entry was not found.'];
    }
    if (prism_roster_status($row) === 'claimed') {
        return ['ok' => false, 'status' => 400, 'error' => 'Claimed entries cannot be revoked here.'];
    }
    $db->prepare('UPDATE student_roster SET revoked_at = NOW(), updated_at = NOW() WHERE id_number = ? AND claimed_at IS NULL')
        ->execute([$idNumber]);
    prism_roster_audit($db, $admin['id'], $idNumber, 'roster_revoked', $ip);
    return ['ok' => true];
}

function prism_roster_delete(PDO $db, array $admin, string $idNumber, string $ip): array {
    prism_ensure_student_roster($db);
    $idNumber = trim($idNumber);
    $stmt = $db->prepare('SELECT * FROM student_roster WHERE id_number = ?');
    $stmt->execute([$idNumber]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['ok' => false, 'status' => 404, 'error' => 'That roster entry was not found.'];
    }
    if (!empty($row['claimed_at'])) {
        return ['ok' => false, 'status' => 400, 'error' => 'Claimed entries cannot be deleted here.'];
    }
    prism_roster_audit($db, $admin['id'], $idNumber, 'roster_revoked', $ip);
    $db->prepare('DELETE FROM student_roster WHERE id_number = ? AND claimed_at IS NULL')->execute([$idNumber]);
    return ['ok' => true];
}
