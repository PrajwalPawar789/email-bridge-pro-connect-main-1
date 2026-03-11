UPDATE public.billing_plans
SET
  mailbox_limit = CASE id
    WHEN 'free' THEN 1
    WHEN 'growth' THEN 5
    WHEN 'scale' THEN 50
    WHEN 'enterprise' THEN NULL
    ELSE mailbox_limit
  END,
  updated_at = now()
WHERE id IN ('free', 'growth', 'scale', 'enterprise')
  AND mailbox_limit IS DISTINCT FROM CASE id
    WHEN 'free' THEN 1
    WHEN 'growth' THEN 5
    WHEN 'scale' THEN 50
    WHEN 'enterprise' THEN NULL
    ELSE mailbox_limit
  END;
