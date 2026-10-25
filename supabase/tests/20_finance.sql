-- Finance: bookings, exact arithmetic, recurring rules, monthly balance, forecast.
begin;
select t.seed();

-- Constraints and ownership ------------------------------------------------------
select t.login('alice');
select t.throws($$insert into public.transactions (label, amount, booked_on) values ('zero', 0, current_date)$$,
  '23514', 'amount zero is rejected');
select t.throws($$insert into public.transactions (label, amount, booked_on) values ('  ', 5, current_date)$$,
  '23514', 'blank label is rejected');
select t.throws(format($$insert into public.transactions (user_id, label, amount, booked_on) values (%L, 'x', 5, current_date)$$, t.u('bob')),
  '42501', 'cannot create a booking for another user');
select t.throws($$insert into public.transactions (label, amount, booked_on, kind) values ('x', 5, current_date, 'expense')$$,
  '428C9', 'generated column kind cannot be written by clients');

-- Exact decimal arithmetic -------------------------------------------------------
insert into public.transactions (label, amount, booked_on) values
  ('a', 0.10, t.today()), ('b', 0.20, t.today()), ('c', -0.05, t.today());
select t.eq(public.budget_total()::text, '0.25', 'budget sum is exact (0.10 + 0.20 - 0.05)');
select t.eq((select kind from public.transactions where label = 'a'), 'income', 'positive amount is income');
select t.eq((select kind from public.transactions where label = 'c'), 'expense', 'negative amount is expense');

-- Future bookings are not part of the budget.
insert into public.transactions (label, amount, booked_on) values ('future', 1000, t.today() + 5);
select t.eq(public.budget_total()::text, '0.25', 'future-dated booking is excluded from the budget');
delete from public.transactions where label = 'future';

-- Isolation ----------------------------------------------------------------------
select t.logout();
select t.login('bob');
select t.eq((select count(*)::text from public.transactions), '0', 'other users cannot read bookings');
select t.eq(public.budget_total()::text, '0.00', 'budget of a user without bookings is zero');
update public.transactions set amount = 999;
delete from public.transactions;
select t.logout();
select t.eq((select count(*)::text from public.transactions where user_id = t.u('alice')), '3',
  'other users can neither update nor delete bookings');

-- Occurrence math ------------------------------------------------------------------
select t.eq(public.recurrence_occurrence('2026-01-31', 'month', 1, 1)::text, '2026-02-28', 'month-end clamps to 28 Feb');
select t.eq(public.recurrence_occurrence('2026-01-31', 'month', 1, 2)::text, '2026-03-31', 'month-end does not drift (back to 31 Mar)');
select t.eq(public.recurrence_occurrence('2028-01-31', 'month', 1, 1)::text, '2028-02-29', 'leap year handled');
select t.eq(public.recurrence_occurrence('2026-01-15', 'month', 3, 2)::text, '2026-07-15', 'quarterly via interval_count');
select t.eq(public.recurrence_occurrence('2026-01-05', 'week', 2, 3)::text, '2026-02-16', 'bi-weekly');
select t.eq(public.recurrence_occurrence('2028-02-29', 'year', 1, 1)::text, '2029-02-28', 'yearly from 29 Feb');

-- Recurring rules -------------------------------------------------------------------
select t.login('alice');

-- Monthly rule that started 70 days ago: occurrences at about -70, -40, -10 days.
insert into public.recurrence_rules (label, amount, interval_unit, start_date)
  values ('Software', -19.99, 'month', t.today() - 70);
select t.eq(public.generate_due_transactions()::text, '3', 'generates exactly the due occurrences');
select t.eq(public.generate_due_transactions()::text, '0', 'second run creates nothing (idempotent)');
select t.eq(public.generate_due_transactions()::text, '0', 'third run creates nothing (idempotent)');
select t.eq((select count(*)::text from public.transactions where recurrence_rule_id is not null), '3',
  'exactly three bookings exist for the rule');
select t.ok((select max(booked_on) from public.transactions where recurrence_rule_id is not null) <= t.today(),
  'no booking lies in the future');
