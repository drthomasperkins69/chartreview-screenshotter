-- Update match_documents function to accept file IDs filter
DROP FUNCTION IF EXISTS match_documents(vector, float, int);

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  file_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  file_id uuid,
  page_number int,
  chunk_index int,
  content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_embeddings.id,
    document_embeddings.file_id,
    document_embeddings.page_number,
    document_embeddings.chunk_index,
    document_embeddings.content,
    1 - (document_embeddings.embedding <=> query_embedding) as similarity
  FROM document_embeddings
  WHERE 1 - (document_embeddings.embedding <=> query_embedding) > match_threshold
    AND (file_ids IS NULL OR document_embeddings.file_id = ANY(file_ids))
  ORDER BY document_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;