-- Create diagnoses table to store diagnosis tracking data
CREATE TABLE public.workspace_diagnoses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.patient_workspaces(id) ON DELETE CASCADE,
  diagnosis_name TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  pages JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {fileId, fileName, pageNum, key}
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workspace_diagnoses ENABLE ROW LEVEL SECURITY;

-- Policies for workspace_diagnoses
CREATE POLICY "Users can view diagnoses in any workspace"
  ON public.workspace_diagnoses FOR SELECT
  USING (true);

CREATE POLICY "Users can create diagnoses in workspaces"
  ON public.workspace_diagnoses FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own diagnoses"
  ON public.workspace_diagnoses FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own diagnoses"
  ON public.workspace_diagnoses FOR DELETE
  USING (created_by = auth.uid());

-- Create index for faster lookups
CREATE INDEX idx_workspace_diagnoses_workspace_id ON public.workspace_diagnoses(workspace_id);

-- Create trigger for updated_at
CREATE TRIGGER update_workspace_diagnoses_updated_at
  BEFORE UPDATE ON public.workspace_diagnoses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();