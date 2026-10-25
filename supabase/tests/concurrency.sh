#!/usr/bin/env bash
# Concurrency test: two owners' sessions accept two overlapping requests for the
# SAME single item at the same time. Exactly one may succeed.
# Called by run.sh with DB set; needs real parallel sessions, so it cannot be a
# plain SQL file.
set -uo pipefail

: "${DB:?DB must be set}"
P=(psql -X -q -t -A -d "$DB")

"${P[@]}" -v ON_ERROR_STOP=1 <<'SQL'
select t.seed();
insert into public.equipment (id, owner_id, name, quantity)
  values ('c0000000-0000-0000-0000-000000000001', t.u('alice'), 'Race-Kamera', 1);
insert into public.rental_listings (equipment_id, owner_id)
  values ('c0000000-0000-0000-0000-000000000001', t.u('alice'));
insert into public.rental_requests (id, requester_id, start_date, end_date, purpose) values
  ('c1000000-0000-0000-0000-000000000001', t.u('bob'), t.today() + 200, t.today() + 202, 'A'),
  ('c1000000-0000-0000-0000-000000000002', t.u('eve'), t.today() + 201, t.today() + 203, 'B');
insert into public.rental_request_items (id, request_id, requester_id, start_date, end_date, equipment_id, owner_id) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', t.u('bob'), t.today() + 200, t.today() + 202, 'c0000000-0000-0000-0000-000000000001', t.u('alice')),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', t.u('eve'), t.today() + 201, t.today() + 203, 'c0000000-0000-0000-0000-000000000001', t.u('alice'));
SQL

accept() {  # $1 = item id, $2 = seconds to hold the transaction open
  "${P[@]}" -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>"$3"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', t.u('alice')::text, true);
update public.rental_request_items set status = 'accepted' where id = '$1';
select pg_sleep($2);
commit;
SQL
}

TMP=$(mktemp -d)
accept c2000000-0000-0000-0000-000000000001 2 "$TMP/a.err" & PA=$!
sleep 0.5
accept c2000000-0000-0000-0000-000000000002 0 "$TMP/b.err" & PB=$!
wait $PA; RA=$?
wait $PB; RB=$?

ACCEPTED=$("${P[@]}" -c "select count(*) from public.rental_request_items where equipment_id = 'c0000000-0000-0000-0000-000000000001' and status = 'accepted'")
echo "session A exit=$RA, session B exit=$RB, accepted rows=$ACCEPTED"

fail=0
[ "$ACCEPTED" = "1" ] || { echo "FAIL - expected exactly one accepted item"; fail=1; }
[ "$RA" = "0" ] || { echo "FAIL - first session should succeed"; fail=1; }
[ "$RB" != "0" ] || { echo "FAIL - second session should have been refused"; fail=1; }
grep -q "capacity exceeded" "$TMP/b.err" || { echo "FAIL - second session failed for the wrong reason:"; cat "$TMP/b.err"; fail=1; }
rm -rf "$TMP"
[ "$fail" = 0 ] && echo "ok - concurrent acceptance of overlapping requests: exactly one wins"
exit $fail
