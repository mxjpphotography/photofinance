-- Migration 0003: per-user settings and the sign-up trigger.
--
-- Calculation settings are deliberately NULLable. A missing value means
-- "not configured yet", and the job calculation then refuses to produce a
-- price instead of inventing one.

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,

  -- Job calculation (see docs/calculation.md)
  target_hourly_rate numeric(10, 2) check (target_hourly_rate >= 0),
  billable_hours_per_month numeric(6, 2) check (billable_hours_per_month > 0 and billable_hours_per_month <= 744),
  tax_rate numeric(5, 4) check (tax_rate >= 0 and tax_rate < 1),
  reserve_rate numeric(5, 4) check (reserve_rate >= 0 and reserve_rate < 1),
  -- Business rule (open decision, default = all hours count): do organisation
  -- hours count towards the monthly billable-hours limit?
  org_hours_billable boolean not null default true,

  -- Overview
  balance_months integer not null default 6 check (balance_months between 1 and 24),
  chart_months integer not null default 6 check (chart_months between 1 and 24),

  -- Used to decide what "today" and "this month" mean for the user.
  timezone text not null default 'Europe/Berlin',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tax_plus_reserve_below_one
    check (coalesce(tax_rate, 0) + coalesce(reserve_rate, 0) < 1)
);

create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

create function public.validate_user_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger user_settings_validate before insert or update on public.user_settings
  for each row execute function public.validate_user_settings();

-- "Today" in the user's own time zone (falls back to UTC).
create function public.user_today()
returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select s.timezone from public.user_settings s where s.user_id = (select auth.uid())),
    'UTC'))::date;
$$;

-- Sign-up: create profile, pending access row and default settings.
-- Never fails on a missing name, because a failing trigger would block sign-up.
-- The front end validates that a real name was entered.
create function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  display_name text;
begin
  display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if display_name is null then
    display_name := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Unknown');
  end if;

  insert into public.profiles (id, full_name) values (new.id, left(display_name, 120));
  insert into public.user_access (user_id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Privileges -----------------------------------------------------------------
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;

revoke all on function public.validate_user_settings() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.user_today() from public, anon;
grant execute on function public.user_today() to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.user_settings enable row level security;

create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_approved());

create policy user_settings_insert_own on public.user_settings
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_approved());

create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_approved())
  with check (user_id = (select auth.uid()) and public.is_approved());
