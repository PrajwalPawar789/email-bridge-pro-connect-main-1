alter table public.prospects
  add column if not exists catalog_ref text,
  add column if not exists source_shard integer,
  add column if not exists source_record_id text,
  add column if not exists catalog_company_ref text,
  add column if not exists job_level text,
  add column if not exists job_function text,
  add column if not exists sub_industry text,
  add column if not exists employee_size text,
  add column if not exists region text,
  add column if not exists naics text,
  add column if not exists company_domain text;

create unique index if not exists prospects_user_catalog_ref_uidx
  on public.prospects (user_id, catalog_ref);

create index if not exists prospects_source_shard_record_idx
  on public.prospects (source_shard, source_record_id);
