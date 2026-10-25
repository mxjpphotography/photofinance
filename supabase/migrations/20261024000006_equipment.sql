-- Migration 0006: own equipment and rental listings.
--
-- * equipment is PRIVATE to its owner (it contains the purchase value).
-- * A rental listing is the owner's explicit decision to share an item. Other
--   members only ever see the curated view public.rental_offers (migration
--   0008), which exposes no financial data.
-- * (id, owner_id) is unique so that child tables can reference both and the
--   database guarantees that owner columns cannot drift apart.

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category_id uuid references public.equipment_categories (id) on delete restrict,
  manufacturer text check (char_length(manufacturer) <= 120),
  model text check (char_length(model) <= 120),
  description text check (char_length(description) <= 2000),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  purchase_value numeric(12, 2) check (purchase_value >= 0),
  -- 'unavailable' = out of service (sold, broken, retired). Day-by-day states
  -- (blocked, reserved, lent) are derived from blocks and reservations.
  availability_status text not null default 'available'
    check (availability_status in ('available', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_id_owner_unique unique (id, owner_id)
);

create index equipment_owner_idx on public.equipment (owner_id);
create index equipment_category_idx on public.equipment (category_id);

create trigger equipment_set_updated_at before update on public.equipment
  for each row execute function public.set_updated_at();

create table public.rental_listings (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null unique,
  owner_id uuid not null default auth.uid(),
  is_active boolean not null default true,
  -- Text the owner is happy to show to every member.
  public_note text check (char_length(public_note) <= 1000),
  -- Prices, deposit, hand-over rules etc. are open business rules. They will be
  -- added here (or in child tables) once decided; nothing is invented now.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_listings_equipment_fk foreign key (equipment_id, owner_id)
    references public.equipment (id, owner_id) on delete cascade
);

create index rental_listings_owner_idx on public.rental_listings (owner_id);

create trigger rental_listings_set_updated_at before update on public.rental_listings
  for each row execute function public.set_updated_at();

-- Privileges -----------------------------------------------------------------
revoke all on public.equipment, public.rental_listings from anon, authenticated;
grant select, insert, update, delete on public.equipment, public.rental_listings to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.equipment enable row level security;
alter table public.rental_listings enable row level security;

create policy equipment_own on public.equipment
  for all to authenticated
  using (owner_id = (select auth.uid()) and public.is_approved())
  with check (owner_id = (select auth.uid()) and public.is_approved());

create policy rental_listings_own on public.rental_listings
  for all to authenticated
  using (owner_id = (select auth.uid()) and public.is_approved())
  with check (owner_id = (select auth.uid()) and public.is_approved());
