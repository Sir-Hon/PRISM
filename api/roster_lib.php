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

function prism_college_for_program(string $program): string {
    foreach (prism_ctu_programs_by_college() as $college => $list) {
        if (in_array($program, $list, true)) {
            return $college;
        }
    }
    return '';
}

function prism_normalize_placement(array $b): array {
    $college = trim((string) ($b['college'] ?? ''));
    $program = trim((string) ($b['program'] ?? $b['course'] ?? ''));
    $year = trim((string) ($b['year'] ?? ''));
    $section = strtoupper(trim((string) ($b['section'] ?? $b['section_letter'] ?? '')));
    $yearLevel = strtoupper(trim((string) ($b['year_level'] ?? '')));
    if (($year === '' || $section === '') && preg_match('/^([1-4])-([A-F])$/', $yearLevel, $m)) {
        if ($year === '') {
            $year = $m[1];
        }
        if ($section === '') {
            $section = $m[2];
        }
    }
    if ($college === '' && $program !== '') {
        $college = prism_college_for_program($program);
    }
    $block = ($year !== '' && preg_match('/^[A-F]$/', $section)) ? ($year . '-' . $section) : '';
    return [
        'college' => $college,
        'program' => $program,
        'year' => $year,
        'section' => $section,
        'course' => $program,
        'year_level' => $block,
    ];
}

