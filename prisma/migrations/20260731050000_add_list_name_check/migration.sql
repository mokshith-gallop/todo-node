-- Defense-in-depth: prevent blank list names at the database level
-- Mirrors the existing ck_task_title_not_blank constraint on the task table
ALTER TABLE "task_list"
  ADD CONSTRAINT "ck_task_list_name_not_blank"
  CHECK (trim(name) <> '');
