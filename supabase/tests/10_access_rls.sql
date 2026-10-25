-- Access gate, roles and basic RLS isolation.
begin;
select t.seed();

-- Sign-up trigger ------------------------------------------------------------
select t.eq((select status::text from public.user_access where user_id = t.u('carol')), 'pending',
  'new sign-up starts as pending');
select t.eq((select full_name from public.profiles where id = t.u('carol')), 'Carol Clemens',
  'profile name taken from sign-up metadata');
select t.eq((select count(*)::text from public.user_settings where user_id = t.u('carol')), '1',
  'default settings row is created on sign-up');
insert into auth.users (id, email) values ('99999999-0000-0000-0000-000000000009', 'noname@example.test');
select t.eq((select full_name from public.profiles where id = '99999999-0000-0000-0000-000000000009'), 'noname',
  'missing name falls back to e-mail prefix and does not break sign-up');

-- Pending user ---------------------------------------------------------------
select t.login('carol');
select t.eq((select status::text from public.user_access where user_id = t.u('carol')), 'pending',
  'pending user can read own status');
select t.ok(not public.is_approved(), 'pending user is not approved');
select t.eq((select count(*)::text from public.finance_categories), '0', 'pending user sees no categories');
select t.eq((select count(*)::text from public.user_settings), '0', 'pending user cannot read settings');
select t.throws($$insert into public.transactions (label, amount, booked_on) values ('x', 5, current_date)$$,
  '42501', 'pending user cannot insert bookings (RLS)');
select t.throws($$insert into public.jobs (name, start_date) values ('x', current_date)$$,
  '42501', 'pending user cannot insert jobs (RLS)');
select t.throws($$insert into public.equipment (name) values ('x')$$,
  '42501', 'pending user cannot insert equipment (RLS)');
select t.eq((select count(*)::text from public.rental_offers), '0', 'pending user sees no rental offers');
update public.profiles set full_name = 'Carol C.' where id = t.u('carol');
select t.eq((select full_name from public.profiles where id = t.u('carol')), 'Carol C.',
  'user may edit own display name');

-- Privilege escalation attempts ----------------------------------------------
select t.throws($$update public.user_access set status = 'approved' where user_id = auth.uid()$$,
  '42501', 'user cannot approve themselves');
select t.throws($$update public.user_access set role = 'admin' where user_id = auth.uid()$$,
  '42501', 'user cannot make themselves admin');
select t.throws($$insert into public.user_access (user_id, status) values (gen_random_uuid(), 'approved')$$,
  '42501', 'user cannot insert access rows');
select t.throws($$delete from public.user_access where user_id = auth.uid()$$,
  '42501', 'user cannot delete access rows');
select t.throws($$update public.profiles set id = gen_random_uuid() where id = auth.uid()$$,
  '42501', 'profile id cannot be changed');
select t.throws($$select public.admin_set_user_access(auth.uid(), 'approved', 'admin')$$,
  '42501', 'non-admin cannot call admin function');
select t.logout();

-- Approved user --------------------------------------------------------------
select t.login('alice');
select t.ok(public.is_approved(), 'approved user passes the gate');
select t.ok(not public.is_admin(), 'normal user is not admin');
select t.ok((select count(*) from public.finance_categories) >= 5, 'approved user reads finance categories');
select t.ok((select count(*) from public.equipment_categories) >= 5, 'approved user reads equipment categories');
select t.throws($$update public.user_access set status = 'blocked' where user_id = auth.uid()$$,
  '42501', 'approved user cannot change own status');
select t.eq((select count(*)::text from public.user_access), '1', 'user sees only own access row');
select t.eq((select count(*)::text from public.profiles where id <> auth.uid()), '0',
  'no other profiles visible without a relationship');
update public.profiles set full_name = 'Hacked' where id = t.u('bob');
select t.logout();
select t.eq((select full_name from public.profiles where id = t.u('bob')), 'Bob Berger',
  'cannot rename another user (0 rows affected)');
select t.login('alice');
select t.throws($$insert into public.finance_categories (code, name) values ('hack', 'Hack')$$,
  '42501', 'normal user cannot create categories');
update public.finance_categories set is_active = false;
select t.logout();
select t.eq((select count(*)::text from public.finance_categories where is_active), (select count(*)::text from public.finance_categories),
  'normal user cannot deactivate categories (RLS filters the update to 0 rows)');

-- Blocked user ---------------------------------------------------------------
select t.login('dave');
select t.ok(not public.is_approved(), 'blocked user is not approved');
select t.eq((select count(*)::text from public.finance_categories), '0', 'blocked user sees nothing');
select t.throws($$insert into public.transactions (label, amount, booked_on) values ('x', 5, current_date)$$,
  '42501', 'blocked user cannot write');
select t.logout();

-- Anonymous role ---------------------------------------------------------------
select t.anon();
select t.throws('select * from public.transactions', '42501', 'anon has no access to bookings');
select t.throws('select * from public.profiles', '42501', 'anon has no access to profiles');
select t.throws('select * from public.rental_offers', '42501', 'anon has no access to rental offers');
select t.throws('select * from public.calendar_feed', '42501', 'anon has no access to calendar feed');
select t.throws('select public.budget_total()', '42501', 'anon cannot run reporting functions');
select t.logout();

-- Admin ------------------------------------------------------------------------
select t.login('ada');
select t.ok(public.is_admin(), 'admin recognised server-side');
select t.eq((select count(*)::text from public.user_access), '7', 'admin can read all access rows');
select public.admin_set_user_access(t.u('carol'), 'approved');
select t.eq((select status::text from public.user_access where user_id = t.u('carol')), 'approved',
  'admin approves a pending user');
select t.throws($$select public.admin_set_user_access(auth.uid(), 'blocked')$$,
  '42501', 'admin cannot lock themselves out');
insert into public.finance_categories (code, name) values ('test_cat', 'Testkategorie');
select t.ok(true, 'admin can create categories');
update public.finance_categories set is_active = false where code = 'test_cat';
select t.ok(true, 'admin can deactivate categories');
select t.logout();

select t.login('carol');
select t.ok(public.is_approved(), 'newly approved user now passes the gate');
select t.ok((select count(*) from public.finance_categories) > 0, 'approved user now sees categories');
select t.logout();

-- Settings validation ----------------------------------------------------------
select t.login('alice');
select t.throws($$update public.user_settings set tax_rate = 0.6, reserve_rate = 0.5 where user_id = auth.uid()$$,
  '23514', 'tax + reserve must stay below 100%');
select t.throws($$update public.user_settings set timezone = 'Mars/Olympus' where user_id = auth.uid()$$,
  '22023', 'unknown time zone rejected');
select t.throws($$update public.user_settings set balance_months = 0 where user_id = auth.uid()$$,
  '23514', 'month count below 1 rejected');
select t.throws($$update public.user_settings set billable_hours_per_month = 0 where user_id = auth.uid()$$,
  '23514', 'zero billable hours rejected');
select t.throws($$update public.user_settings set target_hourly_rate = -1 where user_id = auth.uid()$$,
  '23514', 'negative hourly rate rejected');
update public.user_settings set target_hourly_rate = 50, tax_rate = 0.2, reserve_rate = 0.1,
  billable_hours_per_month = 100, balance_months = 12 where user_id = auth.uid();
select t.eq((select balance_months::text from public.user_settings), '12', 'valid settings are stored');
select t.logout();
select t.eq((select count(*)::text from public.user_settings where balance_months = 12), '1',
  'settings change affected only own row');

rollback;
