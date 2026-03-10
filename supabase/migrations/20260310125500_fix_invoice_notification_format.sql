CREATE OR REPLACE FUNCTION public.notify_user_invoice_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC := COALESCE(NEW.amount_cents, 0)::NUMERIC / 100.0;
  v_amount_label TEXT := to_char(v_amount, 'FM9999999990.00');
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
      'Invoice for %s %s (%s billing) is %s.',
      upper(COALESCE(NEW.currency, 'USD')),
      v_amount_label,
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
