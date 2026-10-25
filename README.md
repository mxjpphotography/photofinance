# PhotoFinance

Finance and organisation app for photographers: bookings and recurring
bookings, job planning with price calculation, calendar, own equipment and a
community platform for lending equipment.

The code, database schema and documentation are in English. The user interface
is German (all texts live in `src/lib/de.ts`).

## Status

| Phase | Area | State |
|---|---|---|
| 1-2 | Analysis, architecture, data model | done (`docs/architecture.md`) |
| 3 | Scaffold, design system, navigation | written, **not built or run yet** (see below) |
| 4 | Registration and access gate | written, **not built or run yet** |
| 5 | Migrations, RLS, tests | done and tested against PostgreSQL 16 |
| 6-12 | Finance UI, dashboard, calendar, jobs, equipment, rentals, settings, PWA polish | not started. The database side of 6, 8, 9, 10 and 11 already exists |

**Honest note:** the front end could not be installed or compiled in the
environment it was written in (no access to the npm registry). It has never
been run. Run `npm install && npm run typecheck && npm test && npm run build`
first and fix whatever the compiler reports. The database layer is the part
that has been verified (see "Tests").

## Free-only stack

Everything runs on free tiers or locally. No paid service is required.

| Need | Choice |
|---|---|
| Backend, auth, database | Supabase free plan (or self-hosted Supabase) |
| Hosting of the front end | any static host with a free plan (Cloudflare Pages, Netlify, GitHub Pages) |
| CI | GitHub Actions (free for public repositories) |
| Scheduled generation of recurring bookings | optional, see below. Not needed for correctness |
| E-mail | Supabase's built-in sender is rate limited. Use a free SMTP plan if you need more |

Free-tier limits to be aware of: Supabase pauses inactive free projects after a
period of inactivity, and the built-in e-mail sender allows only a few
messages per hour.

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query,
`vite-plugin-pwa`, Supabase (PostgreSQL, Auth, Row Level Security), Vitest.

## Local development

Requirements: Node 20+, and for a local backend the free
[Supabase CLI](https://supabase.com/docs/guides/cli) with Docker.

```bash
npm install
cp .env.example .env.local        # fill in URL and anon key
npm run dev
```

### Database

Migrations are in `supabase/migrations` (versioned, applied in file order).

```bash
supabase start                    # local stack (Docker)
supabase db reset                 # applies all migrations
# or against a hosted free project:
supabase link --project-ref <ref>
supabase db push
```

### Environment variables

| Variable | Meaning |
|---|---|
| `VITE_SUPABASE_URL` | project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key (public, protected by RLS) |

The `service_role` key must never be committed or used in the browser.

### Approving the first administrator

Sign-ups start as `pending`. The admin UI is a later phase, so approve the
first administrator once in the Supabase SQL editor (runs with elevated rights):

```sql
update public.user_access
   set status = 'approved', role = 'admin'
 where user_id = (select id from auth.users where email = 'you@example.com');
```

After that, administrators use `select public.admin_set_user_access(<user id>, 'approved')`
(a UI will call this later). Approved users set their password through the
"forgot password" link, so passwords are never sent by e-mail.

### Recurring bookings

Due occurrences are created by `public.generate_due_transactions()`, which the
app calls for the signed-in user. It is idempotent. For users who do not open
the app, `public.generate_due_transactions_all()` can be run daily by
`pg_cron` (available on the free plan) or an Edge Function with the service role.

## Tests

```bash
npm test            # front end unit tests (Vitest)
npm run test:db     # database tests, needs a PostgreSQL 15+ server
```

`test:db` creates a throw-away database, applies all migrations on top of a
small stub of Supabase's `auth` schema and roles, runs the SQL suites and
drops the database again:

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```

Covered (259 checks): approval gate and privilege escalation attempts, RLS
isolation per user, exact money arithmetic, recurring bookings (idempotency,
no duplicates, history protected), monthly balances, job calculation, monthly
hour warning, calendar integration, equipment capacity (single and multi-unit),
request lifecycle and who may change what, and a real two-session concurrency
test for simultaneous acceptance.

Not covered yet: UI tests, mobile checks, end-to-end tests against real
Supabase Auth.

## Documentation

- `docs/architecture.md` - decisions, data model, security model
- `docs/finance.md` - how bookings and recurring rules work
- `docs/calculation.md` - the job price formula
- `docs/rentals.md` - reservation rules and concurrency

## Open decisions

1. Is the target hourly rate a net personal target or a rate before tax?
   (The current formula treats it as the amount you want to keep before tax
   and reserve; see `docs/calculation.md`.)
2. VAT / small-business status is not modelled yet.
3. Do organisation hours count towards the monthly limit? Currently yes,
   switchable per user (`org_hours_billable`).
4. Prices, deposit, hand-over and return of rentals are intentionally not
   implemented.
