-- Migration 0005: finance (bookings and recurring rules).
--
-- Decisions (also documented in docs/finance.md)
-- 1. Money is numeric(12,2). All sums are exact; rounding never happens inside sums.
-- 2. The sign of the amount decides the type: > 0 income, < 0 expense, 0 invalid.
-- 3. A recurring rule is separate from its bookings. Due occurrences are
--    MATERIALISED as normal rows in public.transactions by
--    generate_due_transactions(). Budget and monthly balances only ever read
--    transactions, so a recurring booking can never be counted twice.
-- 4. Only occurrences that are already due (date <= today) become bookings.
--    Future occurrences are shown as a separate forecast (forecast_recurring).
-- 5. Generation is idempotent: UNIQUE (rule, occurrence_date) plus a
--    generated_through watermark on the rule. Opening a page never creates
--    duplicates, and a deleted occurrence is not recreated.
-- 6. Editing a rule never rewrites history. Label, amount and category changes
--    only affect occurrences generated later. The schedule (start date,
--    interval) is locked once bookings exist: deactivate the rule and create a
--    new one instead.

create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  amount numeric(12, 2) not null check (amount <> 0),
  category_id uuid references public.finance_categories (id) on delete restrict,
  interval_unit text not null check (interval_unit in ('week', 'month', 'year')),
  interval_count integer not null default 1 check (interval_count between 1 and 60),
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  -- All occurrences up to and including this date have been processed.
  generated_through date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_rules_end_after_start check (end_date is null or end_date >= start_date),
  constraint recurrence_rules_id_user_unique unique (id, user_id)
);

create index recurrence_rules_user_idx on public.recurrence_rules (user_id, is_active);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  amount numeric(12, 2) not null check (amount <> 0),
  category_id uuid references public.finance_categories (id) on delete restrict,
  booked_on date not null,
  recurrence_rule_id uuid,
  occurrence_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Derived, never written by clients.
  kind text generated always as (case when amount > 0 then 'income' else 'expense' end) stored,

  constraint transactions_rule_fk foreign key (recurrence_rule_id, user_id)
    references public.recurrence_rules (id, user_id) on delete restrict,
  constraint transactions_occurrence_consistency
    check ((recurrence_rule_id is null) = (occurrence_date is null)),
  constraint transactions_id_user_unique unique (id, user_id)
);

-- One booking per rule occurrence (duplicate protection).
create unique index transactions_rule_occurrence_uniq
  on public.transactions (recurrence_rule_id, occurrence_date)
  where recurrence_rule_id is not null;
create index transactions_user_date_idx on public.transactions (user_id, booked_on desc);
create index transactions_category_idx on public.transactions (category_id);

create trigger recurrence_rules_set_updated_at before update on public.recurrence_rules
  for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Rule guards ------------------------------------------------------------------
create function public.recurrence_rules_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.start_date, new.interval_unit, new.interval_count)
       is distinct from (old.start_date, old.interval_unit, old.interval_count)
       and exists (select 1 from public.transactions t where t.recurrence_rule_id = old.id) then
      raise exception 'schedule of a rule with existing bookings cannot be changed; deactivate it and create a new rule'
        using errcode = '23514';
    end if;

    -- Re-activation skips occurrences missed while the rule was off.
    if old.is_active = false and new.is_active = true then
      new.generated_through := greatest(
        coalesce(new.generated_through, date '-infinity'),
        public.user_today() - 1);
    end if;
  end if;
  return new;
end;
$$;

create trigger recurrence_rules_guard before update on public.recurrence_rules
  for each row execute function public.recurrence_rules_guard();

-- A generated booking is tied to its occurrence and cannot be re-pointed.
create function public.transactions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.recurrence_rule_id, new.occurrence_date) is distinct from (old.recurrence_rule_id, old.occurrence_date) then
    raise exception 'recurrence link of a booking cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transactions_guard before update on public.transactions
  for each row execute function public.transactions_guard();

-- Occurrence math ----------------------------------------------------------------
-- n-th occurrence (0-based), always computed from the start date so month-end
-- clamping does not drift (31 Jan -> 28 Feb -> 31 Mar).
create function public.recurrence_occurrence(
  p_start date, p_unit text, p_count integer, p_n integer
)
returns date
language sql immutable
set search_path = ''
as $$
  select case p_unit
    when 'week'  then p_start + (p_n * p_count * 7)
    when 'month' then (p_start + make_interval(months => p_n * p_count))::date
    when 'year'  then (p_start + make_interval(years  => p_n * p_count))::date
  end;
$$;

-- Materialise due occurrences for the calling user.
-- SECURITY DEFINER because the generation watermark (generated_through) is
-- bookkeeping that clients may not write. Safety comes from the explicit scope:
-- the caller must be an approved user and only ever touches their OWN rules.
create function public.generate_due_transactions(p_until date default null)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  n integer;
  occ date;
  limit_date date;
  new_through date;
  added integer;
  total integer := 0;
