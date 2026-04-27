-- Run once: teacher assignment attachments + student link/multi-file submissions.

ALTER TABLE assignments
  ADD COLUMN attach_url VARCHAR(500) DEFAULT NULL AFTER instructions,
  ADD COLUMN attach_file_name VARCHAR(200) DEFAULT NULL AFTER attach_url,
  ADD COLUMN attach_file_path VARCHAR(500) DEFAULT NULL AFTER attach_file_name,
  ADD COLUMN attach_mime VARCHAR(100) DEFAULT NULL AFTER attach_file_path;

ALTER TABLE submissions
  ADD COLUMN link_url VARCHAR(500) DEFAULT NULL AFTER note,
  ADD COLUMN attachments_json LONGTEXT DEFAULT NULL AFTER mime_type;
