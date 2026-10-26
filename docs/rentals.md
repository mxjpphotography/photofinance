# Rentals

## Rules

- A request is **not** a reservation. Only an accepted item occupies equipment.
- Periods are whole days with an inclusive end date.
- For every day, `units in use <= equipment.quantity`, where units in use are
  self-blocks plus accepted request items. This covers single items and
  multi-unit stock.
- A request may contain items of several owners. Each owner decides only about
  their own item.

## Lifecycle of an item

```
pending -> accepted   (owner)
pending -> declined   (owner)
pending -> cancelled  (requester)
accepted -> cancelled (owner or requester)
```

Everything else is rejected by a trigger. Identity and period of an item are
immutable; clients can only update `status` and, for the owner, `decision_note`.

## Concurrency

Every capacity decision first locks the equipment row (`SELECT ... FOR UPDATE`)
and then recomputes peak usage. Two owners' sessions accepting overlapping
requests for the same item are serialised; the second fails with
`capacity exceeded`. This is tested with two real parallel sessions
(`supabase/tests/concurrency.sh`).

## Visibility

Members read other people's equipment only through `rental_offers`
(name, category, manufacturer, model, description, quantity, owner name, public
note). Purchase value and private data are not part of it. Items of blocked
owners, inactive listings and unavailable equipment are hidden.

## Screens (`/leihen`)

- **Angebote**: search other members' offers by text, category and period; with a
  period the free units are shown. Items go into one request.
- **Meine Anfragen**: requests grouped by request, with owner and answer; pending
  items can be withdrawn, accepted ones cancelled.
- **Eingehende Anfragen**: items for the person's own equipment; accept or decline
  with an optional note, cancel an accepted one.

The buttons only mirror the lifecycle above (`src/lib/rentals.ts`); the database
trigger is what actually enforces it. Capacity failures (`23P01`) are shown as a
German message.

## Not implemented (open business rules)

Prices, deposit, payment, hand-over, return and fees. The schema leaves room
for them on `rental_listings` and `rental_request_items`.
