<?php
/**
 * One-time backfill for students who registered before the roster.
 * Claimed rows are created so those accounts keep working. Nobody is asked to register again.
 *
 * Students with a real @ctu.edu.ph email get that address.
 * Students with no email get legacy.{id}@ctu.edu.ph. Replace that address in the roster
 * before you rely on it for mail. The account stays claimed either way.
 *
 * Usage: C:\xampp\php\php.exe scripts\backfill_student_roster.php
 */
require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/roster_lib.php';

$db = getDB();
prism_ensure_student_roster($db);

$students = $db->query("SELECT id, name, section, email FROM users WHERE role = 'student'")->fetchAll();
$added = 0;
$skipped = 0;
$placeholders = 0;

$insert = $db->prepare(
    'INSERT INTO student_roster (id_number, email, first_name, last_name, course, year_level, reg_code_hash, expires_at, claimed_at, claimed_by_user_id, created_by_admin_id)
     VALUES (?,?,?,?,?,?,?,NOW(),NOW(),?,NULL)'
);
$link = $db->prepare('UPDATE users SET id_number = ?, email = ? WHERE id = ? AND (id_number IS NULL OR id_number = "")');

foreach ($students as $student) {
    $id = trim((string) $student['id']);
    if (!prism_is_ctu_student_id($id)) {
        $skipped++;
        echo "skip {$id}: not a 7-digit student id\n";
        continue;
    }
    $exists = $db->prepare('SELECT id_number FROM student_roster WHERE id_number = ?');
    $exists->execute([$id]);
    if ($exists->fetch()) {
        $skipped++;
        continue;
    }
    $email = prism_normalize_ctu_email($student['email'] ?? '');
    if (!prism_is_ctu_email($email)) {
        $email = 'legacy.' . $id . '@ctu.edu.ph';
        $placeholders++;
    }
    $parts = preg_split('/\s+/', trim((string) $student['name']), 2);
    $first = $parts[0] !== '' ? $parts[0] : 'Student';
    $last = $parts[1] ?? $first;
    $section = trim((string) ($student['section'] ?? ''));
    $course = 'BSIT';
    $year = '1-A';
    if (preg_match('/^(.+) ([1-4]-[A-F])$/', $section, $m)) {
        $course = $m[1];
        $year = $m[2];
    } elseif ($section !== '') {
        $course = $section;
    }
    $hash = prism_hash_secret(prism_generate_reg_code());
    $insert->execute([$id, $email, $first, $last, $course, $year, $hash, $id]);
    $link->execute([$id, $email, $id]);
    $added++;
    echo "claimed {$id} {$email}\n";
}

echo "added={$added} skipped={$skipped} placeholder_emails={$placeholders}\n";
