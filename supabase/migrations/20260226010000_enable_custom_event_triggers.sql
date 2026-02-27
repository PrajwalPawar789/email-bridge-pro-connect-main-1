-- Enable webhook/custom-event trigger mode for automation workflows and templates.

ALTER TABLE public.automation_workflows
  DROP CONSTRAINT IF EXISTS automation_workflows_trigger_type_check;

ALTER TABLE public.automation_workflows
  ADD CONSTRAINT automation_workflows_trigger_type_check
  CHECK (trigger_type IN ('list_joined', 'manual', 'custom_event'));

DO $$
BEGIN
  IF to_regclass('public.automation_workflow_templates') IS NOT NULL THEN
    ALTER TABLE public.automation_workflow_templates
      DROP CONSTRAINT IF EXISTS automation_workflow_templates_trigger_type_check;

    ALTER TABLE public.automation_workflow_templates
      ADD CONSTRAINT automation_workflow_templates_trigger_type_check
      CHECK (trigger_type IN ('list_joined', 'manual', 'custom_event'));

    UPDATE public.automation_workflow_templates
    SET trigger_type = 'custom_event'
    WHERE slug IN ('webhook-based-email-marketing', 'webhook-email-notification')
      AND trigger_type = 'manual';

    UPDATE public.automation_workflow_templates
    SET runner_compatible = true
    WHERE slug IN ('webhook-based-email-marketing', 'webhook-email-notification');
  END IF;
END;
$$;

UPDATE public.automation_workflows aw
SET trigger_type = 'custom_event'
WHERE aw.trigger_type = 'manual'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(aw.settings->'workflow_graph'->'nodes', '[]'::jsonb)) AS node
    WHERE node->>'kind' = 'webhook'
  );
