
-- Ensure the `email_lists` table exists for prospect lists
CREATE TABLE IF NOT EXISTS public.email_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure the `prospects` table has an id and user_id
-- (Table already exists, validated from schema)

-- Table for linking prospects to email lists (many-to-many)
CREATE TABLE IF NOT EXISTS public.email_list_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.email_lists(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add email_list_id to campaigns for referencing an email list
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS email_list_id UUID REFERENCES public.email_lists(id);

-- RLS policy example, allow users to manage their own lists
ALTER TABLE public.email_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own lists"
  ON public.email_lists
  USING (user_id = auth.uid());

ALTER TABLE public.email_list_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage prospects in their own lists"
  ON public.email_list_prospects
  USING (
    list_id IN (SELECT id FROM public.email_lists WHERE user_id = auth.uid())
  );

