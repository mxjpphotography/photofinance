#!/usr/bin/env bash
# Runs all migrations plus the SQL test suite against a throw-away database on
# a plain PostgreSQL server (15+). Usage:
#   PGHOST=localhost PGUSER=postgres ./supabase/tests/run.sh
# The database is dropped again at the end (also on failure).
set -euo pipefail

cd "$(dirname "$0")/../.."
DB="photofinance_test_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q -t -A)

cleanup() { psql -X -q -d postgres -c "drop database if exists \"$DB\" with (force)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql -X -q -d postgres -c "create database \"$DB\""

"${PSQL[@]}" -d "$DB" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migration: $f"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

"${PSQL[@]}" -d "$DB" -f supabase/tests/01_test_helpers.sql
for f in supabase/tests/[1-9][0-9]_*.sql; do
  [ "$f" = "supabase/tests/01_test_helpers.sql" ] && continue
  echo "tests: $f"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

# Run through bash, so a missing executable bit (e.g. after a checkout on
# Windows) can neither fail nor silently skip this test.
if [ ! -f supabase/tests/concurrency.sh ]; then
  echo "FAIL - supabase/tests/concurrency.sh is missing"
  exit 1
fi
echo "tests: concurrency.sh"
DB="$DB" bash supabase/tests/concurrency.sh

echo "ALL SQL TESTS PASSED"
