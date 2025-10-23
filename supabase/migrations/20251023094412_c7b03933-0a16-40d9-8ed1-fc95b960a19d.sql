-- Create reference_documents table for global reference materials
CREATE TABLE public.reference_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  page_count INTEGER,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.reference_documents ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read reference documents
CREATE POLICY "Anyone can view active reference documents"
ON public.reference_documents
FOR SELECT
TO authenticated
USING (is_active = true);

-- Policy: Only admins can insert reference documents
CREATE POLICY "Admins can insert reference documents"
ON public.reference_documents
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Policy: Only admins can update reference documents
CREATE POLICY "Admins can update reference documents"
ON public.reference_documents
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Policy: Only admins can delete reference documents
CREATE POLICY "Admins can delete reference documents"
ON public.reference_documents
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_reference_documents_updated_at
BEFORE UPDATE ON public.reference_documents
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add a flag to document_embeddings to mark reference document embeddings
ALTER TABLE public.document_embeddings
ADD COLUMN is_reference BOOLEAN DEFAULT false;

-- Create index for faster reference document queries
CREATE INDEX idx_document_embeddings_reference ON public.document_embeddings(is_reference) WHERE is_reference = true;