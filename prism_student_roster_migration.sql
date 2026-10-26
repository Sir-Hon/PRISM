-- Roster-verified student registration.
-- User ids stay VARCHAR to match the existing users.id column.
-- The password hash remains in users.password (password_hash / bcrypt).
-- Run: mysql -u root prism_db < prism_student_roster_migration.sql

CREATE TABLE IF NOT EXISTS student_roster (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS registration_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id VARCHAR(50) DEFAULT NULL,
  roster_id_number VARCHAR(20) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_roster (roster_id_number),
  KEY idx_audit_event (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_verify_user (user_id),
  KEY idx_verify_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Existing blank emails must become NULL before a UNIQUE index (multiple NULLs are allowed).
UPDATE users SET email = NULL WHERE email = '';

ALTER TABLE users MODIFY email VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN id_number VARCHAR(20) NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL DEFAULT NULL;
ALTER TABLE users ADD UNIQUE KEY uq_users_id_number (id_number);
ALTER TABLE users ADD UNIQUE KEY uq_users_email (email);
ALTER TABLE users ADD CONSTRAINT fk_users_roster_id FOREIGN KEY (id_number) REFERENCES student_roster (id_number);
ALTER TABLE student_roster ADD CONSTRAINT fk_roster_claimed_by FOREIGN KEY (claimed_by_user_id) REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE student_roster ADD CONSTRAINT fk_roster_created_by FOREIGN KEY (created_by_admin_id) REFERENCES users (id) ON DELETE SET NULL;
