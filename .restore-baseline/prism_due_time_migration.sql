-- Run once on existing Prism databases (adds optional due time for quizzes & assignments).
-- Empty due_time still means end of the due date (23:59:59) in API checks.

ALTER TABLE assignments ADD COLUMN due_time TIME NULL DEFAULT NULL AFTER due_date;
ALTER TABLE quizzes ADD COLUMN due_time TIME NULL DEFAULT NULL AFTER due_date;
