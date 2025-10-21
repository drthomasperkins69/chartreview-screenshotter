-- Ensure the storage bucket exists for PDFs (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdf-files', 'pdf-files', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies only if they don't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = 'Users can view their own PDFs'
  ) THEN
    CREATE POLICY "Users can view their own PDFs"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'pdf-files' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = 'Users can upload their own PDFs'
  ) THEN
    CREATE POLICY "Users can upload their own PDFs"
    ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'pdf-files' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = 'Users can update their own PDFs'
  ) THEN
    CREATE POLICY "Users can update their own PDFs"
    ON storage.objects
    FOR UPDATE
    USING (bucket_id = 'pdf-files' AND auth.uid()::text = (storage.foldername(name))[1])
    WITH CHECK (bucket_id = 'pdf-files' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = 'Users can delete their own PDFs'
  ) THEN
    CREATE POLICY "Users can delete their own PDFs"
    ON storage.objects
    FOR DELETE
    USING (bucket_id = 'pdf-files' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- Add UPDATE policy for workspace_files so users can update metadata after saving modified PDFs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = 'workspace_files' AND p.policyname = 'Users can update their own files'
  ) THEN
    CREATE POLICY "Users can update their own files"
    ON public.workspace_files
    FOR UPDATE
    USING (uploaded_by = auth.uid())
    WITH CHECK (uploaded_by = auth.uid());
  END IF;
END $$;