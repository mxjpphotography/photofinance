-- Equipment, blocks, rental requests, availability, visibility.
begin;
select t.seed();

-- Dates relative to today, so the suite does not age (requests must not start in the past).
create function t.d(n integer) returns date language sql stable as $$ select t.today() + 100 + n $$;
-- Id of the item of a request (request id kept in a session setting) for a piece of equipment.
create function t.item(setting text, eq uuid) returns uuid language sql security definer as $$
  select id from public.rental_request_items where request_id = current_setting(setting)::uuid and equipment_id = eq
$$;

-- Fixture: Alice owns five items, Eve owns one flash.
select t.login('alice');
insert into public.equipment (id, name, category_id, manufacturer, model, quantity, purchase_value, description) values
  ('e1000000-0000-0000-0000-000000000001', 'Kamera X', (select id from public.equipment_categories where code = 'cameras'), 'Canon', 'R5', 1, 2500.00, 'Vollformat'),
  ('e1000000-0000-0000-0000-000000000002', 'Objektiv Set', (select id from public.equipment_categories where code = 'lenses'), 'Sigma', 'Art', 3, 900.00, null),
  ('e1000000-0000-0000-0000-000000000003', 'Privat', null, null, null, 1, 100.00, 'nicht verleihen'),
  ('e1000000-0000-0000-0000-000000000004', 'Stativ', (select id from public.equipment_categories where code = 'support'), null, null, 2, 80.00, null),
  ('e1000000-0000-0000-0000-000000000005', 'Defekt', null, null, null, 1, 10.00, null);
update public.equipment set availability_status = 'unavailable' where name = 'Defekt';
insert into public.rental_listings (equipment_id, public_note) values
  ('e1000000-0000-0000-0000-000000000001', 'Nur mit Akku'),
  ('e1000000-0000-0000-0000-000000000002', null),
  ('e1000000-0000-0000-0000-000000000004', null),
  ('e1000000-0000-0000-0000-000000000005', null);
select t.logout();

select t.login('eve');
insert into public.equipment (id, name, quantity) values ('e1000000-0000-0000-0000-000000000006', 'Blitz', 1);
insert into public.rental_listings (equipment_id) values ('e1000000-0000-0000-0000-000000000006');
select t.logout();

-- Privacy: private data stays private ------------------------------------------------
select t.login('bob');
select t.eq((select count(*)::text from public.equipment), '0', 'other members cannot read the equipment table');
select t.eq((select count(*)::text from public.rental_listings), '0', 'other members cannot read raw listings');
select t.eq((select count(*)::text from public.rental_offers), '4', 'members see listed, available items only (camera, lenses, tripod, flash)');
select t.eq((select count(*)::text from public.rental_offers where name in ('Privat', 'Defekt')), '0', 'unlisted and unavailable items are hidden');
select t.throws('select purchase_value from public.rental_offers', '42703', 'offers expose no purchase value');
select t.throws(format($$insert into public.rental_listings (equipment_id, owner_id) values (%L, %L)$$, 'e1000000-0000-0000-0000-000000000003', t.u('bob')),
  '23503', 'cannot list equipment that belongs to somebody else (FK)');
select t.throws(format($$insert into public.rental_listings (equipment_id, owner_id) values (%L, %L)$$, 'e1000000-0000-0000-0000-000000000003', t.u('alice')),
  '42501', 'cannot list equipment in the owner''s name (RLS)');
select t.eq((select count(*)::text from public.rental_offers where owner_name = 'Alice Anders'), '3', 'offers carry the owner''s display name');
select t.logout();
select t.eq((select count(*)::text from information_schema.columns
  where table_schema = 'public' and table_name = 'rental_offers' and column_name in ('purchase_value', 'created_at', 'internal_notes')), '0',
  'offer view has no financial or internal columns');

select t.login('carol');
select t.eq((select count(*)::text from public.rental_offers), '0', 'pending member sees no offers');
select t.eq((select count(*)::text from public.search_rental_offers()), '0', 'pending member gets no search results');
select t.logout();
select t.login('dave');
select t.eq((select count(*)::text from public.rental_offers), '0', 'blocked member sees no offers');
select t.logout();

