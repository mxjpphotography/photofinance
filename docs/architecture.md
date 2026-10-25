# Architecture

## Decisions

- **One community.** Every approved member can see the same rental offers.
  Everything else (finance, jobs, settings, calendar, equipment details) is
  private to its owner through Row Level Security. A multi-community model can
  be added later by putting a `community_id` on the rental tables only.
- **SPA + Supabase.** The app sits behind a login, so no server-side rendering
  is needed. All rules that must hold (approval, capacity, ownership) live in
  the database, never only in the browser.
- **Free only.** No paid service is required anywhere.

## Security model

- `profiles` holds the editable display name. `user_access` holds the status
  (`pending`, `approved`, `blocked`) and role (`user`, `admin`). Authenticated
  users have **no write privilege** on `user_access`, so approval cannot be
  reached through a manipulated request.
- Every table has RLS enabled. Each policy requires `public.is_approved()`.
- API roles get explicit, minimal grants. Defaults are revoked, columns that
  clients must not write (for example `generated_through`, `status` on
  requests apart from the decision) have no column privilege.
- `SECURITY DEFINER` functions pin `search_path` and are scoped to the caller
  (`auth.uid()`); see the comments at each function.
- Shared data goes through `rental_offers`, a curated view without purchase
  value or internal notes. Raw `equipment` is owner-only.
- E-mail addresses are never copied out of `auth.users`.

## Data model (migrations in order)

1. helpers - `set_updated_at`
2. access - `profiles`, `user_access`, `is_approved()`, `is_admin()`, `admin_set_user_access()`
3. settings - `user_settings`, sign-up trigger
4. categories - `finance_categories`, `equipment_categories` (seeded, admin-managed later)
5. finance - `recurrence_rules`, `transactions`, reporting functions
6. equipment - `equipment`, `rental_listings`
7. jobs and calendar - `jobs`, `job_equipment`, `calendar_events`, quote and hour-limit functions
8. rentals - `equipment_blocks`, `rental_requests`, `rental_request_items`, availability, views

Composite foreign keys `(id, owner_id)` guarantee that child rows can never
belong to a different owner than their parent.

## Roadmap

Phases 6-12 build the user interface on top of this schema. The reporting
functions (`budget_total`, `monthly_balance`, `category_totals`,
`forecast_recurring`, `search_rental_offers`, `equipment_overview`,
`calculate_job_quote`, `check_monthly_hours`) are the intended API for the screens.
