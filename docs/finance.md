# Finance

## Bookings

- Amount is `numeric(12,2)`. Positive = income, negative = expense, zero is invalid.
- `kind` is a generated column; clients cannot write it.
- Budget, monthly balances and category totals count only bookings with
  `booked_on <= today` (today in the user's time zone). Future-dated bookings
  do not affect them.

## Recurring rules

- A rule (`recurrence_rules`) is separate from its bookings (`transactions`).
- Supported intervals: every N weeks, months or years, optional end date,
  active flag.
- **Materialisation.** `generate_due_transactions()` creates one normal booking
  per due occurrence. It is idempotent through `UNIQUE (rule, occurrence_date)`
  and a `generated_through` watermark. Opening a page never creates duplicates,
  and an occurrence the user deleted is not recreated.
- **Month ends.** Occurrences are always computed from the start date
  (31 Jan -> 28 Feb -> 31 Mar), so they do not drift.
- **History.** Editing label, amount or category affects only later
  occurrences. The schedule (start, interval) is locked once bookings exist:
  deactivate the rule and create a new one. A rule with bookings cannot be deleted.
- **Re-activation** does not back-fill the time the rule was off.
- **Forecast.** `forecast_recurring(until)` lists future occurrences. They are
  never stored and never part of balances.
