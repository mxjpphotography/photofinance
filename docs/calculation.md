# Job calculation

Implemented in `public.calculate_job_quote(job_id)` (migrations 7 and 9) and covered by tests.

## Decisions (by the owner)

- The target hourly rate is a rate **before income tax and reserves**.
- The photographer is a small business owner **without VAT**: prices contain no VAT.
- Whether organisation hours count towards the monthly limit is a **setting**
  (`org_hours_billable`, changeable on the settings page).

## Inputs

- Job: shooting, editing and organisation hours; travel and other costs;
  optional quoted price.
- Settings: `target_hourly_rate` (w, required), `tax_rate` (t, optional),
  `reserve_rate` (r, optional).

## Formula

```
H = shooting + editing + organisation hours
K = travel costs + other costs                       internal costs

recommended price = H * w + K
price used        = quoted price, else recommended price
expected profit   = price used - K                   before tax and reserves
hourly earning    = expected profit / H              (empty when H = 0)
set aside         = expected profit * (t + r)        information only
```

`t` and `r` are shares of the **profit** that the user wants to set aside. They
do not change the price, so taxes are never counted twice and costs never get a
surcharge. If they are not configured, nothing is set aside.

Example: H = 12, w = 50, K = 50 gives a price of 650.00, profit and hourly
earning of 600.00 and 50.00 per hour. With t + r = 30 % the amount to set aside
is 180.00. With a quoted price of 1000.00 the profit is 950.00 (79.17 per hour)
and the amount to set aside is 285.00.

## Separation

- internal costs (`K`), the quoted price and income actually booked
  (`transactions.job_id`, positive amounts) are three separate values.
- If `target_hourly_rate` is missing, no price is calculated; the function
  returns the missing setting name instead of an invented number.

## Not modelled

- VAT / small-business turnover threshold. Prices are net = gross.
- Income tax itself: `t + r` is a planning share, not a tax calculation.

## Monthly hour limit

`check_monthly_hours` sums the hours of all jobs starting in the same month
(shooting + editing, plus organisation hours if `org_hours_billable`). It only
informs; it never blocks. A job counts fully in the month of its start date.
