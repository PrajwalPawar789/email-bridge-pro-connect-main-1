-- Pipeline core tables
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  template_id text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  template_stage_id text,
  name text not null,
  description text,
  sort_order integer not null,
  tone text,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status text not null default 'open',
  contact_name text,
  contact_email text,
  company text,
  value numeric,
  owner text,
  next_step text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_pipeline_settings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  pipeline_id uuid references public.pipelines(id) on delete set null,
  create_on text not null default 'positive',
  initial_stage_id uuid references public.pipeline_stages(id) on delete set null,
  initial_stage_template_id text,
  owner_rule text not null default 'sender',
  fixed_owner text,
  stop_on_interested boolean not null default true,
  stop_on_not_interested boolean not null default true,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.opportunities
  add constraint opportunities_status_check
  check (status in ('open', 'won', 'lost'));

alter table public.campaign_pipeline_settings
  add constraint campaign_pipeline_create_on_check
  check (create_on in ('positive', 'any', 'manual'));

alter table public.campaign_pipeline_settings
  add constraint campaign_pipeline_owner_rule_check
  check (owner_rule in ('sender', 'round_robin', 'fixed'));

create index if not exists pipeline_stages_pipeline_id_idx on public.pipeline_stages (pipeline_id);
create index if not exists opportunities_pipeline_id_idx on public.opportunities (pipeline_id);
create index if not exists opportunities_stage_id_idx on public.opportunities (stage_id);
create index if not exists opportunities_campaign_id_idx on public.opportunities (campaign_id);
create index if not exists opportunities_contact_email_idx on public.opportunities (contact_email);

alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.campaign_pipeline_settings enable row level security;

create policy "pipelines owner access"
  on public.pipelines
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "pipeline stages owner access"
  on public.pipeline_stages
  for all
  using (
    exists (
      select 1 from public.pipelines p
      where p.id = pipeline_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.pipelines p
      where p.id = pipeline_id
        and p.user_id = auth.uid()
    )
  );

create policy "opportunities owner access"
  on public.opportunities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "campaign pipeline settings owner access"
  on public.campaign_pipeline_settings
  for all
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and c.user_id = auth.uid()
    )
  );