function prism_placement_error(array $place): ?string {
    $map = prism_ctu_programs_by_college();
    if (!isset($map[$place['college'] ?? ''])) {
        return 'Choose a college.';
    }
    if (!in_array($place['program'] ?? '', $map[$place['college']], true)) {
        return 'Choose a program in that college.';
    }
    if (!preg_match('/^[1-4]$/', (string) ($place['year'] ?? ''))) {
        return 'Choose a year from 1 to 4.';
    }
    if (!preg_match('/^[A-F]$/', (string) ($place['section'] ?? ''))) {
        return 'Choose a section from A to F.';
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

function prism_roster_schema_flag(): string {
    return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'prism-roster-schema-v3-' . substr(hash('sha256', DB_HOST . '|' . DB_NAME), 0, 16) . '.ok';
}

function prism_ensure_student_roster(PDO $db): void {
    static $done = false;
    if ($done) {
        return;
    }
    $flag = prism_roster_schema_flag();
    if (is_file($flag)) {
        $done = true;
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
    prism_ensure_roster_column($db, 'student_roster', 'college', "VARCHAR(40) NOT NULL DEFAULT ''");
    prism_ensure_roster_column($db, 'student_roster', 'section_letter', "VARCHAR(8) NOT NULL DEFAULT ''");
    prism_ensure_index($db, 'student_roster', 'idx_roster_place', 'KEY idx_roster_place (college, course, year_level, section_letter)');
    prism_backfill_roster_placement($db);
    $db->exec(
        'CREATE TABLE IF NOT EXISTS teacher_roster (
            id VARCHAR(50) PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            first_name VARCHAR(80) NOT NULL,
            last_name VARCHAR(80) NOT NULL,
            college VARCHAR(40) NOT NULL,
            department VARCHAR(80) NOT NULL,
            subjects VARCHAR(500) NOT NULL,
            created_by_admin_id VARCHAR(50) DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_teacher_roster_email (email),
            KEY idx_teacher_college (college, department)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    prism_ensure_fk($db, 'teacher_roster', 'fk_teacher_roster_user', 'FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE');
    prism_ensure_fk($db, 'teacher_roster', 'fk_teacher_roster_created_by', 'FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE SET NULL');
    @file_put_contents($flag, '1');
    $done = true;
}

function prism_ensure_roster_column(PDO $db, string $table, string $column, string $definition): void {
    if (!preg_match('/^[a-z_]+$/', $table) || !preg_match('/^[a-z_]+$/', $column)) {
        return;
    }
    try {
        $stmt = $db->query('SHOW COLUMNS FROM `' . $table . '` LIKE ' . $db->quote($column));
        if ($stmt && $stmt->fetch()) {
            return;
        }
        $db->exec('ALTER TABLE `' . $table . '` ADD COLUMN `' . $column . '` ' . $definition);
    } catch (PDOException $e) {
        error_log('PRISM roster column ' . $column . ': ' . $e->getMessage());
    }
}

function prism_backfill_roster_placement(PDO $db): void {
    try {
        $rows = $db->query("SELECT id_number, course, year_level, college, section_letter FROM student_roster WHERE college = '' OR section_letter = ''")->fetchAll();
    } catch (PDOException $e) {
        error_log('PRISM roster placement backfill: ' . $e->getMessage());
        return;
    }
    if (!$rows) {
        return;
    }
    $upd = $db->prepare('UPDATE student_roster SET college = ?, section_letter = ? WHERE id_number = ?');
    foreach ($rows as $row) {
        $college = (string) ($row['college'] ?? '');
        if ($college === '') {
            $college = prism_college_for_program((string) ($row['course'] ?? ''));
        }
        $letter = strtoupper((string) ($row['section_letter'] ?? ''));
        if ($letter === '' && preg_match('/^[1-4]-([A-F])$/', strtoupper((string) ($row['year_level'] ?? '')), $m)) {
            $letter = $m[1];
        }
        if ($college !== (string) ($row['college'] ?? '') || $letter !== (string) ($row['section_letter'] ?? '')) {
            $upd->execute([$college, $letter, $row['id_number']]);
        }
    }
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
    $allowed = ['roster_created', 'roster_updated', 'code_regenerated', 'roster_revoked', 'registration_success', 'registration_failed'];
    if (!in_array($event, $allowed, true)) {
        return;
    }
    $db->prepare('INSERT INTO registration_audit_log (admin_id, roster_id_number, event_type, ip_address) VALUES (?,?,?,?)')
        ->execute([$adminId !== '' ? $adminId : null, substr($idNumber, 0, 20), $event, substr($ip, 0, 45)]);
}

function prism_normalize_roster_input(array $b): array {
    $place = prism_normalize_placement($b);
    $password = (string) ($b['password'] ?? '');
    $hasConfirm = array_key_exists('confirm_password', $b) || array_key_exists('password2', $b);
    $confirm = $hasConfirm ? (string) ($b['confirm_password'] ?? $b['password2'] ?? '') : $password;
    return [
        'id_number' => trim((string) ($b['id_number'] ?? $b['id'] ?? '')),
        'email' => prism_normalize_ctu_email($b['email'] ?? ''),
        'password' => $password,
        'confirm' => $confirm,
        'first_name' => trim((string) ($b['first_name'] ?? '')),
        'last_name' => trim((string) ($b['last_name'] ?? '')),
        'college' => $place['college'],
        'program' => $place['program'],
        'year' => $place['year'],
        'section' => $place['section'],
        'course' => $place['course'],
        'year_level' => $place['year_level'],
    ];
}

function prism_roster_field_errors(array $row, bool $forStudent = false, bool $requirePassword = true): array {
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
        $place = prism_placement_error($row);
        if ($place !== null) {
            $errors[] = $place;
        }
        $password = (string) ($row['password'] ?? '');
        $confirm = (string) ($row['confirm'] ?? '');
        if ($requirePassword || $password !== '' || $confirm !== '') {
            $pw = prism_password_format_error($password, $confirm);
            if ($pw !== null) {
                $errors[] = $pw;
            }
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
    unset($db, $body, $ip);
    return ['ok' => false, 'status' => 403, 'error' => 'Student accounts are created by an administrator.'];
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
    $year = '';
    $section = strtoupper((string) ($row['section_letter'] ?? ''));
    if (preg_match('/^([1-4])-([A-F])$/', strtoupper((string) ($row['year_level'] ?? '')), $m)) {
        $year = $m[1];
        if ($section === '') {
            $section = $m[2];
        }
    }
    return [
        'id_number' => $row['id_number'],
        'email' => $row['email'],
        'first_name' => $row['first_name'],
        'last_name' => $row['last_name'],
        'college' => $row['college'] ?? '',
        'program' => $row['course'],
        'year' => $year,
        'section' => $section,
        'course' => $row['course'],
        'year_level' => $row['year_level'],
        'status' => prism_roster_status($row),
        'expires_at' => $row['expires_at'] ?? null,
        'claimed_at' => $row['claimed_at'] ?? null,
        'revoked_at' => $row['revoked_at'] ?? null,
        'created_at' => $row['created_at'] ?? null,
    ];
}

function prism_roster_list(PDO $db, string $q, string $status, int $page, int $perPage, string $college = '', string $program = '', string $year = '', string $section = ''): array {
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
    $college = trim($college);
    $program = trim($program);
    $year = trim($year);
    $section = strtoupper(trim($section));
    if ($college !== '') {
        $where .= ' AND college = ?';
        $params[] = $college;
    }
    if ($program !== '') {
        $where .= ' AND course = ?';
        $params[] = $program;
    }
    if (preg_match('/^[1-4]$/', $year)) {
        $where .= ' AND year_level LIKE ?';
        $params[] = $year . '-%';
    }
    if (preg_match('/^[A-F]$/', $section)) {
        $where .= ' AND section_letter = ?';
        $params[] = $section;
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
    $sql = 'SELECT id_number, email, first_name, last_name, college, course, year_level, section_letter, expires_at, claimed_at, revoked_at, created_at FROM student_roster'
        . $where . ' ORDER BY college, course, year_level, section_letter, last_name, first_name LIMIT ' . (int) $perPage . ' OFFSET ' . (int) (($page - 1) * $perPage);
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $rows[] = prism_roster_public_row($row);
    }
    $pages = max(1, (int) ceil($total / $perPage));
    return ['rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages, 'per_page' => $perPage];
}

function prism_insert_student_account(PDO $db, array $admin, array $in): void {
    $name = trim($in['first_name'] . ' ' . $in['last_name']);
    $section = $in['program'] . ' ' . $in['year'] . '-' . $in['section'];
    $verifiedAt = prism_email_verify_enabled() ? null : date('Y-m-d H:i:s');
    $db->prepare('INSERT INTO student_roster (id_number, email, first_name, last_name, course, year_level, college, section_letter, reg_code_hash, expires_at, claimed_at, created_by_admin_id) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),?)')
        ->execute([
            $in['id_number'], $in['email'], $in['first_name'], $in['last_name'], $in['program'], $in['year_level'],
            $in['college'], $in['section'], prism_hash_secret(bin2hex(random_bytes(8))), date('Y-m-d H:i:s', time() + 86400), $admin['id'],
        ]);
    $db->prepare('INSERT INTO users (id, `password`, role, name, section, email, id_number, email_verified_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$in['id_number'], prism_hash_secret($in['password']), 'student', $name, $section, $in['email'], $in['id_number'], $verifiedAt]);
    $db->prepare('UPDATE student_roster SET claimed_by_user_id = ? WHERE id_number = ?')
        ->execute([$in['id_number'], $in['id_number']]);
    if (prism_email_verify_enabled()) {
        prism_issue_verification($db, $in['id_number'], $in['email']);
    }
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
    try {
        $db->beginTransaction();
        prism_insert_student_account($db, $admin, $in);
        prism_roster_audit($db, $admin['id'], $in['id_number'], 'roster_created', $ip);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM roster add: ' . $e->getMessage());
        return ['ok' => false, 'status' => 400, 'error' => 'That student could not be saved. Check the ID and email, then try again.'];
    }
    return [
        'ok' => true,
        'id_number' => $in['id_number'],
        'email' => $in['email'],
    ];
}

function prism_roster_update(PDO $db, array $admin, array $body, string $ip): array {
    prism_ensure_student_roster($db);
    $in = prism_normalize_roster_input($body);
    $errors = prism_roster_field_errors($in, false, false);
    if ($errors) {
        return ['ok' => false, 'status' => 400, 'error' => $errors[0]];
    }
    $existing = $db->prepare('SELECT id_number FROM student_roster WHERE id_number = ?');
    $existing->execute([$in['id_number']]);
    if (!$existing->fetch()) {
        return ['ok' => false, 'status' => 404, 'error' => 'That student was not found on the roster.'];
    }
    $login = $db->prepare('SELECT id FROM users WHERE id = ? AND role = ?');
    $login->execute([$in['id_number'], 'student']);
    if (!$login->fetch()) {
        return ['ok' => false, 'status' => 404, 'error' => 'That student login was not found.'];
    }
    $emailTaken = $db->prepare('SELECT id_number FROM student_roster WHERE email = ? AND id_number <> ?');
    $emailTaken->execute([$in['email'], $in['id_number']]);
    if ($emailTaken->fetch()) {
        return ['ok' => false, 'status' => 400, 'error' => 'That email is already on the roster.'];
    }
    $userEmail = $db->prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ? AND email IS NOT NULL');
    $userEmail->execute([$in['email'], $in['id_number']]);
    if ($userEmail->fetch()) {
        return ['ok' => false, 'status' => 400, 'error' => 'That CTU email is already used on another account.'];
    }
    $name = trim($in['first_name'] . ' ' . $in['last_name']);
    $section = $in['program'] . ' ' . $in['year'] . '-' . $in['section'];
    try {
        $db->beginTransaction();
        $db->prepare('UPDATE student_roster SET email = ?, first_name = ?, last_name = ?, course = ?, year_level = ?, college = ?, section_letter = ? WHERE id_number = ?')
            ->execute([
                $in['email'], $in['first_name'], $in['last_name'], $in['program'], $in['year_level'],
                $in['college'], $in['section'], $in['id_number'],
            ]);
        $db->prepare('UPDATE users SET name = ?, section = ?, email = ? WHERE id = ? AND role = ?')
            ->execute([$name, $section, $in['email'], $in['id_number'], 'student']);
        if ($in['password'] !== '') {
            $db->prepare('UPDATE users SET `password` = ? WHERE id = ? AND role = ?')
                ->execute([prism_hash_secret($in['password']), $in['id_number'], 'student']);
        }
        prism_roster_audit($db, $admin['id'], $in['id_number'], 'roster_updated', $ip);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM roster update: ' . $e->getMessage());
        return ['ok' => false, 'status' => 400, 'error' => 'That student could not be updated. Check the email, then try again.'];
    }
    return ['ok' => true, 'id_number' => $in['id_number'], 'email' => $in['email']];
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
    foreach (['id_number', 'email', 'first_name', 'last_name', 'password'] as $col) {
        if (!array_key_exists($col, $map)) {
            fclose($fh);
            return ['error' => 'Missing column: ' . $col, 'rows' => []];
        }
    }
    if (!array_key_exists('program', $map) && !array_key_exists('course', $map)) {
        fclose($fh);
        return ['error' => 'Missing column: program', 'rows' => []];
    }
    if (!array_key_exists('year', $map) && !array_key_exists('year_level', $map)) {
        fclose($fh);
        return ['error' => 'Missing column: year', 'rows' => []];
    }
    if (!array_key_exists('section', $map) && !array_key_exists('year_level', $map)) {
        fclose($fh);
        return ['error' => 'Missing column: section', 'rows' => []];
    }
    $cols = ['id_number', 'email', 'first_name', 'last_name', 'password', 'college', 'program', 'course', 'year', 'section', 'year_level'];
    $rows = [];
    $line = 1;
    while (($data = fgetcsv($fh)) !== false) {
        $line++;
        if (count($data) === 1 && trim((string) $data[0]) === '') {
            continue;
        }
        $raw = [];
        foreach ($cols as $col) {
            if (!array_key_exists($col, $map)) {
                continue;
            }
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
            'college' => $row['college'],
            'program' => $row['program'],
            'year' => $row['year'],
            'section' => $row['section'],
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
        return ['ok' => true, 'imported' => 0, 'rows' => $preview['rows']];
    }
    $byLine = [];
    foreach ($parsed['rows'] as $row) {
        $byLine[$row['line']] = $row;
    }
    $imported = 0;
    $db->beginTransaction();
    try {
        foreach ($valid as $shown) {
            $row = $byLine[$shown['line']] ?? null;
            if (!$row) {
                continue;
            }
            prism_insert_student_account($db, $admin, $row);
            prism_roster_audit($db, $admin['id'], $row['id_number'], 'roster_created', $ip);
            $imported++;
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM roster import: ' . $e->getMessage());
        return ['ok' => false, 'status' => 400, 'error' => 'The import could not be saved. Check for duplicates and try again.', 'rows' => $preview['rows']];
    }
    return [
        'ok' => true,
        'imported' => $imported,
        'rows' => $preview['rows'],
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
    try {
        $db->beginTransaction();
        prism_roster_audit($db, $admin['id'], $idNumber, 'roster_revoked', $ip);
        $db->prepare('UPDATE student_roster SET claimed_by_user_id = NULL WHERE id_number = ?')->execute([$idNumber]);
        $db->prepare('UPDATE users SET id_number = NULL WHERE id = ?')->execute([$idNumber]);
        $db->prepare('DELETE FROM users WHERE id = ? AND role = ?')->execute([$idNumber, 'student']);
        $db->prepare('DELETE FROM student_roster WHERE id_number = ?')->execute([$idNumber]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM roster delete: ' . $e->getMessage());
        return ['ok' => false, 'status' => 400, 'error' => 'That student could not be removed because other records still depend on the account.'];
    }
    return ['ok' => true];
}

function prism_normalize_subjects(string $raw): string {
    $parts = preg_split('/[\r\n,]+/', $raw) ?: [];
    $clean = [];
    foreach ($parts as $part) {
        $part = trim($part);
        if ($part !== '') {
            $clean[] = $part;
        }
    }
    return implode(', ', $clean);
}

function prism_normalize_teacher_input(array $b): array {
    return [
        'id' => trim((string) ($b['id'] ?? $b['id_number'] ?? '')),
        'email' => prism_normalize_ctu_email($b['email'] ?? ''),
        'first_name' => trim((string) ($b['first_name'] ?? '')),
        'last_name' => trim((string) ($b['last_name'] ?? '')),
        'college' => trim((string) ($b['college'] ?? '')),
        'department' => trim((string) ($b['department'] ?? '')),
        'subjects' => prism_normalize_subjects((string) ($b['subjects'] ?? '')),
        'password' => (string) ($b['password'] ?? ''),
        'confirm' => (string) ($b['confirm_password'] ?? $b['password2'] ?? $b['password'] ?? ''),
    ];
}

function prism_teacher_field_error(array $in, bool $requirePassword = true): ?string {
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{3,49}$/', $in['id'])) {
        return 'Teacher ID must be 4 to 50 letters, numbers, dots, or hyphens.';
    }
    if (!prism_is_ctu_email($in['email'])) {
        return 'Email must be a CTU address ending in @ctu.edu.ph.';
    }
    if ($in['first_name'] === '' || $in['last_name'] === '') {
        return 'First and last name are required.';
    }
    $colleges = prism_ctu_programs_by_college();
    if (!isset($colleges[$in['college']])) {
        return 'Choose a college.';
    }
    if ($in['department'] === '' || strlen($in['department']) > 80) {
        return 'Enter a department.';
    }
    if ($in['subjects'] === '') {
        return 'Enter the subjects this teacher handles.';
    }
    if (strlen($in['subjects']) > 500) {
        return 'Subjects must be 500 characters or fewer.';
    }
    if (!$requirePassword && $in['password'] === '' && $in['confirm'] === '') {
        return null;
    }
    return prism_password_format_error($in['password'], $in['confirm']);
}

function prism_teacher_add(PDO $db, array $admin, array $body): array {
    prism_ensure_student_roster($db);
    $in = prism_normalize_teacher_input($body);
    $err = prism_teacher_field_error($in);
    if ($err !== null) {
        return ['ok' => false, 'status' => 400, 'error' => $err];
    }
    $idTaken = $db->prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?)');
    $idTaken->execute([$in['id']]);
    if ($idTaken->fetch()) {
        return ['ok' => false, 'status' => 400, 'error' => 'That ID is already in use.'];
    }
    $emailTaken = $db->prepare('SELECT id FROM users WHERE LOWER(email) = ? AND email IS NOT NULL');
    $emailTaken->execute([$in['email']]);
    if ($emailTaken->fetch()) {
        return ['ok' => false, 'status' => 400, 'error' => 'That CTU email is already used on another account.'];
    }
    try {
        $db->beginTransaction();
        $name = trim($in['first_name'] . ' ' . $in['last_name']);
        $verifiedAt = date('Y-m-d H:i:s');
        $db->prepare('INSERT INTO users (id, `password`, role, name, section, email, email_verified_at) VALUES (?,?,?,?,?,?,?)')
            ->execute([$in['id'], prism_hash_secret($in['password']), 'teacher', $name, $in['department'], $in['email'], $verifiedAt]);
        $db->prepare('INSERT INTO teacher_roster (id, email, first_name, last_name, college, department, subjects, created_by_admin_id) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$in['id'], $in['email'], $in['first_name'], $in['last_name'], $in['college'], $in['department'], $in['subjects'], $admin['id']]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM teacher roster add: ' . $e->getMessage());
        return ['ok' => false, 'status' => 400, 'error' => 'That teacher could not be saved. Check the ID and email, then try again.'];
    }
    return ['ok' => true, 'id' => $in['id'], 'email' => $in['email']];
}

function prism_teacher_update(PDO $db, array $body): array {
    prism_ensure_student_roster($db);
    $in = prism_normalize_teacher_input($body);
    $err = prism_teacher_field_error($in, false);
    if ($err !== null) {
        return ['ok' => false, 'status' => 400, 'error' => $err];
    }
    $existing = $db->prepare('SELECT id FROM teacher_roster WHERE id = ?');
    $existing->execute([$in['id']]);
    if (!$existing->fetch()) {
        return ['ok' => false, 'status' => 404, 'error' => 'That teacher was not found on the roster.'];
    }
    $login = $db->prepare('SELECT id FROM users WHERE id = ? AND role = ?');
    $login->execute([$in['id'], 'teacher']);
    if (!$login->fetch()) {
        return ['ok' => false, 'status' => 404, 'error' => 'That teacher login was not found.'];
    }
    $emailTaken = $db->prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ? AND email IS NOT NULL');
    $emailTaken->execute([$in['email'], $in['id']]);
    if ($emailTaken->fetch()) {
        return ['ok' => false, 'status' => 400, 'error' => 'That CTU email is already used on another account.'];
    }
    $rosterEmail = $db->prepare('SELECT id FROM teacher_roster WHERE email = ? AND id <> ?');
    $rosterEmail->execute([$in['email'], $in['id']]);
    if ($rosterEmail->fetch()) {
        return ['ok' => false, 'status' => 400, 'error' => 'That email is already on the teacher roster.'];
    }
    $name = trim($in['first_name'] . ' ' . $in['last_name']);
    try {
        $db->beginTransaction();
        $db->prepare('UPDATE teacher_roster SET email = ?, first_name = ?, last_name = ?, college = ?, department = ?, subjects = ? WHERE id = ?')
            ->execute([$in['email'], $in['first_name'], $in['last_name'], $in['college'], $in['department'], $in['subjects'], $in['id']]);
        $db->prepare('UPDATE users SET name = ?, section = ?, email = ? WHERE id = ? AND role = ?')
            ->execute([$name, $in['department'], $in['email'], $in['id'], 'teacher']);
        if ($in['password'] !== '') {
            $db->prepare('UPDATE users SET `password` = ? WHERE id = ? AND role = ?')
                ->execute([prism_hash_secret($in['password']), $in['id'], 'teacher']);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM teacher roster update: ' . $e->getMessage());
        return ['ok' => false, 'status' => 400, 'error' => 'That teacher could not be updated. Check the email, then try again.'];
    }
    return ['ok' => true, 'id' => $in['id'], 'email' => $in['email']];
}

function prism_teacher_list(PDO $db, string $q, string $college, int $page, int $perPage): array {
    prism_ensure_student_roster($db);
    $page = max(1, $page);
    $perPage = min(50, max(1, $perPage));
    $where = ' WHERE 1=1';
    $params = [];
    $college = trim($college);
    if ($college !== '') {
        $where .= ' AND college = ?';
        $params[] = $college;
    }
    if ($q !== '') {
        $where .= " AND (id LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR department LIKE ? OR subjects LIKE ? ESCAPE '\\\\')";
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
        $params = array_merge($params, [$like, $like, $like, $like, $like, $like]);
    }
    $count = $db->prepare('SELECT COUNT(*) FROM teacher_roster' . $where);
    $count->execute($params);
    $total = (int) $count->fetchColumn();
    $sql = 'SELECT id, email, first_name, last_name, college, department, subjects, created_at FROM teacher_roster'
        . $where . ' ORDER BY college, department, last_name, first_name LIMIT ' . (int) $perPage . ' OFFSET ' . (int) (($page - 1) * $perPage);
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $pages = max(1, (int) ceil($total / $perPage));
    return ['rows' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'pages' => $pages, 'per_page' => $perPage];
}

function prism_teacher_delete(PDO $db, string $id): array {
    prism_ensure_student_roster($db);
    $id = trim($id);
    $stmt = $db->prepare('SELECT id FROM teacher_roster WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        return ['ok' => false, 'status' => 404, 'error' => 'That teacher was not found on the roster.'];
    }
    try {
        $db->beginTransaction();
        $db->prepare('DELETE FROM teacher_roster WHERE id = ?')->execute([$id]);
        $db->prepare('DELETE FROM users WHERE id = ? AND role = ?')->execute([$id, 'teacher']);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PRISM teacher roster delete: ' . $e->getMessage());
        return ['ok' => false, 'status' => 400, 'error' => 'That teacher could not be removed because other records still depend on the account.'];
    }
    return ['ok' => true];
}