-- Blocked or deactivated owners disappear from the platform.
select t.login('ada');
select public.admin_set_user_access(t.u('alice'), 'blocked');
select t.logout();
select t.login('bob');
select t.eq((select count(*)::text from public.rental_offers where owner_id = t.u('alice')), '0', 'offers of a blocked owner are hidden');
select t.logout();
select t.login('ada');
select public.admin_set_user_access(t.u('alice'), 'approved');
select t.logout();
select t.login('alice');
update public.rental_listings set is_active = false where equipment_id = 'e1000000-0000-0000-0000-000000000004';
select t.logout();
select t.login('bob');
select t.eq((select count(*)::text from public.rental_offers where owner_id = t.u('alice')), '2', 'deactivated listing is hidden');
select t.logout();
select t.login('alice');
update public.rental_listings set is_active = true where equipment_id = 'e1000000-0000-0000-0000-000000000004';
select t.logout();

-- Search ---------------------------------------------------------------------------------
select t.login('bob');
select t.eq((select count(*)::text from public.search_rental_offers()), '4', 'search returns all offers of others');
select t.eq((select name from public.search_rental_offers('canon')), 'Kamera X', 'search matches manufacturer');
select t.eq((select count(*)::text from public.search_rental_offers('%')), '0', 'wildcard characters are not special');
select t.eq((select name from public.search_rental_offers(null, (select id from public.equipment_categories where code = 'lenses'))), 'Objektiv Set', 'category filter');
select t.throws($$select * from public.search_rental_offers(null, null, current_date, null)$$, '22023', 'half a period is rejected');
select t.logout();
select t.login('alice');
select t.eq((select count(*)::text from public.search_rental_offers() where owner_id = t.u('alice')), '0', 'own items are not part of the search');
select t.logout();

-- Self-blocks --------------------------------------------------------------------------------
select t.login('alice');
insert into public.equipment_blocks (equipment_id, start_date, end_date, reason)
  values ('e1000000-0000-0000-0000-000000000001', t.d(0), t.d(2), 'Wartung');
select t.throws(format($$insert into public.equipment_blocks (equipment_id, start_date, end_date) values ('e1000000-0000-0000-0000-000000000001', %L, %L)$$, t.d(2), t.d(4)),
  '23P01', 'overlapping block on a single item is rejected');
insert into public.equipment_blocks (equipment_id, start_date, end_date)
  values ('e1000000-0000-0000-0000-000000000001', t.d(3), t.d(4));
select t.ok(true, 'adjacent block is accepted');
select t.throws(format($$update public.equipment_blocks set end_date = %L where start_date = %L and equipment_id = 'e1000000-0000-0000-0000-000000000001'$$, t.d(4), t.d(0)),
  '23P01', 'extending a block into another one is rejected');
select t.throws(format($$insert into public.equipment_blocks (equipment_id, start_date, end_date) values ('e1000000-0000-0000-0000-000000000001', %L, %L)$$, t.d(5), t.d(4)),
  '23514', 'end before start is rejected');

-- Multi-unit stock (3 lenses): up to three simultaneous blocks.
insert into public.equipment_blocks (equipment_id, start_date, end_date) values
  ('e1000000-0000-0000-0000-000000000002', t.d(0), t.d(5)),
  ('e1000000-0000-0000-0000-000000000002', t.d(0), t.d(5)),
  ('e1000000-0000-0000-0000-000000000002', t.d(0), t.d(5));
select t.throws(format($$insert into public.equipment_blocks (equipment_id, start_date, end_date) values ('e1000000-0000-0000-0000-000000000002', %L, %L)$$, t.d(3), t.d(8)),
  '23P01', 'fourth simultaneous block on 3 units is rejected');
insert into public.equipment_blocks (equipment_id, start_date, end_date)
  values ('e1000000-0000-0000-0000-000000000002', t.d(6), t.d(9));
select t.ok(true, 'block after the busy period is accepted');
insert into public.equipment_blocks (equipment_id, units, start_date, end_date)
  values ('e1000000-0000-0000-0000-000000000002', 2, t.d(10), t.d(11));
select t.throws(format($$insert into public.equipment_blocks (equipment_id, units, start_date, end_date) values ('e1000000-0000-0000-0000-000000000002', 2, %L, %L)$$, t.d(11), t.d(12)),
  '23P01', '2 + 2 units on 3 are rejected');
