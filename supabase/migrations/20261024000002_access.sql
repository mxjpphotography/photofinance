-- Migration 0002: profiles, approval status and roles.
--
-- Design notes
-- * profiles holds only data the user may edit (the display name).
-- * Approval status and role live in user_access, which authenticated users
--   can only READ. Changing it requires the admin function below or a
--   privileged SQL session. A user can therefore never approve themselves,
--   not even through a manipulated API request.
-- * The e-mail address is never copied into public tables. It stays in
--   auth.users, so it cannot leak through shared views.

create type public.user_status as enum ('pending', 'approved', 'blocked');
create type public.user_role as enum ('user', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_access (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status public.user_status not null default 'pending',
  role public.user_role not null default 'user',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger user_access_set_updated_at before update on public.user_access
  for each row execute function public.set_updated_at();

-- Server-side checks used by every RLS policy. SECURITY DEFINER lets them read
-- user_access regardless of the caller's own policies; search_path is pinned.
create function public.is_approved()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_access ua
    where ua.user_id = (select auth.uid()) and ua.status = 'approved'
  );
$$;

create function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_access ua
    where ua.user_id = (select auth.uid())
      and ua.status = 'approved'
      and ua.role = 'admin'
  );
$$;

-- Admin API (the admin UI itself is a later phase).
create function public.admin_set_user_access(
  p_user_id uuid,
  p_status public.user_status,
  p_role public.user_role default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'admins cannot change their own access' using errcode = '42501';
  end if;

  update public.user_access
     set status = p_status,
         role = coalesce(p_role, role),
         decided_by = (select auth.uid()),
         decided_at = now()
   where user_id = p_user_id;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Privileges -----------------------------------------------------------------
revoke all on public.profiles, public.user_access from anon, authenticated;
grant select on public.profiles, public.user_access to authenticated;
grant update (full_name) on public.profiles to authenticated;

revoke all on function public.is_approved(), public.is_admin() from public, anon;
grant execute on function public.is_approved(), public.is_admin() to authenticated;
revoke all on function public.admin_set_user_access(uuid, public.user_status, public.user_role)
  from public, anon;
grant execute on function public.admin_set_user_access(uuid, public.user_status, public.user_role)
  to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_access enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Users can read their own status (needed for the "pending" screen).
create policy user_access_select_own on public.user_access
  for select to authenticated using (user_id = (select auth.uid()));

create policy user_access_select_admin on public.user_access
  for select to authenticated using (public.is_admin());

-- Admins may also read all profiles (names), for the later admin UI.
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());
