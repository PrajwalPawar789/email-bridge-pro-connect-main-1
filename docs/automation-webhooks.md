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
  "data": {
    "company": "Acme Inc",
    "job_title": "Head of Growth"
  }
}
```

Behavior:

- Upserts the contact in `automation_contacts` by `(workflow_id, email)`.
- Stores incoming fields in contact `state`.
- Appends event names to `state.custom_events`.
- Triggers `automation-runner` immediately for near-real-time execution.

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