begin
  if (select auth.uid()) is null or not public.is_approved() then
    raise exception 'not authenticated or not approved' using errcode = '42501';
  end if;

  -- Never generate anything that is not yet due.
  limit_date := least(coalesce(p_until, public.user_today()), public.user_today());

  for r in
    select * from public.recurrence_rules
    where user_id = (select auth.uid()) and is_active
    for update
  loop
    new_through := least(limit_date, coalesce(r.end_date, limit_date));
    n := 0;
    loop
      occ := public.recurrence_occurrence(r.start_date, r.interval_unit, r.interval_count, n);
      exit when occ > new_through or n > 20000;
      if r.generated_through is null or occ > r.generated_through then
        insert into public.transactions
          (user_id, label, amount, category_id, booked_on, recurrence_rule_id, occurrence_date)
        values
          (r.user_id, r.label, r.amount, r.category_id, occ, r.id, occ)
        on conflict (recurrence_rule_id, occurrence_date) where recurrence_rule_id is not null
        do nothing;
        get diagnostics added = row_count;
        total := total + added;
      end if;
      n := n + 1;
    end loop;

    if r.generated_through is null or new_through > r.generated_through then
      update public.recurrence_rules set generated_through = new_through where id = r.id;
    end if;
  end loop;

  return total;
end;
$$;

-- Same job for every user, for a scheduled run (pg_cron / Edge Function with the
-- service role). Not callable by API users.
create function public.generate_due_transactions_all()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  n integer;
  occ date;
  limit_date date;
  new_through date;
  added integer;
  total integer := 0;
begin
  for r in
    select ru.*, coalesce(
        (now() at time zone coalesce(s.timezone, 'UTC'))::date, current_date) as today
    from public.recurrence_rules ru
    left join public.user_settings s on s.user_id = ru.user_id
    where ru.is_active
    for update of ru
  loop
    limit_date := r.today;
    new_through := least(limit_date, coalesce(r.end_date, limit_date));
    n := 0;
    loop
      occ := public.recurrence_occurrence(r.start_date, r.interval_unit, r.interval_count, n);
      exit when occ > new_through or n > 20000;
      if r.generated_through is null or occ > r.generated_through then
        insert into public.transactions
          (user_id, label, amount, category_id, booked_on, recurrence_rule_id, occurrence_date)
        values
          (r.user_id, r.label, r.amount, r.category_id, occ, r.id, occ)
        on conflict (recurrence_rule_id, occurrence_date) where recurrence_rule_id is not null
        do nothing;
        get diagnostics added = row_count;
        total := total + added;
      end if;
      n := n + 1;
    end loop;
    if r.generated_through is null or new_through > r.generated_through then
      update public.recurrence_rules set generated_through = new_through where id = r.id;
    end if;
  end loop;
  return total;
end;
$$;

-- Reporting ----------------------------------------------------------------------
-- Total budget: sum of all bookings that are due. Future bookings are excluded.
create function public.budget_total()
returns numeric
language sql stable
set search_path = ''
as $$
  select coalesce(sum(t.amount), 0)::numeric(14, 2)
  from public.transactions t
  where t.user_id = (select auth.uid()) and t.booked_on <= public.user_today();
$$;

-- Last p_months calendar months, oldest first, including empty months.
-- expense_* are positive magnitudes; balance = income - expense.
create function public.monthly_balance(p_months integer)
returns table (
  month date,
  income numeric,
  expense numeric,
  balance numeric,
  income_recurring numeric,
  income_one_time numeric,
  expense_recurring numeric,
  expense_one_time numeric
)
language plpgsql stable
set search_path = ''
as $$
declare
  today date := public.user_today();
begin
  if p_months is null or p_months < 1 or p_months > 60 then
    raise exception 'p_months must be between 1 and 60' using errcode = '22023';
  end if;

  return query
  with months as (
    select (date_trunc('month', today) - make_interval(months => g))::date as m
    from generate_series(p_months - 1, 0, -1) as g
  ),
  agg as (
    select date_trunc('month', t.booked_on)::date as m,
      sum(t.amount) filter (where t.amount > 0 and t.recurrence_rule_id is not null) as inc_rec,
      sum(t.amount) filter (where t.amount > 0 and t.recurrence_rule_id is null)     as inc_one,
      -sum(t.amount) filter (where t.amount < 0 and t.recurrence_rule_id is not null) as exp_rec,
      -sum(t.amount) filter (where t.amount < 0 and t.recurrence_rule_id is null)     as exp_one
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.booked_on <= today
      and t.booked_on >= (select min(m) from months)
    group by 1
  )
  select
    months.m,
    (coalesce(a.inc_rec, 0) + coalesce(a.inc_one, 0))::numeric(14, 2),
    (coalesce(a.exp_rec, 0) + coalesce(a.exp_one, 0))::numeric(14, 2),
    (coalesce(a.inc_rec, 0) + coalesce(a.inc_one, 0)
       - coalesce(a.exp_rec, 0) - coalesce(a.exp_one, 0))::numeric(14, 2),
    coalesce(a.inc_rec, 0)::numeric(14, 2),
    coalesce(a.inc_one, 0)::numeric(14, 2),
    coalesce(a.exp_rec, 0)::numeric(14, 2),
    coalesce(a.exp_one, 0)::numeric(14, 2)
  from months
  left join agg a on a.m = months.m
  order by months.m;