insert into public.equipment_blocks (equipment_id, units, start_date, end_date)
  values ('e1000000-0000-0000-0000-000000000002', 1, t.d(11), t.d(12));
select t.ok(true, '2 + 1 units on 3 are accepted');
select t.throws(format($$insert into public.equipment_blocks (equipment_id, units, start_date, end_date) values ('e1000000-0000-0000-0000-000000000002', 4, %L, %L)$$, t.d(30), t.d(31)),
  '23P01', 'more units than exist are rejected');
select t.logout();

select t.login('bob');
select t.throws(format($$insert into public.equipment_blocks (equipment_id, owner_id, start_date, end_date) values ('e1000000-0000-0000-0000-000000000001', %L, %L, %L)$$, t.u('bob'), t.d(50), t.d(51)),
  '23503', 'cannot block somebody else''s equipment (FK)');
select t.throws(format($$insert into public.equipment_blocks (equipment_id, owner_id, start_date, end_date) values ('e1000000-0000-0000-0000-000000000001', %L, %L, %L)$$, t.u('alice'), t.d(50), t.d(51)),
  '42501', 'cannot block in the owner''s name (RLS)');
select t.eq((select count(*)::text from public.equipment_blocks), '0', 'blocks are private to the owner');
select t.logout();

-- Requests ---------------------------------------------------------------------------------------
select t.login('bob');
select set_config('t.rid1', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000001')),
  t.d(20), t.d(22), 'Hochzeit'))::text, false);
select t.eq((select status from public.rental_request_items where request_id = current_setting('t.rid1')::uuid), 'pending', 'a request starts as pending');
select t.eq((select equipment_name from public.rental_request_items where request_id = current_setting('t.rid1')::uuid), 'Kamera X', 'equipment name is snapshotted for the requester');
select t.eq((select owner_id::text from public.rental_request_items where request_id = current_setting('t.rid1')::uuid), t.u('alice')::text, 'owner is resolved server-side');
select t.throws(format($$select public.create_rental_request('[{"equipment_id":"e1000000-0000-0000-0000-000000000001"}]', %L, %L, 'x')$$, t.today() - 1, t.today() + 1),
  '22023', 'start in the past is rejected');
select t.throws(format($$select public.create_rental_request('[{"equipment_id":"e1000000-0000-0000-0000-000000000003"}]', %L, %L, 'x')$$, t.d(60), t.d(61)),
  '22023', 'unlisted equipment cannot be requested');
select t.throws(format($$select public.create_rental_request('[{"equipment_id":"e1000000-0000-0000-0000-000000000005"}]', %L, %L, 'x')$$, t.d(60), t.d(61)),
  '22023', 'unavailable equipment cannot be requested');
select t.throws(format($$select public.create_rental_request('[]', %L, %L, 'x')$$, t.d(60), t.d(61)), '22023', 'empty request rejected');
select t.throws(format($$select public.create_rental_request('[{"equipment_id":"e1000000-0000-0000-0000-000000000001","units":2}]', %L, %L, 'x')$$, t.d(60), t.d(61)),
  '22023', 'more units than offered rejected');
select t.throws(format($$select public.create_rental_request('[{"equipment_id":"e1000000-0000-0000-0000-000000000001"}]', %L, %L, '  ')$$, t.d(60), t.d(61)),
  '23514', 'purpose is required');
select t.throws(format($$select public.create_rental_request('[{"equipment_id":"e1000000-0000-0000-0000-000000000001"}]', %L, %L, 'x')$$, t.d(0), t.d(1)),
  '23P01', 'request for a blocked period is rejected immediately');
-- Direct API abuse
select t.throws(format($$insert into public.rental_request_items (request_id, requester_id, start_date, end_date, equipment_id, owner_id, status)
  values (%L, %L, %L, %L, 'e1000000-0000-0000-0000-000000000004', %L, 'accepted')$$, current_setting('t.rid1'), t.u('bob'), t.d(20), t.d(22), t.u('alice')),
  '22023', 'a requester cannot insert an already accepted item');
