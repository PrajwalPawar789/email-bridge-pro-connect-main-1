-- Stage-level keyword rules for pipeline auto-routing
create table if not exists public.pipeline_stage_keywords (
  id uuid primary key default gen_random_uuid(),
  pipeline_stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now(),
  constraint pipeline_stage_keywords_keyword_check check (char_length(btrim(keyword)) >= 2)
);

create index if not exists pipeline_stage_keywords_stage_idx
  on public.pipeline_stage_keywords (pipeline_stage_id);

create unique index if not exists pipeline_stage_keywords_stage_keyword_idx
  on public.pipeline_stage_keywords (pipeline_stage_id, lower(keyword));

alter table public.pipeline_stage_keywords enable row level security;

drop policy if exists "pipeline stage keywords owner access" on public.pipeline_stage_keywords;
create policy "pipeline stage keywords owner access"
  on public.pipeline_stage_keywords
  for all
  using (
    exists (
      select 1
      from public.pipeline_stages ps
      join public.pipelines p on p.id = ps.pipeline_id
      where ps.id = pipeline_stage_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.pipeline_stages ps
      join public.pipelines p on p.id = ps.pipeline_id
      where ps.id = pipeline_stage_id
        and p.user_id = auth.uid()
    )
  );

create or replace function public.route_replied_recipient_to_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.campaign_pipeline_settings%rowtype;
  campaign_user_id uuid;
  fallback_stage_id uuid;
  target_stage_id uuid;
  target_status text := 'open';
  latest_subject text;
  latest_body text;
  reply_text text := '';
  sender_owner text;
  assigned_owner text;
  existing_opportunity_id uuid;
begin
  if new.replied is distinct from true then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.replied, false) = true then
    return new;
  end if;

  if new.campaign_id is null or new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  select c.user_id
    into campaign_user_id
  from public.campaigns c
  where c.id = new.campaign_id
  limit 1;

  if campaign_user_id is null then
    return new;
  end if;

  select cps.*
    into settings_row
  from public.campaign_pipeline_settings cps
  where cps.campaign_id = new.campaign_id
    and cps.enabled = true
  limit 1;

  if settings_row.id is null or settings_row.pipeline_id is null then
    return new;
  end if;

  if settings_row.create_on = 'manual' then
    return new;
  end if;

  select ps.id
    into fallback_stage_id
  from public.pipeline_stages ps
  where ps.pipeline_id = settings_row.pipeline_id
  order by ps.sort_order asc
  limit 1;

  target_stage_id := coalesce(settings_row.initial_stage_id, fallback_stage_id);

  select em.subject, em.body
    into latest_subject, latest_body
  from public.email_messages em
  where lower(coalesce(em.from_email, '')) = lower(new.email)
    and (em.direction is null or lower(em.direction) <> 'outbound')
  order by em.date desc nulls last
  limit 1;

  reply_text := lower(coalesce(latest_subject, '') || ' ' || coalesce(latest_body, ''));

  if btrim(reply_text) <> '' then
    select match_row.pipeline_stage_id
      into target_stage_id
    from (
      select
        psk.pipeline_stage_id,
        ps.sort_order,
        count(*) as matched_count
      from public.pipeline_stage_keywords psk
      join public.pipeline_stages ps on ps.id = psk.pipeline_stage_id
      where ps.pipeline_id = settings_row.pipeline_id
        and position(lower(psk.keyword) in reply_text) > 0
      group by psk.pipeline_stage_id, ps.sort_order
      order by matched_count desc, ps.sort_order asc
      limit 1
    ) as match_row;
  end if;

  if target_stage_id is null then
    if settings_row.create_on = 'any' then
      target_stage_id := coalesce(settings_row.initial_stage_id, fallback_stage_id);
    else
      return new;
    end if;
  end if;

  if target_stage_id is null then
    return new;
  end if;

  select case
      when ps.is_won then 'won'
      when ps.is_lost then 'lost'
      else 'open'
    end
    into target_status
  from public.pipeline_stages ps
  where ps.id = target_stage_id
    and ps.pipeline_id = settings_row.pipeline_id
  limit 1;

  if target_status is null then
    target_status := 'open';
  end if;

  sender_owner := null;
  if new.sender_email is not null and btrim(new.sender_email) <> '' then
    sender_owner := new.sender_email;
  elsif new.assigned_email_config_id is not null then
    select ec.smtp_username
      into sender_owner
    from public.email_configs ec
    where ec.id = new.assigned_email_config_id
    limit 1;
  end if;

  if settings_row.owner_rule = 'fixed' then
    assigned_owner := nullif(btrim(coalesce(settings_row.fixed_owner, '')), '');
  elsif settings_row.owner_rule = 'sender' then
    assigned_owner := sender_owner;
  else
    -- Round-robin fallback: sender-based assignment until explicit team roster is configured.
    assigned_owner := sender_owner;
  end if;

  select o.id
    into existing_opportunity_id
  from public.opportunities o
  where o.pipeline_id = settings_row.pipeline_id
    and lower(coalesce(o.contact_email, '')) = lower(new.email)
  order by o.updated_at desc nulls last
  limit 1;

  if existing_opportunity_id is null then
    insert into public.opportunities (
      user_id,
      pipeline_id,
      stage_id,
      campaign_id,
      status,
      contact_name,
      contact_email,
      owner,
      last_activity_at,
      created_at,
      updated_at
    ) values (
      campaign_user_id,
      settings_row.pipeline_id,
      target_stage_id,
      new.campaign_id,
      target_status,
      nullif(btrim(coalesce(new.name, '')), ''),
      new.email,
      assigned_owner,
      now(),
      now(),
      now()
    );
  else
    update public.opportunities
      set stage_id = target_stage_id,
          campaign_id = coalesce(new.campaign_id, campaign_id),
          status = target_status,
          owner = coalesce(assigned_owner, owner),
          contact_name = coalesce(nullif(btrim(coalesce(new.name, '')), ''), contact_name),
          last_activity_at = now(),
          updated_at = now()
    where id = existing_opportunity_id;
  end if;

  return new;
end;
$$;

drop trigger if exists route_replied_recipient_to_pipeline_trigger on public.recipients;
create trigger route_replied_recipient_to_pipeline_trigger
after insert or update of replied
on public.recipients
for each row
execute function public.route_replied_recipient_to_pipeline();
