-- One-time upgrades for a database created before these columns existed.
-- A new database should use prism_database.sql instead. Skip any statement
-- that reports the column is already there.
-- Roster registration is separate: prism_student_roster_migration.sql

USE prism_db;

-- Section targeting for materials, assignments, quizzes, and stream posts.
ALTER TABLE materials ADD COLUMN target_section VARCHAR(80) NULL DEFAULT NULL AFTER teacher_id;
ALTER TABLE assignments ADD COLUMN target_section VARCHAR(80) NULL DEFAULT NULL AFTER teacher_id;
ALTER TABLE quizzes ADD COLUMN target_section VARCHAR(80) NULL DEFAULT NULL AFTER teacher_id;
ALTER TABLE posts ADD COLUMN target_section VARCHAR(80) NULL DEFAULT NULL AFTER teacher_id;

-- Optional due time. Empty still means the end of the due date.
ALTER TABLE assignments ADD COLUMN due_time TIME NULL DEFAULT NULL AFTER due_date;
ALTER TABLE quizzes ADD COLUMN due_time TIME NULL DEFAULT NULL AFTER due_date;

-- Assignment attachments and student submission links.
ALTER TABLE assignments
  ADD COLUMN attach_url VARCHAR(500) DEFAULT NULL AFTER instructions,
  ADD COLUMN attach_file_name VARCHAR(200) DEFAULT NULL AFTER attach_url,
  ADD COLUMN attach_file_path VARCHAR(500) DEFAULT NULL AFTER attach_file_name,
  ADD COLUMN attach_mime VARCHAR(100) DEFAULT NULL AFTER attach_file_path;

ALTER TABLE submissions
  ADD COLUMN link_url VARCHAR(500) DEFAULT NULL AFTER note,
  ADD COLUMN attachments_json LONGTEXT DEFAULT NULL AFTER mime_type;
