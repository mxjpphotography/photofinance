-- Migration 0009: job calculation with a PRE-TAX hourly rate and no VAT.
--
-- Decision (owner): the target hourly rate is what the photographer wants to
-- earn per hour BEFORE income tax and reserves. The photographer is a small
-- business owner without VAT, so prices contain no VAT.
--
--   H = shooting + editing + organisation hours
--   K = travel costs + other costs                 (internal costs)
--   w = target_hourly_rate
--   recommended price = H * w + K
--   price used        = quoted price, else recommended price
--   expected profit   = price used - K             (before tax and reserves)
--   hourly earning    = expected profit / H        (before tax and reserves)
--   set aside         = expected profit * (tax_rate + reserve_rate)
--
-- tax_rate and reserve_rate are OPTIONAL shares of the profit that the user
-- wants to set aside. They no longer inflate the price, so nothing is counted
-- twice. If they are not configured, nothing is set aside (0). Only the hourly
-- rate is required to calculate a price.
--
-- The signature and return type stay the same, so existing callers keep
-- working. Meaning of the columns changed as described above:
--   taxes_and_reserves = amount to set aside from the profit
--   expected_profit    = profit before tax and reserves

create or replace function public.calculate_job_quote(p_job_id uuid)
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
  profit numeric;
  aside numeric;
begin
  select * into j from public.jobs where id = p_job_id and user_id = (select auth.uid());
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  select * into s from public.user_settings where user_id = (select auth.uid());

  h := j.shooting_hours + j.editing_hours + j.organisation_hours;
  k := j.travel_costs + j.other_costs;

  if s.target_hourly_rate is null then
    missing := array_append(missing, 'target_hourly_rate'::text);
  end if;

  if cardinality(missing) = 0 then
    rec := h * s.target_hourly_rate + k;
    used := coalesce(j.quoted_price, round(rec, 2));
    profit := used - k;
    aside := greatest(profit, 0) * (coalesce(s.tax_rate, 0) + coalesce(s.reserve_rate, 0));
  end if;

  return query select
    h,
    k,
    round(rec, 2),
    j.quoted_price,
    round(used, 2),
    round(aside, 2),
    round(profit, 2),
    case when h > 0 then round(profit / h, 2) end,
    coalesce((select sum(t.amount) from public.transactions t
              where t.job_id = j.id and t.user_id = j.user_id and t.amount > 0), 0)::numeric,
    missing;
end;
$$;

comment on column public.user_settings.target_hourly_rate is
  'Desired hourly rate BEFORE income tax and reserves (no VAT: small business).';
comment on column public.user_settings.tax_rate is
  'Optional share of the profit to set aside for income tax. Does not change the price.';
comment on column public.user_settings.reserve_rate is
  'Optional share of the profit to set aside as a reserve. Does not change the price.';
