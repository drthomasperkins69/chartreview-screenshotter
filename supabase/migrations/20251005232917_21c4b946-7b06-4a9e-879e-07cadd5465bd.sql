-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table for document embeddings
CREATE TABLE IF NOT EXISTS public.document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL,
  page_number INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT fk_file FOREIGN KEY (file_id) REFERENCES workspace_files(id) ON DELETE CASCADE
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx ON public.document_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index for file lookups
CREATE INDEX IF NOT EXISTS document_embeddings_file_id_idx ON public.document_embeddings(file_id);

-- Enable RLS
ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view all embeddings"
  ON public.document_embeddings
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert embeddings"
  ON public.document_embeddings
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete embeddings"
  ON public.document_embeddings
  FOR DELETE
  USING (true);