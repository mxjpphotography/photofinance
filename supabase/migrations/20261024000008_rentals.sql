-- Migration 0008: equipment blocks, rental requests, availability and views.
--
-- Rules (documented in docs/rentals.md)
-- * A request is NOT a reservation. Only an ACCEPTED request item occupies
--   equipment. Pending, declined and cancelled items occupy nothing.
-- * Occupancy comes from two sources: self-blocks (equipment_blocks) and
--   accepted request items. For every day of a period,
--       sum(units of overlapping blocks + accepted items) <= equipment.quantity
--   must hold. This covers single items (quantity 1) and multi-unit stock.
-- * The invariant is enforced inside the database by triggers that first lock
--   the equipment row (SELECT ... FOR UPDATE). Concurrent requests for the same
--   equipment are therefore serialised: whoever commits second sees the first
--   one's reservation and fails. No front-end check is needed for correctness.
-- * Periods are whole days with an inclusive end date.
-- * A request may contain several items from different owners. Every owner
--   decides only about their own items, so status lives on the item.

create table public.equipment_blocks (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null,
  owner_id uuid not null default auth.uid(),
  units integer not null default 1 check (units >= 1),
  start_date date not null,
  end_date date not null,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_blocks_end_after_start check (end_date >= start_date),
  constraint equipment_blocks_equipment_fk foreign key (equipment_id, owner_id)
    references public.equipment (id, owner_id) on delete cascade
);

create index equipment_blocks_equipment_idx on public.equipment_blocks (equipment_id, start_date, end_date);

create trigger equipment_blocks_set_updated_at before update on public.equipment_blocks
  for each row execute function public.set_updated_at();

create table public.rental_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  purpose text not null check (char_length(btrim(purpose)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint rental_requests_end_after_start check (end_date >= start_date),
  constraint rental_requests_max_length check (end_date - start_date <= 365),
  constraint rental_requests_period_unique unique (id, requester_id, start_date, end_date)
);

create index rental_requests_requester_idx on public.rental_requests (requester_id);

create table public.rental_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  -- Denormalised on purpose (kept consistent by the composite FKs): it lets
  -- RLS decide without joining back to the header, which avoids policy recursion.
  requester_id uuid not null,
  start_date date not null,
  end_date date not null,
  equipment_id uuid not null,
  owner_id uuid not null,
  -- Snapshot, so the requester can still read the name later although the
  -- equipment table itself is private to the owner.
  equipment_name text not null default '',
  units integer not null default 1 check (units >= 1),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  decision_note text check (char_length(decision_note) <= 1000),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_items_request_fk foreign key (request_id, requester_id, start_date, end_date)
    references public.rental_requests (id, requester_id, start_date, end_date) on delete cascade,
  -- Equipment with request history cannot be deleted; mark it unavailable instead.
  constraint rental_items_equipment_fk foreign key (equipment_id, owner_id)
    references public.equipment (id, owner_id) on delete restrict,
  constraint rental_items_not_own check (owner_id <> requester_id),
  constraint rental_items_unique_per_request unique (request_id, equipment_id)
);

create index rental_items_owner_idx on public.rental_request_items (owner_id, status);
create index rental_items_requester_idx on public.rental_request_items (requester_id, status);
create index rental_items_equipment_idx on public.rental_request_items (equipment_id, start_date, end_date)
  where status = 'accepted';

create trigger rental_items_set_updated_at before update on public.rental_request_items
  for each row execute function public.set_updated_at();

-- Availability core ----------------------------------------------------------------
-- Peak number of units in use on any day of [p_start, p_end]. The peak always
-- occurs on the first day of the window or on the start day of some booking,
-- so only those candidate days are evaluated.
create function public.equipment_peak_usage(
  p_equipment_id uuid,
  p_start date,
  p_end date,
  p_exclude_block uuid default null,
  p_exclude_item uuid default null
)
returns integer
language sql stable security definer
set search_path = ''
as $$
  with occupied as (
    select b.start_date as s, b.end_date as e, b.units as u
    from public.equipment_blocks b
    where b.equipment_id = p_equipment_id
      and b.id is distinct from p_exclude_block
      and b.start_date <= p_end and b.end_date >= p_start
    union all
    select i.start_date, i.end_date, i.units
    from public.rental_request_items i
    where i.equipment_id = p_equipment_id
      and i.status = 'accepted'
      and i.id is distinct from p_exclude_item
      and i.start_date <= p_end and i.end_date >= p_start
  ),
  candidate_days as (
    select p_start as d
    union
    select greatest(o.s, p_start) from occupied o
  )
  select coalesce(max((
    select coalesce(sum(o.u), 0) from occupied o where o.s <= c.d and o.e >= c.d
  )), 0)::integer
  from candidate_days c;
$$;

