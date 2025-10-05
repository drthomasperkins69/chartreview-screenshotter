-- Allow anyone to update search category terms
CREATE POLICY "Anyone can update search category terms"
ON public.search_categories
FOR UPDATE
USING (true)
WITH CHECK (true);