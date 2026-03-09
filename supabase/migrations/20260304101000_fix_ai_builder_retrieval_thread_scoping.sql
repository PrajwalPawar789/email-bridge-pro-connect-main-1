-- Ensure pgvector retrieval can scope by thread for both existing and new rows.

UPDATE public.ai_builder_embeddings
SET metadata = jsonb_set(
  jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{thread_id}',
    to_jsonb(thread_id::text),
    true
  ),
  '{threadId}',
  to_jsonb(thread_id::text),
  true
)
WHERE thread_id IS NOT NULL
  AND (
    COALESCE(metadata->>'thread_id', '') = ''
    OR COALESCE(metadata->>'threadId', '') = ''
  );

DROP FUNCTION IF EXISTS public.match_ai_builder_embeddings(
  extensions.vector(1536),
  UUID,
  TEXT,
  INTEGER
);

CREATE OR REPLACE FUNCTION public.match_ai_builder_embeddings (
  query_embedding extensions.vector(1536),
  match_user_id UUID,
  match_object_type TEXT DEFAULT NULL,
  match_count INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  object_type TEXT,
  object_id UUID,
  chunk_index INTEGER,
  chunk_text TEXT,
  thread_id UUID,
  metadata JSONB,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    e.object_type,
    e.object_id,
    e.chunk_index,
    e.chunk_text,
    e.thread_id,
    e.metadata,
    (1.0 / (1.0 + (e.embedding OPERATOR(extensions.<->) query_embedding))) AS similarity
  FROM public.ai_builder_embeddings e
  WHERE e.user_id = match_user_id
    AND (
      match_object_type IS NULL
      OR btrim(match_object_type) = ''
      OR e.object_type = match_object_type
    )
  ORDER BY e.embedding OPERATOR(extensions.<->) query_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(match_count, 8), 25));
$$;
