# Automation Webhooks

This project supports two webhook modes inside automations:

1. `Webhook trigger` (incoming): external systems send events into a workflow.
2. `Webhook node` (outgoing): a workflow calls an external URL mid-flow.

## Incoming webhook trigger

Use **Automations -> Trigger type -> Webhook event**.

- Configure:
  - `Webhook secret`
  - optional `Event name` filter
- Copy the generated endpoint:
  - `${VITE_SUPABASE_URL}/functions/v1/automation-webhook?workflowId=<id>&secret=<secret>&event=<event>`

Minimum payload:

```json
{
  "email": "prospect@example.com"
}
```

Recommended payload:

```json
{
  "event": "contact_created",
  "email": "prospect@example.com",
  "name": "Alex Johnson",
  "phone": "+1 415 555 0182",
  "data": {
    "company": "Acme Inc",
    "job_title": "Head of Growth",
    "country": "United States",
    "industry": "SaaS"
  }
}
```

Behavior:

- Each webhook call handles one contact identified by the payload email. It does not bulk-enroll old contacts.
- Upserts the contact in `automation_contacts` by `(workflow_id, email)`.
- Creates or refreshes a matching lead in `prospects` for the workflow owner.
- Stores incoming fields in contact `state`.
- Appends event names to `state.custom_events`.
- If the contact is already active, the workflow continues with refreshed state. If the contact was completed, failed, or paused, the workflow restarts from step 0. Unsubscribed contacts remain excluded.
- Triggers `automation-runner` immediately for that contact so webhook execution stays event-scoped instead of sweeping unrelated due contacts.

## Outgoing webhook node

Inside the Workflow Builder, add a **Webhook** node and configure:

- URL
- method (`GET/POST/PUT/PATCH/DELETE/HEAD`)
- payload template
- optional auth (`Bearer` or `API key` header)
- timeout

Runner behavior:

- Personalizes URL/body/auth token placeholders (`{email}`, `{first_name}`, `{company}`, etc.).
- Sends request and logs status/response preview in `automation_logs`.
- Persists last webhook result in contact `state.webhook_results`.
- Retries failed webhook nodes with backoff.

## Security notes

- Always keep the webhook secret enabled in production.
- Prefer HTTPS endpoints.
- If you set an `Event name`, non-matching events are ignored with a log entry.
