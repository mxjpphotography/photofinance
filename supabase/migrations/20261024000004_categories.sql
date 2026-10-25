-- Migration 0004: central category tables (finance and equipment).
--
-- Categories are data, not code. Admins (later UI) activate/deactivate them
-- instead of deleting, so historic bookings keep a readable category.
-- Names are user-facing data and therefore German.

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Hint for the booking form only. Not enforced: the sign of the amount
  -- alone decides whether a booking is income or expense.
  applies_to text not null default 'both' check (applies_to in ('income', 'expense', 'both')),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger finance_categories_set_updated_at before update on public.finance_categories
  for each row execute function public.set_updated_at();
create trigger equipment_categories_set_updated_at before update on public.equipment_categories
  for each row execute function public.set_updated_at();

insert into public.finance_categories (code, name, applies_to, sort_order) values
  ('photo_jobs',      'Fotoaufträge',          'income',  10),
  ('prints_sales',    'Prints & Verkäufe',     'income',  20),
  ('other_income',    'Sonstige Einnahmen',    'income',  90),
  ('equipment',       'Equipment',             'expense', 110),
  ('software',        'Software & Abonnements','expense', 120),
  ('travel',          'Reisen & Fahrtkosten',  'expense', 130),
  ('insurance',       'Versicherungen',        'expense', 140),
  ('taxes_fees',      'Steuern & Gebühren',    'expense', 150),
  ('marketing',       'Marketing',             'expense', 160),
  ('other_expense',   'Sonstige Ausgaben',     'expense', 190);

insert into public.equipment_categories (code, name, sort_order) values
  ('cameras',     'Kameras',              10),
  ('lenses',      'Objektive',            20),
  ('lighting',    'Licht & Blitze',       30),
  ('support',     'Stative & Halterungen',40),
  ('audio',       'Audio',                50),
  ('drones',      'Drohnen',              60),
  ('accessories', 'Zubehör',              70),
  ('other',       'Sonstiges',            99);

-- Privileges -----------------------------------------------------------------
revoke all on public.finance_categories, public.equipment_categories from anon, authenticated;
grant select, insert, update, delete on public.finance_categories, public.equipment_categories to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.finance_categories enable row level security;
alter table public.equipment_categories enable row level security;

-- Every approved member can read all categories (inactive ones too, so old
-- bookings still resolve). The UI filters on is_active for new entries.
create policy finance_categories_select on public.finance_categories
  for select to authenticated using (public.is_approved());
create policy equipment_categories_select on public.equipment_categories
  for select to authenticated using (public.is_approved());

create policy finance_categories_admin_write on public.finance_categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy equipment_categories_admin_write on public.equipment_categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
