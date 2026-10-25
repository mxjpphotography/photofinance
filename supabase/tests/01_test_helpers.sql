-- Tiny assertion library for the SQL test suite (no extensions required).
-- Each test file runs inside BEGIN ... ROLLBACK, so nothing persists.

create schema t;
grant usage on schema t to public;

-- Fixed test users.
create function t.u(name text) returns uuid language sql immutable as $$
  select case name
    when 'alice' then 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    when 'bob'   then 'bbbbbbbb-0000-0000-0000-000000000002'::uuid
    when 'carol' then 'cccccccc-0000-0000-0000-000000000003'::uuid
    when 'dave'  then 'dddddddd-0000-0000-0000-000000000004'::uuid
    when 'ada'   then 'adadadad-0000-0000-0000-000000000005'::uuid
    when 'eve'   then 'eeeeeeee-0000-0000-0000-000000000006'::uuid
  end
$$;

-- Act as an authenticated API user (what PostgREST does with a JWT).
create function t.login(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', t.u(who)::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('role', 'anon', false);
end $$;

-- Back to the privileged session user.
create function t.logout() returns void language plpgsql as $$
begin
  perform set_config('role', session_user::text, false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- "Today" as the application sees it (all test users use UTC).
create function t.today() returns date language sql stable as $$
  select (now() at time zone 'UTC')::date
$$;

create function t.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is true then
    raise notice 'ok - %', name;
  else
    raise exception 'FAIL - %', name;
  end if;
end $$;

create function t.eq(actual text, expected text, name text) returns void language plpgsql as $$
begin
  if actual is not distinct from expected then
    raise notice 'ok - %', name;
  else
    raise exception 'FAIL - % (expected %, got %)', name, expected, actual;
  end if;
end $$;

-- Passes when the statement fails (with the given SQLSTATE if one is given).
create function t.throws(stmt text, expected_state text, name text) returns void language plpgsql as $$
declare
  failed boolean := false;
  got text;
begin
  begin
    execute stmt;
  exception when others then
    failed := true;
    got := sqlstate;
  end;
  if not failed then
    raise exception 'FAIL - % (statement did not fail)', name;
  elsif expected_state is not null and got <> expected_state then
    raise exception 'FAIL - % (expected SQLSTATE %, got %)', name, expected_state, got;
  end if;
  raise notice 'ok - %', name;
end $$;

-- Users: alice, bob, eve approved; ada approved admin; carol pending; dave blocked.
-- Must be called as the privileged session user.
create function t.seed() returns void language plpgsql as $$
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (t.u('alice'), 'alice@example.test', '{"full_name": "Alice Anders"}'),
    (t.u('bob'),   'bob@example.test',   '{"full_name": "Bob Berger"}'),
    (t.u('carol'), 'carol@example.test', '{"full_name": "Carol Clemens"}'),
    (t.u('dave'),  'dave@example.test',  '{"full_name": "Dave Dietrich"}'),
    (t.u('ada'),   'ada@example.test',   '{"full_name": "Ada Admin"}'),
    (t.u('eve'),   'eve@example.test',   '{"full_name": "Eve Ernst"}');

  update public.user_access set status = 'approved'
   where user_id in (t.u('alice'), t.u('bob'), t.u('eve'), t.u('ada'));
  update public.user_access set status = 'approved', role = 'admin' where user_id = t.u('ada');
  update public.user_access set status = 'blocked' where user_id = t.u('dave');
  update public.user_settings set timezone = 'UTC';
end $$;
