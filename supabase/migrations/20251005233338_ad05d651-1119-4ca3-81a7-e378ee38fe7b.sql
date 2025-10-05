-- Add ocr_completed column to workspace_files table
ALTER TABLE workspace_files 
ADD COLUMN IF NOT EXISTS ocr_completed BOOLEAN DEFAULT false;