-- Migration 0007: jobs, job calculation, monthly hour limit and calendar events.
--
-- Calculation (documented in docs/calculation.md)
--   H = shooting + editing + organisation hours
--   K = travel costs + other costs                 (internal costs)
--   w = target_hourly_rate, t = tax_rate, r = reserve_rate
--   recommended_price = (H * w + K) / (1 - t - r)
--   Taxes and reserves are a share OF THE PRICE (t + r), so they are applied
--   exactly once and costs are never multiplied by a tax surcharge.
--   Expected profit = price - K - price * (t + r)
--   Hourly earning  = profit / H
-- "price" is the quoted price if the user entered one, else the recommendation.
-- Internal costs, the quoted price and income actually booked in finance
-- (transactions.job_id) are three separate things.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  client text check (char_length(client) <= 120),
  start_date date not null,
  start_time time,
  end_date date,
  end_time time,
  shooting_hours numeric(6, 2) not null default 0 check (shooting_hours >= 0),
  editing_hours numeric(6, 2) not null default 0 check (editing_hours >= 0),
  organisation_hours numeric(6, 2) not null default 0 check (organisation_hours >= 0),
  travel_costs numeric(12, 2) not null default 0 check (travel_costs >= 0),
  other_costs numeric(12, 2) not null default 0 check (other_costs >= 0),
  -- Price actually offered to the client (optional). Not income!
  quoted_price numeric(12, 2) check (quoted_price >= 0),
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_end_after_start check (end_date is null or end_date >= start_date),
  constraint jobs_time_order check (
    end_time is null or start_time is null
    or coalesce(end_date, start_date) > start_date or end_time > start_time),
  constraint jobs_id_user_unique unique (id, user_id)
);

create index jobs_user_start_idx on public.jobs (user_id, start_date);

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- Equipment a job needs. Restricted to the user's own equipment (open decision:
-- borrowed items could be added later).
create table public.job_equipment (
  job_id uuid not null,
  user_id uuid not null default auth.uid(),
  equipment_id uuid not null,
  quantity integer not null default 1 check (quantity >= 1),
  primary key (job_id, equipment_id),
  constraint job_equipment_job_fk foreign key (job_id, user_id)
    references public.jobs (id, user_id) on delete cascade,
  constraint job_equipment_equipment_fk foreign key (equipment_id, user_id)
    references public.equipment (id, owner_id) on delete cascade
);

-- Link a booking to a job, so planned price and booked income stay comparable.
alter table public.transactions add column job_id uuid;
alter table public.transactions
  add constraint transactions_job_fk foreign key (job_id, user_id)
  references public.jobs (id, user_id) on delete set null (job_id);
create index transactions_job_idx on public.transactions (job_id) where job_id is not null;
grant insert (job_id) on public.transactions to authenticated;
grant update (job_id) on public.transactions to authenticated;

-- Calendar events ---------------------------------------------------------------
-- kind 'appointment': created by the user.
-- kind 'job': maintained ONLY by the sync trigger below (one row per job).
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null default 'appointment' check (kind in ('appointment', 'job')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  start_date date not null,
  end_date date,
  start_time time,
  end_time time,
  location text check (char_length(location) <= 200),
  notes text check (char_length(notes) <= 4000),
  job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_end_after_start check (end_date is null or end_date >= start_date),
  constraint calendar_events_time_order check (
    end_time is null or start_time is null
    or coalesce(end_date, start_date) > start_date or end_time > start_time),
  constraint calendar_events_job_kind check (kind <> 'job' or job_id is not null),
  constraint calendar_events_job_fk foreign key (job_id, user_id)
    references public.jobs (id, user_id) on delete set null (job_id)
);

-- At most one calendar entry per job: no duplicates after edits.
create unique index calendar_events_one_per_job
  on public.calendar_events (job_id) where kind = 'job';
create index calendar_events_user_date_idx on public.calendar_events (user_id, start_date);

create trigger calendar_events_set_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

create function public.sync_job_calendar_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.calendar_events
    (user_id, kind, title, start_date, end_date, start_time, end_time, job_id)
  values
    (new.user_id, 'job', new.name, new.start_date, new.end_date, new.start_time, new.end_time, new.id)
  on conflict (job_id) where kind = 'job'
  do update set
    title = excluded.title,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    start_time = excluded.start_time,
    end_time = excluded.end_time;
  return new;
end;
$$;

create trigger jobs_sync_calendar after insert or update on public.jobs
  for each row execute function public.sync_job_calendar_event();

-- The job entry must go before the job, otherwise the FK would null its job_id.
create function public.delete_job_calendar_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.calendar_events where job_id = old.id and kind = 'job';
  return old;
end;
$$;

create trigger jobs_delete_calendar before delete on public.jobs
  for each row execute function public.delete_job_calendar_event();

