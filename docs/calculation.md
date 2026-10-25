# Job calculation

Implemented in `public.calculate_job_quote(job_id)` (migration 7) and covered by tests.

## Inputs

- Job: shooting, editing and organisation hours; travel and other costs;
  optional quoted price.
- Settings: `target_hourly_rate` (w), `tax_rate` (t), `reserve_rate` (r).

## Formula

```
H = shooting + editing + organisation hours
K = travel costs + other costs                       internal costs

recommended price = (H * w + K) / (1 - t - r)
price used        = quoted price, else recommended price
taxes + reserves  = price used * (t + r)
expected profit   = price used - K - (taxes + reserves)
hourly earning    = expected profit / H              (empty when H = 0)
```

Why this form: taxes and reserves are a share of the price, so they are
applied exactly once, and costs are never multiplied by a tax surcharge.
With a recommended price, expected profit equals `H * w` and the hourly
earning equals the target rate.

Example: H = 12, w = 50, K = 50, t = 0.20, r = 0.10 gives a price of 928.57,
taxes and reserves of 278.57, profit of 600.00 and 50.00 per hour.

## Separation

- internal costs (`K`), the quoted price and income actually booked
  (`transactions.job_id`, positive amounts) are three separate values.
- If `target_hourly_rate`, `tax_rate` or `reserve_rate` is missing, no price is
  calculated; the function returns the missing setting names instead.

## Open decisions

- Whether `w` is a net target or a pre-tax rate. Under this formula it is the
  amount kept after taxes and reserves on the labour part.
- VAT is not modelled.

## Monthly hour limit

`check_monthly_hours` sums the hours of all jobs starting in the same month
(shooting + editing, plus organisation hours if `org_hours_billable`). It only
informs; it never blocks. A job counts fully in the month of its start date.
