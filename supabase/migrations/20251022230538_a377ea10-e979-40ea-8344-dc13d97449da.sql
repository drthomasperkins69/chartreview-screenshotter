-- Create table for chart review section instructions
CREATE TABLE public.chart_review_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id text NOT NULL,
  instruction text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, section_id)
);

-- Enable RLS
ALTER TABLE public.chart_review_sections ENABLE ROW LEVEL SECURITY;

-- Users can view their own instructions
CREATE POLICY "Users can view their own instructions"
ON public.chart_review_sections
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own instructions
CREATE POLICY "Users can insert their own instructions"
ON public.chart_review_sections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own instructions
CREATE POLICY "Users can update their own instructions"
ON public.chart_review_sections
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own instructions
CREATE POLICY "Users can delete their own instructions"
ON public.chart_review_sections
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_chart_review_sections_updated_at
BEFORE UPDATE ON public.chart_review_sections
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();