-- Job calculation ---------------------------------------------------------------
create function public.calculate_job_quote(p_job_id uuid)
returns table (
  total_hours numeric,
  planned_costs numeric,
  recommended_price numeric,
  quoted_price numeric,
  price_used numeric,
  taxes_and_reserves numeric,
  expected_profit numeric,
  effective_hourly_rate numeric,
  booked_income numeric,
  missing_settings text[]
)
language plpgsql stable
set search_path = ''
as $$
declare
  j public.jobs;
  s public.user_settings;
  h numeric;
  k numeric;
  missing text[] := '{}';
  rec numeric;
  used numeric;
  tr numeric;
  profit numeric;
begin
  select * into j from public.jobs where id = p_job_id and user_id = (select auth.uid());
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  select * into s from public.user_settings where user_id = (select auth.uid());

  h := j.shooting_hours + j.editing_hours + j.organisation_hours;
  k := j.travel_costs + j.other_costs;

  if s.target_hourly_rate is null then missing := array_append(missing, 'target_hourly_rate'::text); end if;
  if s.tax_rate is null then missing := array_append(missing, 'tax_rate'::text); end if;
  if s.reserve_rate is null then missing := array_append(missing, 'reserve_rate'::text); end if;

  if cardinality(missing) = 0 then
    rec := (h * s.target_hourly_rate + k) / (1 - s.tax_rate - s.reserve_rate);
    used := coalesce(j.quoted_price, round(rec, 2));
    tr := used * (s.tax_rate + s.reserve_rate);
    profit := used - k - tr;
  end if;

  return query select
    h,
    k,
    round(rec, 2),
    j.quoted_price,
    round(used, 2),
    round(tr, 2),
    round(profit, 2),
    case when h > 0 then round(profit / h, 2) end,
    coalesce((select sum(t.amount) from public.transactions t
              where t.job_id = j.id and t.user_id = j.user_id and t.amount > 0), 0)::numeric,
    missing;
end;
$$;

-- Monthly billable-hour limit ---------------------------------------------------
-- Business rule: a job counts fully towards the month of its START date.
-- Organisation hours count only if user_settings.org_hours_billable is true.
create function public.check_monthly_hours(
  p_start_date date,
  p_shooting numeric,
  p_editing numeric,
  p_organisation numeric,
  p_exclude_job uuid default null
)
returns table (
  monthly_limit numeric,
  planned_hours numeric,
  new_hours numeric,
  total_hours numeric,
  exceeds boolean
)
language plpgsql stable
set search_path = ''
as $$
declare
  s public.user_settings;
  planned numeric;
  added numeric;
begin
  select * into s from public.user_settings where user_id = (select auth.uid());

  select coalesce(sum(
      j.shooting_hours + j.editing_hours
      + case when coalesce(s.org_hours_billable, true) then j.organisation_hours else 0 end), 0)
    into planned
  from public.jobs j
  where j.user_id = (select auth.uid())
    and date_trunc('month', j.start_date) = date_trunc('month', p_start_date)
    and j.id is distinct from p_exclude_job;

  added := coalesce(p_shooting, 0) + coalesce(p_editing, 0)
         + case when coalesce(s.org_hours_billable, true) then coalesce(p_organisation, 0) else 0 end;

  return query select
    s.billable_hours_per_month,
    planned,
    added,
    planned + added,
    -- Without a configured limit there is nothing to exceed.
    coalesce(s.billable_hours_per_month is not null and planned + added > s.billable_hours_per_month, false);
end;
$$;

-- Privileges -----------------------------------------------------------------
revoke all on public.jobs, public.job_equipment, public.calendar_events from anon, authenticated;
grant select, insert, update, delete on public.jobs, public.job_equipment to authenticated;
-- Job entries are written by the trigger only: clients may touch appointments.
grant select, insert, update, delete on public.calendar_events to authenticated;

revoke all on function public.sync_job_calendar_event() from public, anon, authenticated;
revoke all on function public.delete_job_calendar_event() from public, anon, authenticated;
revoke all on function public.calculate_job_quote(uuid) from public, anon;
grant execute on function public.calculate_job_quote(uuid) to authenticated;
revoke all on function public.check_monthly_hours(date, numeric, numeric, numeric, uuid) from public, anon;
grant execute on function public.check_monthly_hours(date, numeric, numeric, numeric, uuid) to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.jobs enable row level security;
alter table public.job_equipment enable row level security;
alter table public.calendar_events enable row level security;

create policy jobs_own on public.jobs
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_approved())
  with check (user_id = (select auth.uid()) and public.is_approved());

create policy job_equipment_own on public.job_equipment
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_approved())
  with check (user_id = (select auth.uid()) and public.is_approved());

create policy calendar_events_select_own on public.calendar_events
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_approved());

create policy calendar_events_write_appointments on public.calendar_events
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_approved() and kind = 'appointment')
  with check (user_id = (select auth.uid()) and public.is_approved() and kind = 'appointment');