select t.throws(format($$insert into public.rental_requests (requester_id, start_date, end_date, purpose) values (%L, %L, %L, 'x')$$, t.u('eve'), t.d(70), t.d(71)),
  '42501', 'cannot create requests in somebody else''s name');
select t.eq((select count(*)::text from public.rental_requests), '1', 'requester sees own request');
select t.logout();

select t.login('alice');
select t.throws(format($$select public.create_rental_request('[{"equipment_id":"e1000000-0000-0000-0000-000000000001"}]', %L, %L, 'x')$$, t.d(60), t.d(61)),
  null, 'cannot rent one''s own equipment');
select t.eq((select count(*)::text from public.rental_request_items), '1', 'owner sees incoming item');
select t.eq((select count(*)::text from public.rental_requests), '1', 'owner sees the request header');
select t.logout();
select t.login('eve');
select t.eq((select count(*)::text from public.rental_request_items), '0', 'unrelated members see no items');
select t.eq((select count(*)::text from public.rental_requests), '0', 'unrelated members see no request headers');

-- A pending request blocks nothing: Eve asks for the same period.
select set_config('t.rid2', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000001')),
  t.d(20), t.d(22), 'Fotoshooting'))::text, false);
select t.ok(true, 'overlapping pending requests are allowed');
select t.logout();

