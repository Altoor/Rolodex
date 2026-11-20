ALTER TABLE "appSettings" ADD COLUMN "maxParallelTasks" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "canRunInParallel" bool DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "tasks"
SET "canRunInParallel" = false
WHERE "type" IN ('decision', 'textPrompt')
  OR (
    "type" = 'tool'
    AND "toolKey" IN (
      'prompt',
      'model_selector',
      'find_todo',
      'find_todos',
      'create_todo',
      'update_todo',
      'mark_todo_done',
      'archive_todo',
      'delete_todo',
      'find_file',
      'find_files',
      'find_folder',
      'find_folders',
      'scan_files',
      'create_file',
      'create_folder',
      'update_file_metadata',
      'move_files',
      'delete_file_entry',
      'detect_file_type',
      'read_plaintext_file',
      'read_text_file',
      'read_image_file',
      'read_audio_file',
      'read_video_file',
      'read_other_file'
    )
  );