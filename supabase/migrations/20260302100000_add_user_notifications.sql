-- In-app notifications for user-facing account and campaign events.

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'system' CHECK (category IN ('billing', 'campaign', 'system', 'account')),
  title TEXT NOT NULL,
  message TEXT,
  action_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created_at
  ON public.user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON public.user_notifications(user_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.user_notifications;
CREATE POLICY "Users can view own notifications"
  ON public.user_notifications
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.user_notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.user_notifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
  ON public.user_notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.user_notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.user_notifications
  FOR DELETE
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_user_notification(
  p_user_id UUID,
  p_event_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'system',
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_notification_id UUID;
  v_category TEXT := lower(COALESCE(p_category, 'system'));
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF COALESCE(trim(p_event_type), '') = '' THEN
    RAISE EXCEPTION 'Event type is required';
  END IF;

  IF COALESCE(trim(p_title), '') = '' THEN
    RAISE EXCEPTION 'Notification title is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to create notifications for another user';
  END IF;

  IF v_category NOT IN ('billing', 'campaign', 'system', 'account') THEN
    v_category := 'system';
  END IF;

  INSERT INTO public.user_notifications (
    user_id,
    event_type,
    category,
    title,
    message,
    action_url,
    metadata
  )
  VALUES (
    p_user_id,
    trim(p_event_type),
    v_category,
    trim(p_title),
    NULLIF(trim(COALESCE(p_message, '')), ''),
    NULLIF(trim(COALESCE(p_action_url, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_user_notifications_read(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_updated_count INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to update another user notifications';
  END IF;

  UPDATE public.user_notifications
  SET read_at = now()
  WHERE user_id = p_user_id
    AND read_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_user_subscription_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_name TEXT;
  v_period_end_label TEXT;
BEGIN
  SELECT bp.name
  INTO v_plan_name
  FROM public.billing_plans bp
  WHERE bp.id = NEW.plan_id;

  v_plan_name := COALESCE(v_plan_name, initcap(COALESCE(NEW.plan_id, 'plan')));
  v_period_end_label := to_char(NEW.current_period_end AT TIME ZONE 'UTC', 'Mon DD, YYYY');

  IF TG_OP = 'INSERT' THEN
    IF lower(COALESCE(NEW.status, '')) IN ('active', 'trialing') THEN
      PERFORM public.create_user_notification(
        NEW.user_id,
        'subscription_started',
        'Subscription started',
        format(
          'Your %s plan is active with %s billing. Current period ends on %s.',
          v_plan_name,
          lower(COALESCE(NEW.billing_cycle, 'monthly')),
          v_period_end_label
        ),
        'billing',
        '/subscription',
        jsonb_build_object(
          'subscription_id', NEW.id,
          'plan_id', NEW.plan_id,
          'billing_cycle', NEW.billing_cycle,
          'status', NEW.status,
          'current_period_end', NEW.current_period_end
        )
      );
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
    OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
  THEN
    PERFORM public.create_user_notification(
      NEW.user_id,
      'subscription_updated',
      'Subscription updated',
      format(
        'You are now on %s with %s billing.',
        v_plan_name,
        lower(COALESCE(NEW.billing_cycle, 'monthly'))
      ),
      'billing',
      '/subscription',
      jsonb_build_object(
        'subscription_id', NEW.id,
        'old_plan_id', OLD.plan_id,
        'new_plan_id', NEW.plan_id,
        'old_billing_cycle', OLD.billing_cycle,
        'new_billing_cycle', NEW.billing_cycle
      )
    );
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE lower(COALESCE(NEW.status, ''))
      WHEN 'past_due' THEN
        PERFORM public.create_user_notification(
          NEW.user_id,
          'subscription_past_due',
          'Payment issue detected',
          'Your subscription payment is past due. Update your billing details to avoid interruption.',
          'billing',
          '/billing',
          jsonb_build_object(
            'subscription_id', NEW.id,
            'old_status', OLD.status,
            'new_status', NEW.status
          )
        );
      WHEN 'canceled' THEN
        PERFORM public.create_user_notification(
          NEW.user_id,
          'subscription_canceled',
          'Subscription canceled',
          'Your subscription has been canceled. You can reactivate any time from the subscription page.',
          'billing',
          '/subscription',
          jsonb_build_object(
            'subscription_id', NEW.id,
            'old_status', OLD.status,
            'new_status', NEW.status
          )
        );
      WHEN 'expired' THEN
        PERFORM public.create_user_notification(
          NEW.user_id,
          'subscription_expired',
          'Subscription expired',
          'Your current subscription period expired. Renew to restore full plan limits.',
          'billing',
          '/subscription',
          jsonb_build_object(
            'subscription_id', NEW.id,
            'old_status', OLD.status,
            'new_status', NEW.status
          )
        );
      WHEN 'active' THEN
        IF lower(COALESCE(OLD.status, '')) NOT IN ('active', 'trialing') THEN
          PERFORM public.create_user_notification(
            NEW.user_id,
            'subscription_reactivated',
            'Subscription reactivated',
            format('Your %s subscription is active again.', v_plan_name),
            'billing',
            '/subscription',
            jsonb_build_object(
              'subscription_id', NEW.id,
              'old_status', OLD.status,
              'new_status', NEW.status
            )
          );
        END IF;
      ELSE
        NULL;
    END CASE;
  END IF;

  IF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
    AND NEW.current_period_end > OLD.current_period_end
    AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
    AND NEW.billing_cycle IS NOT DISTINCT FROM OLD.billing_cycle
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND lower(COALESCE(NEW.status, '')) IN ('active', 'trialing')
  THEN
    PERFORM public.create_user_notification(
      NEW.user_id,
      'subscription_renewed',
      'Subscription renewed',
      format(
        'Your %s subscription renewed successfully. Current period ends on %s.',
        v_plan_name,
        v_period_end_label
      ),
      'billing',
      '/billing',
      jsonb_build_object(
        'subscription_id', NEW.id,
        'plan_id', NEW.plan_id,
        'billing_cycle', NEW.billing_cycle,
        'period_end', NEW.current_period_end
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_user_invoice_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC := COALESCE(NEW.amount_cents, 0)::NUMERIC / 100.0;
  v_status TEXT := lower(COALESCE(NEW.status, 'pending'));
BEGIN
  IF COALESCE(NEW.amount_cents, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_user_notification(
    NEW.user_id,
    CASE WHEN v_status = 'paid' THEN 'invoice_paid' ELSE 'invoice_generated' END,
    CASE WHEN v_status = 'paid' THEN 'Payment received' ELSE 'Invoice generated' END,
    format(
      'Invoice for %s %.2f (%s billing) is %s.',
      upper(COALESCE(NEW.currency, 'USD')),
      v_amount,
      lower(COALESCE(NEW.billing_cycle, 'monthly')),
      v_status
    ),
    'billing',
    '/billing',
    jsonb_build_object(
      'invoice_id', NEW.id,
      'subscription_id', NEW.subscription_id,
      'plan_id', NEW.plan_id,
      'billing_cycle', NEW.billing_cycle,
      'amount_cents', NEW.amount_cents,
      'currency', NEW.currency,
      'status', NEW.status,
      'issued_at', NEW.issued_at
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_user_campaign_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_user_notification(
    NEW.user_id,
    'campaign_created',
    'Campaign created',
    format('Campaign "%s" was created and is ready to launch.', COALESCE(NEW.name, 'Untitled campaign')),
    'campaign',
    '/campaigns',
    jsonb_build_object(
      'campaign_id', NEW.id,
      'campaign_name', NEW.name,
      'status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_user_subscription_changes ON public.user_subscriptions;
CREATE TRIGGER notify_user_subscription_changes
AFTER INSERT OR UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.notify_user_subscription_changes();

DROP TRIGGER IF EXISTS notify_user_invoice_created ON public.billing_invoices;
CREATE TRIGGER notify_user_invoice_created
AFTER INSERT ON public.billing_invoices
FOR EACH ROW
EXECUTE FUNCTION public.notify_user_invoice_created();

DROP TRIGGER IF EXISTS notify_user_campaign_created ON public.campaigns;
CREATE TRIGGER notify_user_campaign_created
AFTER INSERT ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.notify_user_campaign_created();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_notifications TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_user_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_user_notifications_read(UUID) TO authenticated, service_role;