-- Decisions -----------------------------------------------------------------------------------------
select t.login('bob');
select t.throws(format($$update public.rental_request_items set status = 'accepted' where id = %L$$, t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001')),
  '42501', 'the requester cannot accept their own request');
select t.throws(format($$update public.rental_request_items set units = 5 where id = %L$$, t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001')),
  '42501', 'items cannot be edited (no column privilege)');
select t.throws(format($$update public.rental_request_items set owner_id = %L where id = %L$$, t.u('bob'), t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001')),
  '42501', 'owner cannot be changed');
select t.throws(format($$update public.rental_request_items set decision_note = 'ok' where id = %L$$, t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001')),
  '42501', 'the requester cannot write the owner''s decision note');
select t.logout();

select t.login('eve');
update public.rental_request_items set status = 'accepted' where id = t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001');
select t.logout();
select t.eq((select status from public.rental_request_items where id = t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001')), 'pending',
  'unrelated members cannot change a request (RLS)');

select t.login('alice');
update public.rental_request_items set status = 'accepted', decision_note = 'Gerne!'
  where id = t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001');
select t.eq((select status from public.rental_request_items where id = t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001')), 'accepted', 'the owner accepts');
select t.ok((select decided_at is not null from public.rental_request_items where id = t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001')), 'decision time is recorded');
select t.throws(format($$update public.rental_request_items set status = 'accepted' where id = %L$$, t.item('t.rid2', 'e1000000-0000-0000-0000-000000000001')),
  '23P01', 'a conflicting second acceptance is refused');
select t.throws(format($$insert into public.equipment_blocks (equipment_id, start_date, end_date) values ('e1000000-0000-0000-0000-000000000001', %L, %L)$$, t.d(21), t.d(21)),
  '23P01', 'a self-block cannot overlap a confirmed reservation');
update public.rental_request_items set status = 'declined' where id = t.item('t.rid2', 'e1000000-0000-0000-0000-000000000001');
select t.eq((select status from public.rental_request_items where id = t.item('t.rid2', 'e1000000-0000-0000-0000-000000000001')), 'declined', 'the owner declines');
select t.throws(format($$update public.rental_request_items set status = 'accepted' where id = %L$$, t.item('t.rid2', 'e1000000-0000-0000-0000-000000000001')),
  '23514', 'a declined request cannot be revived');
select t.throws(format($$update public.rental_request_items set status = 'pending' where id = %L$$, t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001')),
  '23514', 'accepted cannot go back to pending');
select t.logout();

-- The owner cannot withdraw a pending request; the requester can.
select t.login('bob');
select set_config('t.rid3', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000002')),
  t.d(30), t.d(31), 'Portraits'))::text, false);
select t.logout();
select t.login('alice');
select t.throws(format($$update public.rental_request_items set status = 'cancelled' where id = %L$$, t.item('t.rid3', 'e1000000-0000-0000-0000-000000000002')),
  '42501', 'the owner cannot withdraw a pending request');
select t.logout();
select t.login('bob');
update public.rental_request_items set status = 'cancelled' where id = t.item('t.rid3', 'e1000000-0000-0000-0000-000000000002');
select t.eq((select status from public.rental_request_items where id = t.item('t.rid3', 'e1000000-0000-0000-0000-000000000002')), 'cancelled', 'the requester withdraws a pending request');
select t.logout();

-- Cancelling a confirmed reservation frees the period again.
select t.login('alice');
update public.rental_request_items set status = 'cancelled' where id = t.item('t.rid1', 'e1000000-0000-0000-0000-000000000001');
select t.logout();
select t.login('eve');
select set_config('t.rid4', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000001')),
  t.d(20), t.d(22), 'Neuer Versuch'))::text, false);
select t.logout();
select t.login('alice');
update public.rental_request_items set status = 'accepted' where id = t.item('t.rid4', 'e1000000-0000-0000-0000-000000000001');
select t.eq((select status from public.rental_request_items where id = t.item('t.rid4', 'e1000000-0000-0000-0000-000000000001')), 'accepted', 'a cancelled reservation frees the equipment');
select t.logout();

-- Multi-unit requests --------------------------------------------------------------------------------
select t.login('bob');
select set_config('t.rid5', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000002', 'units', 2)),
  t.d(40), t.d(45), 'Event'))::text, false);
select t.logout();
select t.login('alice');
update public.rental_request_items set status = 'accepted' where id = t.item('t.rid5', 'e1000000-0000-0000-0000-000000000002');
select t.logout();
select t.login('eve');
select t.throws(format($$select public.create_rental_request('[{"equipment_id":"e1000000-0000-0000-0000-000000000002","units":2}]', %L, %L, 'x')$$, t.d(41), t.d(42)),
  '23P01', '2 more units on top of 2 accepted (stock 3) are rejected');
select set_config('t.rid6', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000002', 'units', 1)),
  t.d(41), t.d(42), 'Ein Objektiv'))::text, false);
select t.logout();
select t.login('alice');
update public.rental_request_items set status = 'accepted' where id = t.item('t.rid6', 'e1000000-0000-0000-0000-000000000002');
select t.eq((select status from public.rental_request_items where id = t.item('t.rid6', 'e1000000-0000-0000-0000-000000000002')), 'accepted', '2 + 1 units on a stock of 3 are accepted');
-- Stock cannot be lowered below commitments, but can be raised.
select t.throws($$update public.equipment set quantity = 2 where id = 'e1000000-0000-0000-0000-000000000002'$$, '23P01', 'stock cannot drop below existing reservations');
update public.equipment set quantity = 5 where id = 'e1000000-0000-0000-0000-000000000002';
update public.equipment set quantity = 3 where id = 'e1000000-0000-0000-0000-000000000002';
select t.ok(true, 'stock can be raised and lowered back to the committed level');
select t.throws($$delete from public.equipment where id = 'e1000000-0000-0000-0000-000000000002'$$, '23503', 'equipment with request history cannot be deleted');
select t.logout();

-- Several owners in one request ------------------------------------------------------------------------
select t.login('bob');
select set_config('t.rid7', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000004'),
                    jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000006')),
  t.d(80), t.d(81), 'Studio-Tag'))::text, false);
select t.eq((select count(*)::text from public.rental_request_items where request_id = current_setting('t.rid7')::uuid), '2', 'one request can contain items of several owners');
select t.logout();
select t.login('alice');
select t.eq((select count(*)::text from public.rental_request_items where request_id = current_setting('t.rid7')::uuid), '1', 'each owner sees only their own item');
select t.eq((select count(*)::text from public.rental_requests where id = current_setting('t.rid7')::uuid), '1', 'each owner can read the request header');
update public.rental_request_items set status = 'accepted' where id = t.item('t.rid7', 'e1000000-0000-0000-0000-000000000004');
update public.rental_request_items set status = 'declined' where id = t.item('t.rid7', 'e1000000-0000-0000-0000-000000000006');
select t.logout();
select t.eq((select string_agg(status, ',' order by status) from public.rental_request_items where request_id = current_setting('t.rid7')::uuid), 'accepted,pending',
  'owners decide independently (a foreign item stays untouched)');

