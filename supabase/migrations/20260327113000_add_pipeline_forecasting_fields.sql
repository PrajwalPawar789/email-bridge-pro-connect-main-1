-- Forecast-ready fields for pipeline opportunities.

alter table public.opportunities
  add column if not exists expected_close_date date,
  add column if not exists forecast_category text not null default 'pipeline',
  add column if not exists forecast_probability integer not null default 50,
  add column if not exists closed_at timestamptz;

alter table public.opportunities
  drop constraint if exists opportunities_forecast_category_check;

alter table public.opportunities
  add constraint opportunities_forecast_category_check
  check (forecast_category in ('not_forecasted', 'pipeline', 'best_case', 'commit', 'closed'));

alter table public.opportunities
  drop constraint if exists opportunities_forecast_probability_check;

alter table public.opportunities
  add constraint opportunities_forecast_probability_check
  check (forecast_probability between 0 and 100);

update public.opportunities
set
  forecast_category = case
    when status = 'won' then 'closed'
    when status = 'lost' then 'not_forecasted'
    else coalesce(nullif(trim(forecast_category), ''), 'pipeline')
  end,
  forecast_probability = case
    when status = 'won' then 100
    when status = 'lost' then 0
    else greatest(0, least(100, coalesce(forecast_probability, 50)))
  end,
  closed_at = case
    when status in ('won', 'lost') and closed_at is null then coalesce(updated_at, created_at, now())
    when status = 'open' then null
    else closed_at
  end
where true;

create index if not exists opportunities_expected_close_date_idx
  on public.opportunities (expected_close_date);

create index if not exists opportunities_forecast_category_idx
  on public.opportunities (forecast_category);