-- Serialise all capacity decisions for one piece of equipment.
create function public.lock_equipment(p_equipment_id uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  q integer;
begin
  select quantity into q from public.equipment where id = p_equipment_id for update;
  if q is null then
    raise exception 'equipment not found' using errcode = 'P0002';
  end if;
  return q;
end;
$$;

create function public.equipment_blocks_check()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  q integer;
  peak integer;
begin
  q := public.lock_equipment(new.equipment_id);
  peak := public.equipment_peak_usage(new.equipment_id, new.start_date, new.end_date, new.id, null);
  if peak + new.units > q then
    raise exception 'equipment capacity exceeded in the selected period'
      using errcode = '23P01',
            detail = format('quantity %s, already in use %s, requested %s', q, peak, new.units);
  end if;
  return new;
end;
$$;

create trigger equipment_blocks_check
  before insert or update of equipment_id, units, start_date, end_date on public.equipment_blocks
  for each row execute function public.equipment_blocks_check();

-- Request items: validate on creation, enforce transitions and capacity on change.
create function public.rental_items_before_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  q integer;
  peak integer;
  eq record;
begin
  select e.name, e.availability_status, l.is_active as listed
    into eq
  from public.equipment e
  left join public.rental_listings l on l.equipment_id = e.id
  where e.id = new.equipment_id;

  if not found or eq.listed is not true or eq.availability_status <> 'available' then
    raise exception 'equipment is not offered for rent' using errcode = '22023';
  end if;
  if new.status <> 'pending' then
    raise exception 'new requests must start as pending' using errcode = '22023';
  end if;

  q := public.lock_equipment(new.equipment_id);
  if new.units > q then
    raise exception 'requested units exceed the offered quantity' using errcode = '22023';
  end if;

  -- Early, friendly rejection. The binding check happens again on acceptance.
  peak := public.equipment_peak_usage(new.equipment_id, new.start_date, new.end_date, null, null);
  if peak + new.units > q then
    raise exception 'equipment not available in the requested period'
      using errcode = '23P01',
            detail = format('quantity %s, already in use %s, requested %s', q, peak, new.units);
  end if;

  new.equipment_name := eq.name;
  new.decided_at := null;
  return new;
end;
$$;

create trigger rental_items_before_insert before insert on public.rental_request_items
  for each row execute function public.rental_items_before_insert();

create function public.rental_items_before_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  q integer;
  peak integer;
begin
  -- Only status and the decision note are changeable.
  if (new.request_id, new.requester_id, new.equipment_id, new.owner_id, new.units,
      new.start_date, new.end_date, new.equipment_name)
     is distinct from
     (old.request_id, old.requester_id, old.equipment_id, old.owner_id, old.units,
      old.start_date, old.end_date, old.equipment_name) then
    raise exception 'request items are immutable except for status and note' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    -- Allowed transitions and who may perform them.
    if old.status = 'pending' and new.status in ('accepted', 'declined') then
      if actor is not null and actor <> old.owner_id then
        raise exception 'only the owner can accept or decline' using errcode = '42501';
      end if;
    elsif old.status = 'pending' and new.status = 'cancelled' then
      if actor is not null and actor <> old.requester_id then
        raise exception 'only the requester can withdraw a pending request' using errcode = '42501';
      end if;
    elsif old.status = 'accepted' and new.status = 'cancelled' then
      if actor is not null and actor not in (old.owner_id, old.requester_id) then
        raise exception 'not allowed' using errcode = '42501';
      end if;
    else
      raise exception 'invalid status change % -> %', old.status, new.status using errcode = '23514';
    end if;

    new.decided_at := now();

    if new.status = 'accepted' then
      q := public.lock_equipment(new.equipment_id);
      peak := public.equipment_peak_usage(new.equipment_id, new.start_date, new.end_date, null, new.id);
      if peak + new.units > q then
        raise exception 'equipment capacity exceeded in the selected period'
          using errcode = '23P01',
                detail = format('quantity %s, already in use %s, requested %s', q, peak, new.units);
      end if;
    end if;
  elsif new.decision_note is distinct from old.decision_note then
    if actor is not null and actor <> old.owner_id then
      raise exception 'only the owner can write a decision note' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger rental_items_before_update before update on public.rental_request_items
  for each row execute function public.rental_items_before_update();

-- Lowering the stock must not break existing commitments.
create function public.equipment_quantity_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  peak integer;
begin
  if new.quantity < old.quantity then
    peak := public.equipment_peak_usage(old.id, current_date, date 'infinity');
    if peak > new.quantity then
      raise exception 'quantity is lower than existing blocks and reservations'
        using errcode = '23P01', detail = format('currently committed up to %s units', peak);
    end if;
  end if;
  return new;
end;
$$;

create trigger equipment_quantity_guard before update of quantity on public.equipment
  for each row execute function public.equipment_quantity_guard();

-- Atomic multi-item request. SECURITY INVOKER: RLS and the triggers above apply.
create function public.create_rental_request(
  p_items jsonb,
  p_start date,
  p_end date,
  p_purpose text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  rid uuid;
  it jsonb;
  eq uuid;
  own uuid;
  n integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  if p_start < public.user_today() then
    raise exception 'start date is in the past' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one equipment item is required' using errcode = '22023';
  end if;

  insert into public.rental_requests (start_date, end_date, purpose)
  values (p_start, p_end, p_purpose)
  returning id into rid;

  for it in select * from jsonb_array_elements(p_items) loop
    eq := (it ->> 'equipment_id')::uuid;
    n := coalesce((it ->> 'units')::integer, 1);
    select o.owner_id into own from public.rental_offers o where o.equipment_id = eq;
    if own is null then
      raise exception 'equipment is not offered for rent' using errcode = '22023';
    end if;
    insert into public.rental_request_items
      (request_id, requester_id, start_date, end_date, equipment_id, owner_id, units)
    values (rid, (select auth.uid()), p_start, p_end, eq, own, n);
  end loop;

  return rid;
end;
$$;

-- Shared, curated view of listed equipment --------------------------------------
-- Runs with the view owner's rights (that is how members see items of others
-- without access to the private equipment table), but only for approved
-- viewers and only for active listings of approved owners. It exposes NO
-- financial data (no purchase value) and no private notes.
create view public.rental_offers
  with (security_invoker = false) as
select
  l.id as listing_id,
  e.id as equipment_id,
  e.owner_id,
  p.full_name as owner_name,
  e.name,
  e.category_id,
  c.name as category_name,
  e.manufacturer,
  e.model,
  e.description,
  e.quantity,
  l.public_note
from public.rental_listings l
join public.equipment e on e.id = l.equipment_id and e.owner_id = l.owner_id
join public.profiles p on p.id = e.owner_id
left join public.equipment_categories c on c.id = e.category_id
where l.is_active
  and e.availability_status = 'available'
  and public.is_approved()
  and exists (select 1 from public.user_access ua where ua.user_id = e.owner_id and ua.status = 'approved');

-- Search with live availability for a period (other members' offers only).
create function public.search_rental_offers(
  p_query text default null,
  p_category_id uuid default null,
  p_start date default null,
  p_end date default null,
  p_only_available boolean default true
)
returns table (
  listing_id uuid,
  equipment_id uuid,
  owner_id uuid,
  owner_name text,
  name text,
  category_id uuid,
  category_name text,
  manufacturer text,
  model text,
  description text,
  quantity integer,
  public_note text,
  available_units integer
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_approved() then
    return;
  end if;
  if (p_start is null) <> (p_end is null) or (p_start is not null and p_end < p_start) then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  return query
  select * from (
    select o.listing_id, o.equipment_id, o.owner_id, o.owner_name, o.name, o.category_id,
           o.category_name, o.manufacturer, o.model, o.description, o.quantity, o.public_note,
           case when p_start is null then o.quantity
                else greatest(o.quantity - public.equipment_peak_usage(o.equipment_id, p_start, p_end), 0)
           end as available_units
    from public.rental_offers o
    where o.owner_id <> (select auth.uid())
      and (p_category_id is null or o.category_id = p_category_id)
      and (p_query is null or btrim(p_query) = ''
           or position(lower(btrim(p_query)) in lower(o.name || ' ' || coalesce(o.manufacturer, '') || ' ' || coalesce(o.model, ''))) > 0)
  ) r
  where not p_only_available or r.available_units > 0
  order by r.name;
end;
$$;

-- Owner's own overview: derived status per equipment item for today.
create function public.equipment_overview()
returns table (
  equipment_id uuid,
  quantity integer,
  blocked_today integer,
  lent_today integer,
  reserved_upcoming integer,
  available_today integer
)
language sql stable
set search_path = ''
as $$
  select
    e.id,
    e.quantity,
    coalesce((select sum(b.units) from public.equipment_blocks b
              where b.equipment_id = e.id and public.user_today() between b.start_date and b.end_date), 0)::integer,
    coalesce((select sum(i.units) from public.rental_request_items i
              where i.equipment_id = e.id and i.status = 'accepted'
                and public.user_today() between i.start_date and i.end_date), 0)::integer,
    coalesce((select sum(i.units) from public.rental_request_items i
              where i.equipment_id = e.id and i.status = 'accepted'
                and i.start_date > public.user_today()), 0)::integer,
    greatest(e.quantity
      - coalesce((select sum(b.units) from public.equipment_blocks b
                  where b.equipment_id = e.id and public.user_today() between b.start_date and b.end_date), 0)
      - coalesce((select sum(i.units) from public.rental_request_items i
                  where i.equipment_id = e.id and i.status = 'accepted'
                    and public.user_today() between i.start_date and i.end_date), 0), 0)::integer
  from public.equipment e
  where e.owner_id = (select auth.uid());
$$;

-- Members may see the display name of people they have a rental relationship with.
create function public.can_see_profile(p_target uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_target = (select auth.uid())
    or (public.is_approved() and (
      exists (select 1 from public.rental_listings l where l.owner_id = p_target and l.is_active)
      or exists (
        select 1 from public.rental_request_items i
        where (i.owner_id = p_target and i.requester_id = (select auth.uid()))
           or (i.requester_id = p_target and i.owner_id = (select auth.uid())))
    ));
$$;

create policy profiles_select_related on public.profiles
  for select to authenticated using (public.can_see_profile(id));

-- One calendar feed. security_invoker: every row is filtered by the caller's RLS.
create view public.calendar_feed
  with (security_invoker = true) as
select ce.id, ce.kind, ce.title, ce.start_date, coalesce(ce.end_date, ce.start_date) as end_date,
       ce.start_time, ce.end_time, ce.location, ce.notes, ce.job_id, null::uuid as equipment_id
from public.calendar_events ce
union all
select b.id, 'equipment_block', e.name, b.start_date, b.end_date,
       null::time, null::time, null::text, b.reason, null::uuid, b.equipment_id
from public.equipment_blocks b
join public.equipment e on e.id = b.equipment_id
union all
select i.id,
       case when i.owner_id = (select auth.uid()) then 'rental_out' else 'rental_in' end,
       i.equipment_name, i.start_date, i.end_date,
       null::time, null::time, null::text, null::text, null::uuid, i.equipment_id
from public.rental_request_items i
where i.status = 'accepted';

-- Privileges -----------------------------------------------------------------
revoke all on public.equipment_blocks, public.rental_requests, public.rental_request_items,
  public.rental_offers, public.calendar_feed from anon, authenticated;
grant select, insert, update, delete on public.equipment_blocks to authenticated;
grant select, insert on public.rental_requests to authenticated;
grant select, insert on public.rental_request_items to authenticated;
-- Only the decision fields can ever be updated; the trigger enforces who and how.
grant update (status, decision_note) on public.rental_request_items to authenticated;
grant select on public.rental_offers, public.calendar_feed to authenticated;

revoke all on function public.equipment_peak_usage(uuid, date, date, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lock_equipment(uuid) from public, anon, authenticated;
revoke all on function public.equipment_blocks_check() from public, anon, authenticated;
revoke all on function public.rental_items_before_insert() from public, anon, authenticated;
revoke all on function public.rental_items_before_update() from public, anon, authenticated;
revoke all on function public.equipment_quantity_guard() from public, anon, authenticated;
revoke all on function public.can_see_profile(uuid) from public, anon;
grant execute on function public.can_see_profile(uuid) to authenticated;
revoke all on function public.create_rental_request(jsonb, date, date, text) from public, anon;
grant execute on function public.create_rental_request(jsonb, date, date, text) to authenticated;
revoke all on function public.search_rental_offers(text, uuid, date, date, boolean) from public, anon;
grant execute on function public.search_rental_offers(text, uuid, date, date, boolean) to authenticated;
revoke all on function public.equipment_overview() from public, anon;
grant execute on function public.equipment_overview() to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.equipment_blocks enable row level security;
alter table public.rental_requests enable row level security;
alter table public.rental_request_items enable row level security;

create policy equipment_blocks_own on public.equipment_blocks
  for all to authenticated
  using (owner_id = (select auth.uid()) and public.is_approved())
  with check (owner_id = (select auth.uid()) and public.is_approved());

-- Header: visible to the requester and to owners of an item in it.
create policy rental_requests_select on public.rental_requests
  for select to authenticated
  using (public.is_approved() and (
    requester_id = (select auth.uid())
    or exists (select 1 from public.rental_request_items i
               where i.request_id = rental_requests.id and i.owner_id = (select auth.uid()))));

create policy rental_requests_insert on public.rental_requests
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and public.is_approved());

-- Items: visible to requester and owner; no header lookup, so no recursion.
create policy rental_items_select on public.rental_request_items
  for select to authenticated
  using (public.is_approved()
         and ((select auth.uid()) in (owner_id, requester_id)));

create policy rental_items_insert on public.rental_request_items
  for insert to authenticated
  with check (public.is_approved()
              and requester_id = (select auth.uid())
              and owner_id <> (select auth.uid())
              and status = 'pending');

create policy rental_items_update on public.rental_request_items
  for update to authenticated
  using (public.is_approved() and ((select auth.uid()) in (owner_id, requester_id)))
  with check (public.is_approved() and ((select auth.uid()) in (owner_id, requester_id)));