-- Availability in search ---------------------------------------------------------------------------------
select t.login('bob');
select t.eq((select count(*)::text from public.search_rental_offers('Objektiv', null, t.d(40), t.d(45))), '0', 'fully booked equipment is hidden from a dated search');
select t.eq((select available_units::text from public.search_rental_offers('Objektiv', null, t.d(40), t.d(45), false)), '0', 'availability shows zero when fully booked');
select t.eq((select available_units::text from public.search_rental_offers('Objektiv', null, t.d(60), t.d(61))), '3', 'free period shows the full stock');
select t.eq((select available_units::text from public.search_rental_offers('Objektiv', null, t.d(46), t.d(46), false)), '3', 'the day after a reservation is free (inclusive end date)');
select t.eq((select available_units::text from public.search_rental_offers('Objektiv', null, t.d(42), t.d(43), false)), '0', 'overlapping the last reserved day shows no availability');
select t.logout();

-- Calendar feed ---------------------------------------------------------------------------------------------
select t.login('alice');
select t.ok((select count(*) from public.calendar_feed where kind = 'equipment_block') >= 5, 'owner sees own blocks in the calendar');
select t.ok((select count(*) from public.calendar_feed where kind = 'rental_out') >= 3, 'owner sees confirmed loans in the calendar');
select t.eq((select count(*)::text from public.calendar_feed where kind = 'rental_in'), '0', 'owner has no incoming rentals');
select t.logout();
select t.login('bob');
select t.eq((select count(*)::text from public.calendar_feed where kind = 'equipment_block'), '0', 'blocks of others are not visible');
select t.eq((select count(*)::text from public.calendar_feed where kind = 'rental_in'), '2', 'requester sees own confirmed rentals (lenses, tripod)');
select t.ok(exists (select 1 from public.calendar_feed where kind = 'rental_in' and title = 'Objektiv Set'), 'requester sees the item name via the snapshot');
select t.eq((select count(*)::text from public.calendar_feed where kind = 'rental_in' and title = 'Kamera X'), '0', 'cancelled reservations are not shown');
select t.logout();

-- Profile visibility ----------------------------------------------------------------------------------------------
select t.login('bob');
select t.eq((select full_name from public.profiles where id = t.u('alice')), 'Alice Anders', 'members see the name of owners they deal with');
select t.eq((select count(*)::text from public.profiles where id = t.u('carol')), '0', 'unrelated profiles stay hidden');
select t.eq((select count(*)::text from public.profiles where id = t.u('dave')), '0', 'blocked members stay hidden');
select t.logout();
select t.login('alice');
select t.eq((select full_name from public.profiles where id = t.u('bob')), 'Bob Berger', 'owners see the name of their requesters');
select t.logout();

-- Derived status overview ------------------------------------------------------------------------------------------------
select t.login('alice');
insert into public.equipment_blocks (equipment_id, start_date, end_date) values ('e1000000-0000-0000-0000-000000000004', t.today(), t.today());
select t.logout();
select t.login('bob');
select set_config('t.rid8', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000004')),
  t.today(), t.today() + 2, 'Jetzt'))::text, false);
select t.logout();
select t.login('eve');
select set_config('t.rid9', (public.create_rental_request(
  jsonb_build_array(jsonb_build_object('equipment_id', 'e1000000-0000-0000-0000-000000000004')),
  t.today() + 10, t.today() + 11, 'Später'))::text, false);
select t.logout();
select t.login('alice');
update public.rental_request_items set status = 'accepted' where id = t.item('t.rid8', 'e1000000-0000-0000-0000-000000000004');
update public.rental_request_items set status = 'accepted' where id = t.item('t.rid9', 'e1000000-0000-0000-0000-000000000004');
select t.eq((select blocked_today || '/' || lent_today || '/' || reserved_upcoming || '/' || available_today
  from public.equipment_overview() where equipment_id = 'e1000000-0000-0000-0000-000000000004'), '1/1/2/0',
  'overview distinguishes blocked, lent, reserved and available (tripod, stock 2)');
select t.eq((select available_today::text from public.equipment_overview() where equipment_id = 'e1000000-0000-0000-0000-000000000003'), '1',
  'untouched equipment is fully available');
select t.logout();

rollback;
