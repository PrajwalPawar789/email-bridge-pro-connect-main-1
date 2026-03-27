-- Support center conversations and messages.

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requester_email text,
  requester_name text,
  subject text not null,
  category text not null default 'other',
  severity text not null default 'medium',
  status text not null default 'waiting_on_support',
  contact_preference text not null default 'in_app',
  source_page text,
  source_url text,
  source_metadata jsonb not null default '{}'::jsonb,
  response_due_at timestamptz,
  first_response_at timestamptz,
  last_customer_message_at timestamptz,
  last_support_message_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_conversations_category_check check (
    category in (
      'bug',
      'billing',
      'mailbox',
      'campaigns',
      'automations',
      'landing_pages',
      'team',
      'deliverability',
      'feature_request',
      'other'
    )
  ),
  constraint support_conversations_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  constraint support_conversations_status_check check (
    status in ('new', 'waiting_on_support', 'waiting_on_customer', 'resolved')
  ),
  constraint support_conversations_contact_preference_check check (
    contact_preference in ('in_app', 'email')
  )
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_role text not null,
  author_name text,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint support_messages_author_role_check check (
    author_role in ('customer', 'support', 'system')
  )
);

create index if not exists support_conversations_workspace_status_updated_idx
  on public.support_conversations (workspace_id, status, updated_at desc);
create index if not exists support_conversations_requester_updated_idx
  on public.support_conversations (requester_user_id, updated_at desc);
create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at asc);
create index if not exists support_messages_workspace_created_idx
  on public.support_messages (workspace_id, created_at desc);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

create or replace function public.support_conversation_is_visible(
  p_workspace_id uuid,
  p_requester_user_id uuid
)
returns boolean
language sql
stable
as $$
  select
    auth.uid() = p_requester_user_id
    or exists (
      select 1
      from public.workspace_memberships wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and (
          wm.role in ('owner', 'admin', 'sub_admin')
          or wm.can_manage_workspace
          or wm.can_manage_billing
        )
    );
$$;

create or replace function public.touch_support_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_conversations
  set
    status = case
      when new.author_role = 'customer' then 'waiting_on_support'
      when new.author_role = 'support' then 'waiting_on_customer'
      else status
    end,
    first_response_at = case
      when new.author_role = 'support' and first_response_at is null then new.created_at
      else first_response_at
    end,
    last_customer_message_at = case
      when new.author_role = 'customer' then new.created_at
      else last_customer_message_at
    end,
    last_support_message_at = case
      when new.author_role = 'support' then new.created_at
      else last_support_message_at
    end,
    resolved_at = case
      when new.author_role = 'customer' then null
      else resolved_at
    end,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists update_support_conversations_updated_at on public.support_conversations;
create trigger update_support_conversations_updated_at
before update on public.support_conversations
for each row
execute function update_updated_at_column();

drop trigger if exists touch_support_conversation_from_message on public.support_messages;
create trigger touch_support_conversation_from_message
after insert on public.support_messages
for each row
execute function public.touch_support_conversation_from_message();

drop policy if exists "support conversations visible to requester and admins" on public.support_conversations;
create policy "support conversations visible to requester and admins"
  on public.support_conversations
  for select
  using (public.support_conversation_is_visible(workspace_id, requester_user_id));

drop policy if exists "members can create their own support conversations" on public.support_conversations;
create policy "members can create their own support conversations"
  on public.support_conversations
  for insert
  with check (
    auth.uid() = requester_user_id
    and exists (
      select 1
      from public.workspace_memberships wm
      where wm.workspace_id = support_conversations.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

drop policy if exists "requesters and admins can update support conversations" on public.support_conversations;
create policy "requesters and admins can update support conversations"
  on public.support_conversations
  for update
  using (public.support_conversation_is_visible(workspace_id, requester_user_id))
  with check (public.support_conversation_is_visible(workspace_id, requester_user_id));

drop policy if exists "support messages visible to requester and admins" on public.support_messages;
create policy "support messages visible to requester and admins"
  on public.support_messages
  for select
  using (
    exists (
      select 1
      from public.support_conversations sc
      where sc.id = support_messages.conversation_id
        and public.support_conversation_is_visible(sc.workspace_id, sc.requester_user_id)
    )
  );

drop policy if exists "requesters can add customer messages" on public.support_messages;
create policy "requesters can add customer messages"
  on public.support_messages
  for insert
  with check (
    auth.uid() = author_user_id
    and author_role = 'customer'
    and exists (
      select 1
      from public.support_conversations sc
      where sc.id = support_messages.conversation_id
        and sc.workspace_id = support_messages.workspace_id
        and sc.requester_user_id = auth.uid()
    )
  );
