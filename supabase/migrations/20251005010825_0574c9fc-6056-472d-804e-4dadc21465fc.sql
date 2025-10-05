-- Create search categories table
CREATE TABLE public.search_categories (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  terms TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.search_categories ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read (public access)
CREATE POLICY "Anyone can view search categories"
ON public.search_categories
FOR SELECT
USING (true);

-- No INSERT/UPDATE/DELETE policies - only accessible via backend
-- This means categories can only be modified through the Lovable Cloud backend interface

-- Insert the initial Lumbar category
INSERT INTO public.search_categories (id, label, terms)
VALUES (1, 'Lumbar', '');

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_search_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_search_categories_updated_at
BEFORE UPDATE ON public.search_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_search_categories_updated_at();