end;
$$;

-- Totals per category and type for a period (due bookings only).
create function public.category_totals(p_from date, p_to date)
returns table (
  category_id uuid,
  kind text,
  total numeric,
  recurring_total numeric,
  booking_count bigint
)
language sql stable
set search_path = ''
as $$
  select t.category_id, t.kind,
    sum(t.amount)::numeric(14, 2),
    coalesce(sum(t.amount) filter (where t.recurrence_rule_id is not null), 0)::numeric(14, 2),
    count(*)
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.booked_on between p_from and least(p_to, public.user_today())
  group by t.category_id, t.kind
  order by t.kind, 3;
$$;

-- Forecast: future occurrences of active rules. Never stored, never part of the
-- budget or the monthly balances.
create function public.forecast_recurring(p_until date)
returns table (
  rule_id uuid,
  label text,
  amount numeric,
  category_id uuid,
  occurrence_date date
)
language plpgsql stable
set search_path = ''
as $$
declare
  today date := public.user_today();
begin
  if p_until is null or p_until > today + 730 then
    raise exception 'forecast horizon is limited to 24 months' using errcode = '22023';
  end if;

  return query
  select r.id, r.label, r.amount, r.category_id, o.occ
  from public.recurrence_rules r
  cross join lateral (
    select public.recurrence_occurrence(r.start_date, r.interval_unit, r.interval_count, g) as occ
    from generate_series(0, 6000) as g
  ) o
  where r.user_id = (select auth.uid())
    and r.is_active
    and o.occ > today
    and o.occ <= p_until
    and (r.end_date is null or o.occ <= r.end_date)
  order by o.occ, r.label;
end;
$$;

-- Privileges -----------------------------------------------------------------
revoke all on public.recurrence_rules, public.transactions from anon, authenticated;
grant select, insert, update, delete on public.recurrence_rules, public.transactions to authenticated;
-- generated_through is bookkeeping owned by the generator, not by clients.
revoke insert, update on public.recurrence_rules from authenticated;
grant insert (label, amount, category_id, interval_unit, interval_count, start_date, end_date, is_active)
  on public.recurrence_rules to authenticated;
grant update (label, amount, category_id, interval_unit, interval_count, start_date, end_date, is_active)
  on public.recurrence_rules to authenticated;
-- kind is generated; clients never write it.
revoke insert, update on public.transactions from authenticated;
grant insert (label, amount, category_id, booked_on, recurrence_rule_id, occurrence_date)
  on public.transactions to authenticated;
grant update (label, amount, category_id, booked_on)
  on public.transactions to authenticated;

revoke all on function public.recurrence_rules_guard() from public, anon, authenticated;
revoke all on function public.transactions_guard() from public, anon, authenticated;
revoke all on function public.recurrence_occurrence(date, text, integer, integer) from public, anon;
grant execute on function public.recurrence_occurrence(date, text, integer, integer) to authenticated;
revoke all on function public.generate_due_transactions(date) from public, anon;
grant execute on function public.generate_due_transactions(date) to authenticated;
revoke all on function public.generate_due_transactions_all() from public, anon, authenticated;
grant execute on function public.generate_due_transactions_all() to service_role;
revoke all on function public.budget_total() from public, anon;
grant execute on function public.budget_total() to authenticated;
revoke all on function public.monthly_balance(integer) from public, anon;
grant execute on function public.monthly_balance(integer) to authenticated;
revoke all on function public.category_totals(date, date) from public, anon;
grant execute on function public.category_totals(date, date) to authenticated;
revoke all on function public.forecast_recurring(date) from public, anon;
grant execute on function public.forecast_recurring(date) to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.recurrence_rules enable row level security;
alter table public.transactions enable row level security;

create policy recurrence_rules_own on public.recurrence_rules
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_approved())
  with check (user_id = (select auth.uid()) and public.is_approved());

create policy transactions_own on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_approved())
  with check (user_id = (select auth.uid()) and public.is_approved());