select t.eq((select count(distinct occurrence_date)::text from public.transactions where recurrence_rule_id is not null), '3',
  'occurrence dates are unique');
select t.throws(format($$insert into public.transactions (label, amount, booked_on, recurrence_rule_id, occurrence_date)
    select 'dup', amount, occurrence_date, recurrence_rule_id, occurrence_date
    from public.transactions where recurrence_rule_id is not null limit 1$$),
  '23505', 'duplicate occurrence is rejected by the database');

-- Editing a rule leaves history untouched.
update public.recurrence_rules set amount = -29.99, label = 'Software (neu)' where label = 'Software';
select t.eq((select count(*)::text from public.transactions where amount = -19.99 and label = 'Software'), '3',
  'rule edit does not rewrite historic bookings');
select t.eq(public.generate_due_transactions()::text, '0', 'rule edit does not create bookings');
select t.throws($$update public.recurrence_rules set start_date = start_date - 1$$,
  '23514', 'schedule is locked once bookings exist');
select t.throws($$update public.recurrence_rules set interval_unit = 'week'$$,
  '23514', 'interval is locked once bookings exist');
select t.throws($$update public.recurrence_rules set generated_through = null$$,
  '42501', 'clients cannot reset the generation watermark');

-- Deleting a generated booking does not resurrect it.
delete from public.transactions where id = (select id from public.transactions
  where recurrence_rule_id is not null order by booked_on limit 1);
select t.eq(public.generate_due_transactions()::text, '0', 'deleted occurrence is not recreated');
select t.eq((select count(*)::text from public.transactions where recurrence_rule_id is not null), '2', 'history keeps its deletion');

-- A rule with bookings cannot be deleted (history is protected); it can be deactivated.
select t.throws($$delete from public.recurrence_rules$$, '23503', 'rule with bookings cannot be deleted');
update public.recurrence_rules set is_active = false;
select t.eq(public.generate_due_transactions()::text, '0', 'inactive rule generates nothing');
select t.eq((select count(*)::text from public.transactions where recurrence_rule_id is not null), '2', 'deactivation keeps history');
delete from public.transactions where recurrence_rule_id is not null;
delete from public.recurrence_rules;

-- End date stops generation: weekly from -15 days, ended 8 days ago -> -15, -8.
insert into public.recurrence_rules (label, amount, interval_unit, start_date, end_date)
  values ('Kurs', 50, 'week', t.today() - 15, t.today() - 8);
select t.eq(public.generate_due_transactions()::text, '2', 'end date stops generation');
delete from public.transactions where recurrence_rule_id is not null;
delete from public.recurrence_rules;

-- Re-activation skips what was missed while the rule was off.
insert into public.recurrence_rules (label, amount, interval_unit, start_date, is_active)
  values ('Pausiert', -10, 'week', t.today() - 30, false);
update public.recurrence_rules set is_active = true;
select t.eq(public.generate_due_transactions()::text, '0', 're-activation does not back-fill the pause');
select t.ok((select generated_through from public.recurrence_rules) >= t.today() - 1,
  'watermark moved up on re-activation');
delete from public.recurrence_rules;

-- Future start: nothing is booked, but it shows up in the forecast.
insert into public.recurrence_rules (label, amount, interval_unit, start_date)
  values ('Zukunft', -100, 'month', t.today() + 10);
select t.eq(public.generate_due_transactions()::text, '0', 'future rule books nothing yet');
select t.eq((select count(*)::text from public.forecast_recurring(t.today() + 95) where label = 'Zukunft'), '3',
  'forecast lists upcoming occurrences (about 10, 40 and 70 days ahead)');
select t.ok((select min(occurrence_date) from public.forecast_recurring(t.today() + 95)) > t.today(),
  'forecast only contains future dates');
select t.eq(public.budget_total()::text, '0.25', 'forecast never changes the budget');
select t.throws($$select * from public.forecast_recurring(current_date + 5000)$$, '22023', 'forecast horizon is capped');
delete from public.recurrence_rules;

-- Weekly rule for the balance tests: -15, -8, -1 days -> three +10.00 bookings.
insert into public.recurrence_rules (label, amount, interval_unit, start_date)
  values ('Wiederkehrend', 10, 'week', t.today() - 15);
