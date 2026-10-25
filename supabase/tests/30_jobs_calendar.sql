-- Jobs: calculation, monthly hour limit, calendar integration.
begin;
select t.seed();

select t.login('alice');
update public.user_settings set target_hourly_rate = 50, tax_rate = 0.20, reserve_rate = 0.10,
  billable_hours_per_month = 100 where user_id = auth.uid();

-- Calculation --------------------------------------------------------------------
-- H = 4 + 6 + 2 = 12 h, K = 20 + 30 = 50
-- price = (12 * 50 + 50) / (1 - 0.30) = 928.57
insert into public.jobs (id, name, client, start_date, shooting_hours, editing_hours, organisation_hours,
                         travel_costs, other_costs)
values ('11111111-0000-0000-0000-000000000001', 'Hochzeit Meier', 'Meier', '2027-03-10', 4, 6, 2, 20, 30);

select t.eq((select total_hours::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '12.00', 'total planned working time');
select t.eq((select planned_costs::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '50.00', 'planned internal costs');
select t.eq((select recommended_price::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '928.57', 'recommended price');
select t.eq((select taxes_and_reserves::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '278.57', 'taxes and reserves are a share of the price (30%)');
select t.eq((select expected_profit::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '600.00', 'expected profit equals hours x hourly rate');
select t.eq((select effective_hourly_rate::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '50.00', 'effective hourly rate matches the target');
select t.eq((select cardinality(missing_settings)::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '0', 'no missing settings');
select t.eq((select booked_income::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '0', 'nothing booked yet');

-- A quoted price replaces the recommendation for profit and hourly rate.
update public.jobs set quoted_price = 1000 where id = '11111111-0000-0000-0000-000000000001';
select t.eq((select recommended_price::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '928.57', 'recommendation stays visible next to a quote');
select t.eq((select expected_profit::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '650.00', 'profit from quoted price: 1000 - 50 - 300');
select t.eq((select effective_hourly_rate::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '54.17', 'hourly rate from quoted price');

-- Booked income is separate from the quote.
insert into public.transactions (label, amount, booked_on, job_id)
  values ('Anzahlung Meier', 500, t.today(), '11111111-0000-0000-0000-000000000001');
select t.eq((select booked_income::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '500.00', 'booked income is tracked separately');
select t.eq((select quoted_price::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '1000.00', 'quote is not changed by bookings');

-- Zero rates are valid and costs are not surcharged.
update public.user_settings set tax_rate = 0, reserve_rate = 0;
update public.jobs set quoted_price = null where id = '11111111-0000-0000-0000-000000000001';
select t.eq((select recommended_price::text from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')), '650.00', 'without taxes: hours x rate + costs');
update public.user_settings set tax_rate = 0.20, reserve_rate = 0.10;

-- Zero hours must not divide by zero.
insert into public.jobs (id, name, start_date, travel_costs) values ('11111111-0000-0000-0000-000000000002', 'Nur Fahrt', '2027-03-11', 10);
select t.ok((select effective_hourly_rate is null from public.calculate_job_quote('11111111-0000-0000-0000-000000000002')), 'no hourly rate for a job without hours');

-- Constraints
select t.throws($$insert into public.jobs (name, start_date, shooting_hours) values ('x', '2027-01-01', -1)$$, '23514', 'negative hours rejected');
select t.throws($$insert into public.jobs (name, start_date, travel_costs) values ('x', '2027-01-01', -5)$$, '23514', 'negative costs rejected');
select t.throws($$insert into public.jobs (name, start_date, end_date) values ('x', '2027-01-02', '2027-01-01')$$, '23514', 'end date before start date rejected');
select t.throws($$insert into public.jobs (name, start_date, start_time, end_time) values ('x', '2027-01-02', '12:00', '10:00')$$, '23514', 'end time before start time rejected');
select t.logout();

-- Missing settings: no invented price -----------------------------------------------
select t.login('bob');
insert into public.jobs (id, name, start_date, shooting_hours, travel_costs)
  values ('22222222-0000-0000-0000-000000000001', 'Porträt', '2027-03-12', 3, 15);
select t.ok((select recommended_price is null and expected_profit is null from public.calculate_job_quote('22222222-0000-0000-0000-000000000001')),
  'no price is invented when settings are missing');
select t.eq((select array_to_string(missing_settings, ',') from public.calculate_job_quote('22222222-0000-0000-0000-000000000001')),
  'target_hourly_rate,tax_rate,reserve_rate', 'missing settings are reported');
select t.eq((select total_hours::text from public.calculate_job_quote('22222222-0000-0000-0000-000000000001')), '3.00', 'hours and costs are still shown');
select t.throws($$select * from public.calculate_job_quote('11111111-0000-0000-0000-000000000001')$$, 'P0002', 'cannot calculate another user''s job');
select t.eq((select count(*)::text from public.jobs), '1', 'jobs are private');
select t.ok((select exceeds = false and monthly_limit is null from public.check_monthly_hours('2027-03-01', 500, 0, 0)),
  'no limit configured: never a warning');
select t.logout();

-- Monthly hour limit -----------------------------------------------------------------
select t.login('alice');
-- March 2027 so far: job 1 = 12 h (incl. 2 h organisation), job 2 = 0 h.
insert into public.jobs (id, name, start_date, shooting_hours, editing_hours, organisation_hours)
  values ('11111111-0000-0000-0000-000000000003', 'Großauftrag', '2027-03-25', 40, 30, 10);
select t.eq((select planned_hours::text from public.check_monthly_hours('2027-03-20', 0, 0, 0)), '92.00', 'planned hours of the month');
select t.ok((select exceeds from public.check_monthly_hours('2027-03-20', 5, 5, 0)), 'warns when the limit would be exceeded (92 + 10 > 100)');
select t.ok(not (select exceeds from public.check_monthly_hours('2027-03-20', 2, 2, 0)), 'no warning below the limit (92 + 4 <= 100)');
select t.ok(not (select exceeds from public.check_monthly_hours('2027-03-20', 4, 4, 0)), 'exactly at the limit is not exceeded');
select t.eq((select planned_hours::text from public.check_monthly_hours('2027-03-20', 0, 0, 0, '11111111-0000-0000-0000-000000000003')), '12.00',
  'a job being edited is excluded from its own total');
select t.eq((select planned_hours::text from public.check_monthly_hours('2027-04-02', 0, 0, 0)), '0', 'other months are not counted');
update public.user_settings set org_hours_billable = false;
select t.eq((select planned_hours::text from public.check_monthly_hours('2027-03-20', 0, 0, 0)), '80.00', 'organisation hours can be excluded by rule (10 + 70)');
select t.eq((select new_hours::text from public.check_monthly_hours('2027-03-20', 1, 1, 50)), '2', 'new organisation hours also follow the rule');
update public.user_settings set org_hours_billable = true;
select t.logout();

-- Calendar integration ----------------------------------------------------------------
select t.login('alice');
select t.eq((select count(*)::text from public.calendar_events where kind = 'job' and job_id = '11111111-0000-0000-0000-000000000001'), '1',
  'creating a job creates exactly one calendar entry');
update public.jobs set name = 'Hochzeit Meier (neu)', start_date = '2027-03-11', start_time = '14:00', end_time = '18:00'
  where id = '11111111-0000-0000-0000-000000000001';
update public.jobs set notes = 'nur Notiz' where id = '11111111-0000-0000-0000-000000000001';
select t.eq((select count(*)::text from public.calendar_events where job_id = '11111111-0000-0000-0000-000000000001' and kind = 'job'), '1',
  'editing a job does not duplicate the entry');
select t.eq((select title || '|' || start_date || '|' || start_time from public.calendar_events where job_id = '11111111-0000-0000-0000-000000000001' and kind = 'job'),
  'Hochzeit Meier (neu)|2027-03-11|14:00:00', 'calendar entry follows job changes');

select t.throws($$insert into public.calendar_events (kind, title, start_date, job_id)
  values ('job', 'fake', '2027-01-01', '11111111-0000-0000-0000-000000000001')$$, '42501', 'clients cannot write job-type entries');
update public.calendar_events set title = 'manipuliert' where kind = 'job';
select t.logout();
select t.ok(not exists (select 1 from public.calendar_events where title = 'manipuliert'), 'clients cannot edit job-type entries (RLS filters the update)');

select t.login('alice');
insert into public.calendar_events (id, title, start_date, start_time, end_time, location, notes, job_id)
  values ('33333333-0000-0000-0000-000000000001', 'Vorbesprechung', '2027-03-05', '10:00', '11:00', 'Café', 'Skizzen mitbringen',
          '11111111-0000-0000-0000-000000000001');
select t.eq((select kind from public.calendar_events where id = '33333333-0000-0000-0000-000000000001'), 'appointment', 'users create appointments');
select t.throws($$insert into public.calendar_events (title, start_date, end_date) values ('x', '2027-03-05', '2027-03-01')$$, '23514', 'appointment end before start rejected');
select t.throws(format($$insert into public.calendar_events (title, start_date, job_id) values ('x', '2027-03-05', %L)$$, '22222222-0000-0000-0000-000000000001'),
  '23503', 'cannot link an appointment to another user''s job');
select t.eq((select count(*)::text from public.calendar_feed), '4', 'feed shows three jobs and one appointment');
select t.eq((select count(*)::text from public.calendar_feed where kind = 'job'), '3', 'job entries are distinguishable by kind');
select t.logout();

select t.login('bob');
select t.eq((select count(*)::text from public.calendar_feed), '1', 'calendar feed only contains the user''s own entries (bob has one job)');
select t.eq((select count(*)::text from public.calendar_events where title = 'Vorbesprechung'), '0', 'appointments are private');
select t.logout();

-- Deleting the job removes its entry but keeps linked appointments.
select t.login('alice');
delete from public.jobs where id = '11111111-0000-0000-0000-000000000001';
select t.eq((select count(*)::text from public.calendar_events where kind = 'job' and title like 'Hochzeit%'), '0', 'job entry disappears with the job');
select t.eq((select job_id is null from public.calendar_events where id = '33333333-0000-0000-0000-000000000001')::text, 'true',
  'a linked appointment survives and loses only the link');
select t.eq((select job_id from public.transactions where label = 'Anzahlung Meier')::text, null,
  'bookings survive job deletion (link is cleared)');
select t.eq((select count(*)::text from public.transactions where label = 'Anzahlung Meier'), '1', 'booked income is kept');
select t.logout();

-- Needed equipment: own only --------------------------------------------------------------
select t.login('alice');
insert into public.equipment (id, name) values ('44444444-0000-0000-0000-000000000001', 'Kamera A');
insert into public.job_equipment (job_id, equipment_id) values ('11111111-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000001');
select t.eq((select count(*)::text from public.job_equipment), '1', 'own equipment can be attached to a job');
select t.logout();
select t.login('bob');
insert into public.equipment (id, name) values ('44444444-0000-0000-0000-000000000002', 'Kamera B');
select t.throws($$insert into public.job_equipment (job_id, equipment_id) values ('22222222-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001')$$,
  '23503', 'cannot attach another user''s equipment to a job');
select t.throws($$insert into public.job_equipment (job_id, equipment_id) values ('11111111-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002')$$,
  '23503', 'cannot attach equipment to another user''s job');
select t.logout();

rollback;
