-- Make owner columns NOT NULL with defaults to prevent orphaned records

-- patient_workspaces table
ALTER TABLE patient_workspaces 
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- workspace_diagnoses table
ALTER TABLE workspace_diagnoses 
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- workspace_files table
ALTER TABLE workspace_files 
  ALTER COLUMN uploaded_by SET NOT NULL,
  ALTER COLUMN uploaded_by SET DEFAULT auth.uid();