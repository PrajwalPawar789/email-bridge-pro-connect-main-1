-- Segments feature foundation: schema, matching helpers, preview/query functions,
-- campaign linkage, and automation enrollment compatibility.

CREATE TABLE IF NOT EXISTS public.contact_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source_list_id UUID REFERENCES public.email_lists(id) ON DELETE SET NULL,
  match_type TEXT NOT NULL DEFAULT 'all' CHECK (match_type IN ('all', 'any')),
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclusion_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES public.contact_segments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contact_segments_user_updated_at
  ON public.contact_segments(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_segments_source_list
  ON public.contact_segments(source_list_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_segment_id
  ON public.campaigns(segment_id);
CREATE INDEX IF NOT EXISTS idx_email_list_prospects_list_prospect
  ON public.email_list_prospects(list_id, prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_list_prospects_prospect_list
  ON public.email_list_prospects(prospect_id, list_id);
CREATE INDEX IF NOT EXISTS idx_recipients_email_lower
  ON public.recipients((lower(trim(email))));

ALTER TABLE public.contact_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own contact segments" ON public.contact_segments;
CREATE POLICY "Users can view own contact segments"
  ON public.contact_segments
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own contact segments" ON public.contact_segments;
CREATE POLICY "Users can insert own contact segments"
  ON public.contact_segments
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own contact segments" ON public.contact_segments;
CREATE POLICY "Users can update own contact segments"
  ON public.contact_segments
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own contact segments" ON public.contact_segments;
CREATE POLICY "Users can delete own contact segments"
  ON public.contact_segments
  FOR DELETE
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_contact_segments_updated_at ON public.contact_segments;
CREATE TRIGGER update_contact_segments_updated_at
BEFORE UPDATE ON public.contact_segments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.segment_text_operator_match(
  p_left TEXT,
  p_operator TEXT,
  p_value TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_left TEXT := lower(trim(COALESCE(p_left, '')));
  v_operator TEXT := lower(trim(COALESCE(p_operator, 'contains')));
  v_value TEXT := lower(trim(COALESCE(p_value, '')));
BEGIN
  CASE v_operator
    WHEN 'equals' THEN
      RETURN v_left = v_value;
    WHEN 'not_equals' THEN
      RETURN v_left <> v_value;
    WHEN 'contains' THEN
      RETURN v_left LIKE '%' || v_value || '%';
    WHEN 'not_contains' THEN
      RETURN v_left NOT LIKE '%' || v_value || '%';
    WHEN 'starts_with' THEN
      RETURN v_left LIKE v_value || '%';
    WHEN 'ends_with' THEN
      RETURN v_left LIKE '%' || v_value;
    WHEN 'is_empty' THEN
      RETURN v_left = '';
    WHEN 'is_not_empty' THEN
      RETURN v_left <> '';
    ELSE
      RETURN v_left LIKE '%' || v_value || '%';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.segment_condition_matches(
  p_user_id UUID,
  p_prospect public.prospects,
  p_condition JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_field TEXT := lower(trim(COALESCE(p_condition->>'field', '')));
  v_operator TEXT := lower(trim(COALESCE(p_condition->>'operator', 'contains')));
  v_value TEXT := COALESCE(p_condition->>'value', '');
  v_source TEXT := '';
  v_lookback_days INTEGER := 0;
  v_has_event BOOLEAN := FALSE;
  v_positive BOOLEAN := TRUE;
BEGIN
  IF v_field = '' THEN
    RETURN TRUE;
  END IF;

  BEGIN
    v_lookback_days := GREATEST(
      COALESCE(
        NULLIF(p_condition->>'lookback_days', '')::INTEGER,
        NULLIF(p_condition->>'lookbackDays', '')::INTEGER,
        0
      ),
      0
    );
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_lookback_days := 0;
  END;

  IF v_field = 'name' THEN
    v_source := p_prospect.name;
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'email' THEN
    v_source := p_prospect.email;
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'email_domain' THEN
    v_source := split_part(lower(COALESCE(p_prospect.email, '')), '@', 2);
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'company' THEN
    v_source := p_prospect.company;
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'job_title' THEN
    v_source := p_prospect.job_title;
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'country' THEN
    v_source := p_prospect.country;
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'industry' THEN
    v_source := p_prospect.industry;
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'sender_email' THEN
    v_source := p_prospect.sender_email;
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'sender_name' THEN
    v_source := p_prospect.sender_name;
    RETURN public.segment_text_operator_match(v_source, v_operator, v_value);
  ELSIF v_field = 'list_id' THEN
    IF NULLIF(trim(v_value), '') IS NULL THEN
      RETURN TRUE;
    END IF;

    IF v_operator IN ('not_in_list', 'is_not_in_list') THEN
      RETURN NOT EXISTS (
        SELECT 1
        FROM public.email_list_prospects elp
        WHERE elp.prospect_id = p_prospect.id
          AND lower(elp.list_id::TEXT) = lower(v_value)
      );
    END IF;

    RETURN EXISTS (
      SELECT 1
      FROM public.email_list_prospects elp
      WHERE elp.prospect_id = p_prospect.id
        AND lower(elp.list_id::TEXT) = lower(v_value)
    );
  ELSIF v_field IN ('has_opened', 'has_clicked', 'has_replied', 'has_bounced') THEN
    v_positive := v_operator NOT IN ('has_not', 'is_false', 'false', 'not', 'no');

    IF NULLIF(trim(COALESCE(p_prospect.email, '')), '') IS NULL THEN
      RETURN CASE WHEN v_positive THEN FALSE ELSE TRUE END;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.recipients r
      JOIN public.campaigns c ON c.id = r.campaign_id
      WHERE c.user_id = p_user_id
        AND lower(trim(r.email)) = lower(trim(p_prospect.email))
        AND (
          (v_field = 'has_opened' AND r.opened_at IS NOT NULL)
          OR (v_field = 'has_clicked' AND r.clicked_at IS NOT NULL)
          OR (v_field = 'has_replied' AND COALESCE(r.replied, FALSE) = TRUE)
          OR (v_field = 'has_bounced' AND COALESCE(r.bounced, FALSE) = TRUE)
        )
        AND (
          v_lookback_days <= 0
          OR (
            CASE
              WHEN v_field = 'has_opened' THEN r.opened_at
              WHEN v_field = 'has_clicked' THEN r.clicked_at
              WHEN v_field = 'has_bounced' THEN COALESCE(r.bounced_at, r.last_email_sent_at)
              ELSE r.last_email_sent_at
            END
          ) >= now() - make_interval(days => v_lookback_days)
        )
    ) INTO v_has_event;

    RETURN CASE WHEN v_positive THEN v_has_event ELSE NOT v_has_event END;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.segment_matches_filters(
  p_user_id UUID,
  p_prospect public.prospects,
  p_source_list_id UUID,
  p_match_type TEXT,
  p_conditions JSONB,
  p_exclusion_conditions JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_match_type TEXT := lower(trim(COALESCE(p_match_type, 'all')));
  v_conditions JSONB := CASE WHEN jsonb_typeof(p_conditions) = 'array' THEN p_conditions ELSE '[]'::jsonb END;
  v_exclusions JSONB := CASE WHEN jsonb_typeof(p_exclusion_conditions) = 'array' THEN p_exclusion_conditions ELSE '[]'::jsonb END;
  v_include_match BOOLEAN := TRUE;
  v_exclusion_hit BOOLEAN := FALSE;
BEGIN
  IF p_source_list_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.email_list_prospects elp
      WHERE elp.prospect_id = p_prospect.id
        AND elp.list_id = p_source_list_id
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF jsonb_array_length(v_conditions) > 0 THEN
    IF v_match_type = 'any' THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_conditions) AS cond
        WHERE public.segment_condition_matches(p_user_id, p_prospect, cond)
      ) INTO v_include_match;
    ELSE
      SELECT NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_conditions) AS cond
        WHERE NOT public.segment_condition_matches(p_user_id, p_prospect, cond)
      ) INTO v_include_match;
    END IF;
  END IF;

  IF NOT v_include_match THEN
    RETURN FALSE;
  END IF;

  IF jsonb_array_length(v_exclusions) > 0 THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_exclusions) AS cond
      WHERE public.segment_condition_matches(p_user_id, p_prospect, cond)
    ) INTO v_exclusion_hit;
  END IF;

  RETURN NOT v_exclusion_hit;