select t.eq(public.generate_due_transactions()::text, '3', 'weekly rule generates three bookings');

-- Monthly balance ---------------------------------------------------------------------
-- One-time bookings on the 5th of the previous month.
insert into public.transactions (label, amount, booked_on) values
  ('Honorar', 200.50, (date_trunc('month', t.today()) - interval '1 month')::date + 4),
  ('Objektiv', -50.25, (date_trunc('month', t.today()) - interval '1 month')::date + 4);
insert into public.transactions (label, amount, booked_on) values ('weit weg', 5000, t.today() + 400);

select t.eq((select count(*)::text from public.monthly_balance(3)), '3', 'monthly balance returns the requested months');
select t.eq((select min(month)::text from public.monthly_balance(3)),
  (date_trunc('month', t.today()) - interval '2 months')::date::text, 'oldest month first');
select t.eq((select income::text from public.monthly_balance(3)
             where month = (date_trunc('month', t.today()) - interval '1 month')::date) ,
  (200.50 + (select coalesce(sum(amount), 0) from public.transactions
             where recurrence_rule_id is not null
               and date_trunc('month', booked_on) = date_trunc('month', t.today()) - interval '1 month'))::numeric(14,2)::text,
  'income of previous month = one-time + recurring');
select t.eq((select expense::text from public.monthly_balance(3)
             where month = (date_trunc('month', t.today()) - interval '1 month')::date), '50.25',
  'expenses are reported as positive magnitude');
select t.eq((select sum(income_recurring)::text from public.monthly_balance(3)), '30.00', 'recurring income is split out');
select t.eq((select sum(income_one_time)::text from public.monthly_balance(3)), '200.80',
  'one-time income is split out (200.50 + 0.10 + 0.20 current-day bookings)');
select t.eq((select sum(balance)::text from public.monthly_balance(3)), public.budget_total()::text,
  'sum of monthly balances equals the total budget');
select t.eq((select sum(income - expense)::text from public.monthly_balance(3)), (select sum(balance)::text from public.monthly_balance(3)),
  'balance = income - expense');
select t.throws($$select * from public.monthly_balance(0)$$, '22023', 'month count below 1 is rejected');
select t.throws($$select * from public.monthly_balance(61)$$, '22023', 'month count above 60 is rejected');

-- Category totals ----------------------------------------------------------------------
update public.transactions set category_id = (select id from public.finance_categories where code = 'photo_jobs')
  where label = 'Honorar';
update public.transactions set category_id = (select id from public.finance_categories where code = 'equipment')
  where label = 'Objektiv';
select t.eq((select total::text from public.category_totals(t.today() - 400, t.today())
  where category_id = (select id from public.finance_categories where code = 'photo_jobs') and kind = 'income'),
  '200.50', 'income per category');
select t.eq((select total::text from public.category_totals(t.today() - 400, t.today())
  where category_id = (select id from public.finance_categories where code = 'equipment') and kind = 'expense'),
  '-50.25', 'expense per category');
select t.eq((select coalesce(sum(total), 0)::text from public.category_totals(t.today() - 400, t.today() + 500)),
  public.budget_total()::text, 'category totals never include future bookings');

-- Recurring-link integrity ----------------------------------------------------------------
select t.throws($$update public.transactions set recurrence_rule_id = null, occurrence_date = null
  where recurrence_rule_id is not null$$, '42501', 'recurrence link cannot be edited');
select t.logout();

-- Another user's rule is invisible and cannot be used.
select t.login('bob');
select t.eq((select count(*)::text from public.recurrence_rules), '0', 'rules are private');
select t.eq(public.generate_due_transactions()::text, '0', 'generation only touches own rules');
select t.eq((select count(*)::text from public.monthly_balance(3) where income <> 0 or expense <> 0), '0',
  'other user sees an empty balance');
select t.logout();

-- Scheduled variant (service role / cron) generates for everybody and is not user-callable.
select t.login('alice');
select t.throws('select public.generate_due_transactions_all()', '42501', 'API users cannot call the bulk generator');
select t.logout();

rollback;
