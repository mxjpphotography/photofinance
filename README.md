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
| 3 | Scaffold, design system, navigation | done, built and run by the owner, CI green |
| 4 | Registration and access gate | done, works against a real Supabase project |
| 5 | Migrations, RLS, tests | done. 262 SQL checks plus a concurrency test, run in CI |
| 6 | Finance: bookings, recurring rules, views, filters | written, **not yet run in a browser** |
| 7 | Dashboard: budget, monthly balance, chart | written, **not yet run in a browser** |
| 8 | Calendar on the dashboard: month grid, appointments | written, **not yet run in a browser** |
| 9 | Job planning: jobs, calculation, monthly-hours warning | written, **not yet run in a browser** |
| 10 | Equipment: own items, blocks, rental listing switch; income linked to jobs | written, **not yet run in a browser** |
| 11 | Rental platform: search offers, requests, accept/decline/cancel | written, **not yet run in a browser** |
| 12 | PWA polish, final tests and docs | not started |

**Honest note:** the finance, calendar and job screens and the dashboard were written in an
environment without access to the npm registry. Their pure logic (amount
parsing, dates, cent arithmetic, chart scale) has unit tests that pass, and the
sources were type-checked against hand-written stand-ins for React, Supabase,
React Query and the router, which only catches mistakes in this project's own
code. They have never run against the real libraries or in a browser. Run
`npm run typecheck && npm test && npm run build` first and fix what the real
compiler reports, then click through the screens.

Migration 9 changes the job calculation. Apply
`supabase/migrations/20261024000009_quote_pre_tax_rate.sql` in the Supabase SQL
editor once.

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

## Decisions and open points

Decided:

1. The target hourly rate is a rate **before** tax and reserves. Tax and
   reserve rates are optional shares of the profit and do not change the price
   (`docs/calculation.md`).
2. Small business without VAT: prices contain no VAT.
3. Organisation hours in the monthly limit are a setting
   (`org_hours_billable`).

Still open:

1. Prices, deposit, hand-over and return of rentals are intentionally not
   implemented.

## Publishing (free, GitHub Pages)

The app is a static site; Supabase is the backend. `.github/workflows/deploy.yml`
builds and publishes it after every push to `main`. One-time setup:

1. GitHub > repository > **Settings > Pages > Source: GitHub Actions**.
2. **Settings > Secrets and variables > Actions > New repository secret**:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as in `.env.local`;
   both are public by design).
3. Supabase > **Authentication > URL Configuration**: set *Site URL* to
   `https://<user>.github.io/photofinance/` and add the same address plus `**`
   under *Redirect URLs*. Without this, links in e-mails lead to the wrong place.
4. Push to `main`. The address appears in the workflow run and under Settings > Pages.