END;
$$;

DROP FUNCTION IF EXISTS public.preview_segment_count(UUID, TEXT, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.preview_segment_count(
  p_source_list_id UUID DEFAULT NULL,
  p_match_type TEXT DEFAULT 'all',
  p_conditions JSONB DEFAULT '[]'::jsonb,
  p_exclusion_conditions JSONB DEFAULT '[]'::jsonb,
  p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_owner UUID := NULL;
  v_total INTEGER := 0;
BEGIN
  IF v_actor IS NULL AND p_user_id IS NULL AND NOT public.is_service_role() THEN
    RETURN 0;
  END IF;

  v_owner := COALESCE(v_actor, p_user_id);
  IF v_owner IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
  INTO v_total
  FROM public.prospects p
  WHERE p.user_id = v_owner
    AND p.email IS NOT NULL
    AND length(trim(p.email)) > 3
    AND public.segment_matches_filters(
      v_owner,
      p,
      p_source_list_id,
      p_match_type,
      p_conditions,
      p_exclusion_conditions
    );

  RETURN COALESCE(v_total, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.segment_match_count(
  p_segment_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_segment public.contact_segments%ROWTYPE;
BEGIN
  IF v_actor IS NULL AND NOT public.is_service_role() THEN
    RETURN 0;
  END IF;

  SELECT *
  INTO v_segment
  FROM public.contact_segments cs
  WHERE cs.id = p_segment_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_actor IS NOT NULL AND v_segment.user_id <> v_actor AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to access this segment';
  END IF;

  RETURN public.preview_segment_count(
    v_segment.source_list_id,
    v_segment.match_type,
    v_segment.conditions,
    v_segment.exclusion_conditions,
    v_segment.user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_segment_prospects(
  p_segment_id UUID,
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  prospect_id UUID,
  email TEXT,
  full_name TEXT,
  company TEXT,
  job_title TEXT,
  country TEXT,
  industry TEXT,
  sender_name TEXT,
  sender_email TEXT,
  source_list_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_segment public.contact_segments%ROWTYPE;
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 1000), 10000));
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_actor IS NULL AND NOT public.is_service_role() THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_segment
  FROM public.contact_segments cs
  WHERE cs.id = p_segment_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_actor IS NOT NULL AND v_segment.user_id <> v_actor AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to access this segment';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS prospect_id,
    lower(trim(p.email)) AS email,
    NULLIF(trim(p.name), '') AS full_name,
    p.company,
    p.job_title,
    p.country,
    p.industry,
    p.sender_name,
    p.sender_email,
    v_segment.source_list_id,
    p.created_at
  FROM public.prospects p
  WHERE p.user_id = v_segment.user_id
    AND p.email IS NOT NULL
    AND length(trim(p.email)) > 3
    AND public.segment_matches_filters(
      v_segment.user_id,
      p,
      v_segment.source_list_id,
      v_segment.match_type,
      v_segment.conditions,
      v_segment.exclusion_conditions
    )
  ORDER BY p.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.enroll_workflow_contacts(
  p_workflow_id UUID,
  p_limit INTEGER DEFAULT 200
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_workflow public.automation_workflows%ROWTYPE;
  v_inserted INTEGER := 0;
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 200), 2000));
  v_segment_id UUID := NULL;
BEGIN
  SELECT *
  INTO v_workflow
  FROM public.automation_workflows aw
  WHERE aw.id = p_workflow_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> v_workflow.user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to enroll contacts for another user workflow';
  END IF;

  IF v_workflow.trigger_type <> 'list_joined' THEN
    RETURN 0;
  END IF;

  BEGIN
    v_segment_id := NULLIF(trim(COALESCE(v_workflow.trigger_filters->>'segment_id', '')), '')::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_segment_id := NULL;
  END;

  IF v_segment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.contact_segments cs
      WHERE cs.id = v_segment_id
        AND cs.user_id = v_workflow.user_id
    ) THEN
      v_segment_id := NULL;
    END IF;
  END IF;

  IF v_workflow.trigger_list_id IS NULL AND v_segment_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH candidates AS (
    SELECT DISTINCT ON (lower(trim(raw.email)))
      raw.prospect_id,
      lower(trim(raw.email)) AS email,
      NULLIF(trim(raw.full_name), '') AS full_name,
      raw.company,
      raw.job_title,
      raw.source_list_id
    FROM (
      SELECT
        sp.prospect_id,
        sp.email,
        sp.full_name,
        sp.company,
        sp.job_title,
        COALESCE(sp.source_list_id, v_workflow.trigger_list_id) AS source_list_id
      FROM public.fetch_segment_prospects(v_segment_id, v_limit, 0) sp
      WHERE v_segment_id IS NOT NULL

      UNION ALL

      SELECT
        p.id AS prospect_id,
        p.email,
        p.name AS full_name,
        p.company,
        p.job_title,
        v_workflow.trigger_list_id AS source_list_id
      FROM public.email_list_prospects elp
      JOIN public.prospects p ON p.id = elp.prospect_id
      WHERE v_segment_id IS NULL
        AND v_workflow.trigger_list_id IS NOT NULL
        AND elp.list_id = v_workflow.trigger_list_id
        AND p.user_id = v_workflow.user_id
    ) AS raw
    WHERE raw.email IS NOT NULL
      AND length(trim(raw.email)) > 3
    ORDER BY lower(trim(raw.email)), raw.prospect_id
    LIMIT v_limit
  ),
  inserted AS (
    INSERT INTO public.automation_contacts (
      workflow_id,
      user_id,
      prospect_id,
      email,
      full_name,
      source_list_id,
      status,
      current_step,
      next_run_at,
      state
    )
    SELECT
      v_workflow.id,
      v_workflow.user_id,
      c.prospect_id,
      c.email,
      c.full_name,
      c.source_list_id,
      'active',
      0,
      now(),
      jsonb_strip_nulls(
        jsonb_build_object(
          'company', c.company,
          'job_title', c.job_title,
          'segment_id', v_segment_id
        )
      )
    FROM candidates c
    ON CONFLICT (workflow_id, email)
    DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN COALESCE(v_inserted, 0);
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_segments TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segment_text_operator_match(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segment_condition_matches(UUID, public.prospects, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segment_matches_filters(UUID, public.prospects, UUID, TEXT, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_segment_count(UUID, TEXT, JSONB, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segment_match_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_segment_prospects(UUID, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enroll_workflow_contacts(UUID, INTEGER) TO authenticated, service_role;
