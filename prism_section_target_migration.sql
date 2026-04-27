-- Run once in phpMyAdmin or: mysql -u root -p prism_db < prism_section_target_migration.sql
-- Scopes materials, assignments, quizzes, and stream posts to a section (or all).

USE prism_db;

ALTER TABLE materials
  ADD COLUMN target_section VARCHAR(80) NULL DEFAULT NULL AFTER teacher_id;

ALTER TABLE assignments
  ADD COLUMN target_section VARCHAR(80) NULL DEFAULT NULL AFTER teacher_id;

ALTER TABLE quizzes
  ADD COLUMN target_section VARCHAR(80) NULL DEFAULT NULL AFTER teacher_id;

ALTER TABLE posts
  ADD COLUMN target_section VARCHAR(80) NULL DEFAULT NULL AFTER teacher_id;
