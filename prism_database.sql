-- ═══════════════════════════════════════════════════════
--  PRISM PORTAL — MySQL Database Schema
--  Import this file in phpMyAdmin or run:
--  mysql -u root -p prism_db < prism_database.sql
-- ═══════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS prism_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE prism_db;

-- ── USERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(50)  PRIMARY KEY,
  password    VARCHAR(255) NOT NULL,         -- hashed with password_hash()
  role        ENUM('student','teacher','admin') NOT NULL,
  name        VARCHAR(120) NOT NULL,
  section     VARCHAR(80)  DEFAULT '',
  avatar      LONGTEXT     DEFAULT NULL,     -- base64 image
  email       VARCHAR(120) DEFAULT '',
  bio         TEXT         DEFAULT NULL,
  member_since DATE        DEFAULT (CURRENT_DATE),
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- ── CLASSES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id          VARCHAR(50)  PRIMARY KEY,
  teacher_id  VARCHAR(50)  NOT NULL,
  subject     VARCHAR(120) NOT NULL,
  code        VARCHAR(10)  NOT NULL UNIQUE,  -- join code e.g. "AB12CD"
  color       VARCHAR(10)  DEFAULT '#7c3aed',
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── ENROLLMENTS (student joins class) ──────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  student_id  VARCHAR(50)  NOT NULL,
  class_id    VARCHAR(50)  NOT NULL,
  joined_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_enrollment (student_id, class_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE
);

-- ── POSTS (stream) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id          VARCHAR(50)  PRIMARY KEY,
  class_id    VARCHAR(50)  NOT NULL,
  teacher_id  VARCHAR(50)  NOT NULL,
  target_section VARCHAR(80) DEFAULT NULL,
  type        ENUM('announcement','material','assignment','quiz') NOT NULL,
  body        TEXT         NOT NULL,
  attachment  VARCHAR(500) DEFAULT NULL,
  quiz_id     VARCHAR(50)  DEFAULT NULL,
  author      VARCHAR(120) DEFAULT 'Teacher',
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE
);

-- ── MATERIALS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id          VARCHAR(50)  PRIMARY KEY,
  class_id    VARCHAR(50)  NOT NULL,
  teacher_id  VARCHAR(50)  NOT NULL,
  target_section VARCHAR(80) DEFAULT NULL,
  title       VARCHAR(200) NOT NULL,
  type        ENUM('file','link','video') DEFAULT 'file',
  url         VARCHAR(500) DEFAULT '',
  file_name   VARCHAR(200) DEFAULT NULL,
  file_data   LONGTEXT     DEFAULT NULL,   -- base64 for small files
  file_path   VARCHAR(500) DEFAULT NULL,   -- server path for large files
  mime_type   VARCHAR(100) DEFAULT NULL,
  description TEXT         DEFAULT NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ── ASSIGNMENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id           VARCHAR(50)  PRIMARY KEY,
  class_id     VARCHAR(50)  NOT NULL,
  teacher_id   VARCHAR(50)  NOT NULL,
  target_section VARCHAR(80) DEFAULT NULL,
  title        VARCHAR(200) NOT NULL,
  type         ENUM('written','project','lab','oral') DEFAULT 'written',
  instructions TEXT         DEFAULT NULL,
  attach_url   VARCHAR(500) DEFAULT NULL,
  attach_file_name VARCHAR(200) DEFAULT NULL,
  attach_file_path VARCHAR(500) DEFAULT NULL,
  attach_mime  VARCHAR(100) DEFAULT NULL,
  points       INT          DEFAULT 0,
  due_date     DATE         DEFAULT NULL,
  due_time     TIME         DEFAULT NULL,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ── SUBMISSIONS (student submits assignment) ────────────
CREATE TABLE IF NOT EXISTS submissions (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  assignment_id VARCHAR(50) NOT NULL,
  student_id   VARCHAR(50)  NOT NULL,
  class_id     VARCHAR(50)  NOT NULL,
  note         TEXT         DEFAULT NULL,
  link_url     VARCHAR(500) DEFAULT NULL,
  file_name    VARCHAR(200) DEFAULT NULL,
  file_data    LONGTEXT     DEFAULT NULL,
  file_path    VARCHAR(500) DEFAULT NULL,
  mime_type    VARCHAR(100) DEFAULT NULL,
  attachments_json LONGTEXT DEFAULT NULL,
  submitted_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_submission (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id)    REFERENCES users(id) ON DELETE CASCADE
);

