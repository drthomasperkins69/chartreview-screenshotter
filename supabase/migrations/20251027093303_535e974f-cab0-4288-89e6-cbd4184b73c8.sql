-- Fix RLS policy for workspace_diagnoses to restrict access to workspace owners
DROP POLICY IF EXISTS "Users can view diagnoses in any workspace" ON workspace_diagnoses;

CREATE POLICY "Users can view diagnoses in their workspaces"
  ON workspace_diagnoses FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM patient_workspaces WHERE created_by = auth.uid()
    )
  );

-- Fix RLS policy for patient_workspaces to restrict to owners
DROP POLICY IF EXISTS "Authenticated users can view workspaces" ON patient_workspaces;

CREATE POLICY "Users can view own workspaces"
  ON patient_workspaces FOR SELECT
  USING (created_by = auth.uid());

-- Fix RLS policy for workspace_files to restrict to workspace owners
DROP POLICY IF EXISTS "Users can view files in any workspace" ON workspace_files;

CREATE POLICY "Users can view files in their workspaces"
  ON workspace_files FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM patient_workspaces WHERE created_by = auth.uid()
    )
  );

-- Fix RLS policies for file_pages to restrict to file owners
DROP POLICY IF EXISTS "Users can view pages" ON file_pages;
DROP POLICY IF EXISTS "Users can insert pages" ON file_pages;
DROP POLICY IF EXISTS "Users can update pages" ON file_pages;

CREATE POLICY "Users can view pages in their files"
  ON file_pages FOR SELECT
  USING (
    file_id IN (
      SELECT wf.id FROM workspace_files wf
      JOIN patient_workspaces pw ON pw.id = wf.workspace_id
      WHERE pw.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert pages for their files"
  ON file_pages FOR INSERT
  WITH CHECK (
    file_id IN (
      SELECT wf.id FROM workspace_files wf
      JOIN patient_workspaces pw ON pw.id = wf.workspace_id
      WHERE pw.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update pages in their files"
  ON file_pages FOR UPDATE
  USING (
    file_id IN (
      SELECT wf.id FROM workspace_files wf
      JOIN patient_workspaces pw ON pw.id = wf.workspace_id
      WHERE pw.created_by = auth.uid()
    )
  );

-- Fix RLS policy for page_diagnoses to restrict to owners
DROP POLICY IF EXISTS "Users can view diagnoses" ON page_diagnoses;

CREATE POLICY "Users can view their own diagnoses"
  ON page_diagnoses FOR SELECT
  USING (
    page_id IN (
      SELECT fp.id FROM file_pages fp
      JOIN workspace_files wf ON wf.id = fp.file_id
      JOIN patient_workspaces pw ON pw.id = wf.workspace_id
      WHERE pw.created_by = auth.uid()
    )
  );

-- Fix RLS policies for keyword_matches to restrict to owners
DROP POLICY IF EXISTS "Users can view keyword matches" ON keyword_matches;
DROP POLICY IF EXISTS "Users can create keyword matches" ON keyword_matches;

CREATE POLICY "Users can view matches for their pages"
  ON keyword_matches FOR SELECT
  USING (
    page_id IN (
      SELECT fp.id FROM file_pages fp
      JOIN workspace_files wf ON wf.id = fp.file_id
      JOIN patient_workspaces pw ON pw.id = wf.workspace_id
      WHERE pw.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create matches for their pages"
  ON keyword_matches FOR INSERT
  WITH CHECK (
    page_id IN (
      SELECT fp.id FROM file_pages fp
      JOIN workspace_files wf ON wf.id = fp.file_id
      JOIN patient_workspaces pw ON pw.id = wf.workspace_id
      WHERE pw.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete matches for their pages"
  ON keyword_matches FOR DELETE
  USING (
    page_id IN (
      SELECT fp.id FROM file_pages fp
      JOIN workspace_files wf ON wf.id = fp.file_id
      JOIN patient_workspaces pw ON pw.id = wf.workspace_id
      WHERE pw.created_by = auth.uid()
    )
  );