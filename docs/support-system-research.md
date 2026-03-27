# Support System Research Notes

## What strong SaaS support systems do

### 1. Shared inbox + one thread per issue
- Intercom positions its Inbox as a central workspace where teams, channels, tickets, and customer data stay in one place.
- Front frames support around one shared inbox with routing, collaboration, SLA alerts, and integrated context instead of scattered tools.

### 2. Self-serve first, but escalation stays easy
- Intercom pairs inbox workflows with Help Center and tickets.
- Help Scout Beacon explicitly keeps support history visible inside the support surface, which reduces repeat explanations.
- Front Chat routes conversations into a shared inbox and can attach authenticated user identity.

### 3. Context is part of intake, not a follow-up chore
- Front emphasizes fast replies with CRM, knowledge base, and app context available directly in the inbox.
- Help Scout Secure Mode shows how account-linked conversation history matters when support spans devices or sessions.

### 4. Status and SLA need to be visible
- Intercom highlights SLA targets, prioritization, workload management, and routing rules.
- Front emphasizes routing rules, assignment, and shared queue visibility so support work is owned instead of floating.

## Common user and operator pain points

### 1. Context switching kills response time
- A recent r/SaaS thread described support agents spending more time gathering account context than writing the actual reply.

### 2. Bot deflection without intent capture creates more work
- The same thread called out messy bot-to-human handoffs and support flows that fail to preserve the real reason for escalation.

### 3. Users hate repeating themselves
- When support history is fragmented across tools or sessions, customers lose trust quickly and teams waste time re-triaging.

### 4. Ownership is often unclear
- Without visible state like `waiting on support`, `waiting on customer`, and `resolved`, the queue feels like a black box.

## Product decisions for this repo

### Implemented
- New native `/support` page inside the dashboard shell.
- Workspace-scoped support conversations and support messages in Supabase.
- Structured intake with category, severity, product area, and preferred follow-up.
- Visible request status, response target, and persistent thread history.
- Support request list plus per-thread reply flow.
- Knowledge cards tied to the same operational areas as the intake form.
- Automatic context capture for workspace, plan, role, requester, timezone, and browser.
- Sidebar and header access so support is reachable from anywhere in the app.

### Why this shape
- It avoids the common “chat widget as a dead-end funnel” problem.
- It preserves a single thread instead of scattering support across email, forms, and ad hoc messages.
- It gives support enough initial context to reduce the first-round clarification loop.
- It matches how production SaaS tools combine self-serve guidance with human escalation.

## Sources
- Intercom Inbox: https://www.intercom.com/help-desk/inbox
- Intercom email-to-inbox routing: https://www.intercom.com/help/en/articles/6522819-automatically-forward-emails-to-the-inbox
- Front customer support overview: https://front.com/blog/customer-support
- Help Scout Beacon support history: https://docs.helpscout.com/article/1229-support-history-security-options
- Reddit pain points thread: https://www.reddit.com/r/SaaS/comments/1rf2w35/looking_to_understand_supportagent_pain_points/
