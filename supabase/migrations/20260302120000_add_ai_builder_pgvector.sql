-- AI builder foundation: threads, memory, usage logs, and pgvector embeddings.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.ai_builder_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('email', 'landing')),
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  model_preference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_builder_threads_user_updated
  ON public.ai_builder_threads(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_builder_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.ai_builder_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('pending', 'complete', 'error')),
  request_id TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_builder_messages_thread_created
  ON public.ai_builder_messages(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_builder_messages_user_created
  ON public.ai_builder_messages(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_builder_thread_memory (
  thread_id UUID PRIMARY KEY REFERENCES public.ai_builder_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL DEFAULT '',
  pinned_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_builder_thread_memory_user_updated
  ON public.ai_builder_thread_memory(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_builder_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.ai_builder_threads(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('email', 'landing')),
  provider TEXT NOT NULL DEFAULT 'openai',
  model_id TEXT NOT NULL DEFAULT '',
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_builder_usage_logs_user_created
  ON public.ai_builder_usage_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_builder_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.ai_builder_threads(id) ON DELETE SET NULL,
  object_type TEXT NOT NULL CHECK (
    object_type IN ('email_template', 'landing_page', 'message', 'draft')
  ),
  object_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  chunk_text TEXT NOT NULL DEFAULT '',
  chunk_hash TEXT NOT NULL DEFAULT '',
  model_key TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  embedding extensions.vector(1536) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_builder_embeddings_dedupe UNIQUE (
    user_id,
    object_type,
    object_id,
    chunk_index,
    model_key,
    chunk_hash
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_builder_embeddings_scope
  ON public.ai_builder_embeddings(user_id, object_type, object_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_builder_embeddings_user_model
  ON public.ai_builder_embeddings(user_id, model_key);

CREATE INDEX IF NOT EXISTS idx_ai_builder_embeddings_hnsw
  ON public.ai_builder_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE public.ai_builder_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_builder_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_builder_thread_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_builder_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_builder_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai builder threads owner access" ON public.ai_builder_threads;
CREATE POLICY "ai builder threads owner access"
  ON public.ai_builder_threads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai builder messages owner access" ON public.ai_builder_messages;
CREATE POLICY "ai builder messages owner access"
  ON public.ai_builder_messages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai builder memory owner access" ON public.ai_builder_thread_memory;
CREATE POLICY "ai builder memory owner access"
  ON public.ai_builder_thread_memory
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai builder usage owner access" ON public.ai_builder_usage_logs;
CREATE POLICY "ai builder usage owner access"
  ON public.ai_builder_usage_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai builder embeddings owner access" ON public.ai_builder_embeddings;
CREATE POLICY "ai builder embeddings owner access"
  ON public.ai_builder_embeddings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_ai_builder_threads_updated_at ON public.ai_builder_threads;
CREATE TRIGGER update_ai_builder_threads_updated_at
BEFORE UPDATE ON public.ai_builder_threads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_builder_thread_memory_updated_at ON public.ai_builder_thread_memory;
CREATE TRIGGER update_ai_builder_thread_memory_updated_at
BEFORE UPDATE ON public.ai_builder_thread_memory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

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
