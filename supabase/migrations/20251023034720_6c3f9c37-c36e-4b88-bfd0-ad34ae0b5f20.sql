-- Create table for diagnosis form instructions
CREATE TABLE IF NOT EXISTS public.diagnosis_form_instructions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  diagnosis_id UUID NOT NULL,
  instruction TEXT NOT NULL DEFAULT 'Generate a comprehensive diagnosis form based on the medical records for this diagnosis.',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.diagnosis_form_instructions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own instructions"
  ON public.diagnosis_form_instructions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own instructions"
  ON public.diagnosis_form_instructions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own instructions"
  ON public.diagnosis_form_instructions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own instructions"
  ON public.diagnosis_form_instructions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER handle_diagnosis_form_instructions_updated_at
  BEFORE UPDATE ON public.diagnosis_form_instructions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();