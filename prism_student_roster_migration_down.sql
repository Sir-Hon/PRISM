-- Reverses prism_student_roster_migration.sql
-- Does not delete existing student accounts.

ALTER TABLE student_roster DROP FOREIGN KEY fk_roster_created_by;
ALTER TABLE student_roster DROP FOREIGN KEY fk_roster_claimed_by;
ALTER TABLE users DROP FOREIGN KEY fk_users_roster_id;
ALTER TABLE users DROP INDEX uq_users_email;
ALTER TABLE users DROP INDEX uq_users_id_number;
ALTER TABLE users DROP COLUMN email_verified_at;
ALTER TABLE users DROP COLUMN id_number;

DROP TABLE IF EXISTS email_verifications;
DROP TABLE IF EXISTS registration_audit_log;
DROP TABLE IF EXISTS student_roster;