-- ── QUIZZES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id           VARCHAR(50)  PRIMARY KEY,
  class_id     VARCHAR(50)  NOT NULL,
  teacher_id   VARCHAR(50)  NOT NULL,
  target_section VARCHAR(80) DEFAULT NULL,
  title        VARCHAR(200) NOT NULL,
  type         ENUM('quiz','exam','activity') DEFAULT 'quiz',
  instructions TEXT         DEFAULT NULL,
  time_limit   INT          DEFAULT 0,
  due_date     DATE         DEFAULT NULL,
  due_time     TIME         DEFAULT NULL,
  attempts     INT          DEFAULT 1,
  shuffle      TINYINT(1)   DEFAULT 0,
  reveal       ENUM('submit','due','never') DEFAULT 'submit',
  questions    LONGTEXT     NOT NULL,  -- JSON array
  total_points INT          DEFAULT 0,
  published    TINYINT(1)   DEFAULT 0,
  published_at DATETIME     DEFAULT NULL,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ── QUIZ SCORES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_scores (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  quiz_id    VARCHAR(50)  NOT NULL,
  student_id VARCHAR(50)  NOT NULL,
  score      INT          NOT NULL DEFAULT 0,
  answers    LONGTEXT     DEFAULT NULL,  -- JSON
  taken_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_score (quiz_id, student_id),
  FOREIGN KEY (quiz_id)    REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id)   ON DELETE CASCADE
);

-- ── QUIZ ACTIVITY LOG ──────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_logs (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  quiz_id     VARCHAR(50)  NOT NULL,
  student_id  VARCHAR(50)  NOT NULL,
  type        VARCHAR(30)  NOT NULL,   -- start, submit, tab-switch, abandon
  detail      TEXT         DEFAULT NULL,
  logged_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- ── RECORDS (daily attendance + grades) ────────────────
CREATE TABLE IF NOT EXISTS records (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  class_id     VARCHAR(50)  NOT NULL,
  student_id   VARCHAR(50)  NOT NULL,
  session_date DATE         NOT NULL,
  attendance   ENUM('Present','Absent','Late') DEFAULT 'Present',
  quiz_grade   DECIMAL(5,2) DEFAULT NULL,
  activity_grade DECIMAL(5,2) DEFAULT NULL,
  midterm_grade  DECIMAL(5,2) DEFAULT NULL,
  final_grade    DECIMAL(5,2) DEFAULT NULL,
  remarks      VARCHAR(300) DEFAULT NULL,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_record (class_id, student_id, session_date),
  FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id)   ON DELETE CASCADE
);

-- ── CALENDAR EVENTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id         VARCHAR(50)  PRIMARY KEY,
  user_id    VARCHAR(50)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  event_date DATE         NOT NULL,
  event_time TIME         DEFAULT NULL,
  notes      TEXT         DEFAULT NULL,
  alarm      INT          DEFAULT NULL,  -- minutes before
  color      VARCHAR(10)  DEFAULT '#7c3aed',
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── NOTEBOOKS (student notes) ──────────────────────────
CREATE TABLE IF NOT EXISTS notebooks (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  content    LONGTEXT     DEFAULT NULL,
  color      VARCHAR(10)  DEFAULT '#7c3aed',
  updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── INVITE CODES (teacher registration) ────────────────
CREATE TABLE IF NOT EXISTS invite_codes (
  code       VARCHAR(30)  PRIMARY KEY,
  created_by VARCHAR(50)  NOT NULL,
  used       TINYINT(1)   DEFAULT 0,
  used_by    VARCHAR(50)  DEFAULT NULL,
  used_at    DATETIME     DEFAULT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- ── ADMIN ANNOUNCEMENTS ────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  author     VARCHAR(120) NOT NULL,
  text       TEXT         NOT NULL,
  type       ENUM('portal','alert','info') DEFAULT 'portal',
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- ── ORG MEMBERSHIPS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_memberships (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(50)  NOT NULL,
  org_id     VARCHAR(50)  NOT NULL,
  joined_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_membership (user_id, org_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── DEFAULT ADMIN ACCOUNT ──────────────────────────────
INSERT IGNORE INTO users (id, password, role, name, section)
VALUES ('admin001', '$2y$10$YourHashedPasswordHere', 'admin', 'Portal Admin', 'Admin Office');
-- Note: Replace the password hash. Generate with: password_hash('CTUDBFOREVER', PASSWORD_DEFAULT)
