import { useMemo, useState } from "react";
import { Alert, Badge, Button, Field, Select } from "../../components/ui";
import { de } from "../../lib/de";
import { maxUnits } from "../../lib/rentals";
import type { RentalOffer } from "../../lib/types";
import { useDebounced } from "../../lib/useDebounced";
import { useEquipmentCategories } from "../equipment/api";
import { useOffers } from "./api";
import { RequestModal, type CartLine } from "./RequestModal";

const t = de.rent;

/** Search other members' offers, pick items and send one request. */
export function OffersTab({ onSent }: { onSent: () => void }) {
  const categories = useEquipmentCategories();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [units, setUnits] = useState<Map<string, string>>(new Map());
  const [requesting, setRequesting] = useState(false);

  // A period counts only when both dates are set and in order; otherwise search without one.
  const periodValid = start !== "" && end !== "" && end >= start;
  const periodBroken = (start !== "") !== (end !== "") || (start !== "" && end !== "" && end < start);
  const filters = useDebounced({
    query,
    categoryId,
    start: periodValid ? start : "",
    end: periodValid ? end : "",
    onlyAvailable,
  });
  const offers = useOffers(filters, !periodBroken);
  const list = offers.data ?? [];
  const periodGiven = filters.start !== "";

  const byId = useMemo(() => new Map(list.map((o) => [o.equipment_id, o])), [list]);

  function wantedUnits(offer: RentalOffer): number {
    const max = maxUnits(offer, periodGiven);
    const n = Number(units.get(offer.equipment_id) ?? "1");
    return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : 1;
  }

  function toggle(offer: RentalOffer) {
    const next = new Map(cart);
    if (next.has(offer.equipment_id)) next.delete(offer.equipment_id);
    else next.set(offer.equipment_id, wantedUnits(offer));
    setCart(next);
  }

  // Lines of items that are still in the current result; others dropped out of the filter.
  const lines: CartLine[] = [...cart.entries()].flatMap(([id, n]) => {
    const offer = byId.get(id);
    return offer ? [{ offer, units: Math.min(n, maxUnits(offer, periodGiven)) }] : [];
  });

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
        <Field id="off-query" label={t.search.query} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select id="off-category" label={t.search.category} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t.search.allCategories}</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Field id="off-from" label={t.search.from} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Field id="off-to" label={t.search.to} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <p className="text-sm text-neutral-600">{t.search.periodHint}</p>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
          {t.search.onlyAvailable}
        </label>
      </div>

      {periodBroken ? <Alert tone="warning">{t.search.errPeriod}</Alert> : null}
      {offers.isLoading ? <p role="status">{de.common.loading}</p> : null}
      {offers.isError ? (
        <div className="space-y-3">
          <Alert tone="error">{t.search.loadError}</Alert>
          <Button variant="secondary" onClick={() => void offers.refetch()}>
            {de.common.retry}
          </Button>
        </div>
      ) : null}
      {offers.data && list.length === 0 && !periodBroken ? <p className="text-neutral-700">{t.search.empty}</p> : null}

      <ul className="space-y-3">
        {list.map((offer) => {
          const selected = cart.has(offer.equipment_id);
          const max = maxUnits(offer, periodGiven);
          const subtitle = [offer.manufacturer, offer.model].filter(Boolean).join(" ");
          return (
            <li key={offer.equipment_id} className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{offer.name}</h3>
                {offer.category_name ? <Badge>{offer.category_name}</Badge> : null}
                <Badge tone="info">{t.offer.from.replace("{name}", offer.owner_name)}</Badge>
              </div>
              {subtitle ? <p className="text-sm text-neutral-700">{subtitle}</p> : null}
              {offer.description ? <p className="whitespace-pre-line text-sm text-neutral-700">{offer.description}</p> : null}
              {offer.public_note ? <p className="whitespace-pre-line text-sm text-neutral-700">{offer.public_note}</p> : null}
              <p className="text-sm text-neutral-700">
                {periodGiven
                  ? t.offer.free.replace("{free}", String(offer.available_units)).replace("{total}", String(offer.quantity))
                  : t.offer.stock.replace("{n}", String(offer.quantity))}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                {max > 1 ? (
                  <div className="w-28">
                    <Field
                      id={`units-${offer.equipment_id}`}
                      label={t.offer.units}
                      inputMode="numeric"
                      value={units.get(offer.equipment_id) ?? "1"}
                      disabled={selected}
                      onChange={(e) => setUnits(new Map(units).set(offer.equipment_id, e.target.value))}
                    />
                  </div>
                ) : null}
                <Button variant={selected ? "secondary" : "primary"} aria-pressed={selected} onClick={() => toggle(offer)} disabled={!selected && offer.available_units < 1 && periodGiven}>
                  {selected ? t.offer.remove : t.offer.select}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {lines.length > 0 ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-900 p-3 text-white shadow-lg">
          <span className="text-sm font-medium">{lines.length === 1 ? t.cart.one : t.cart.count.replace("{n}", String(lines.length))}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCart(new Map())}>
              {t.cart.clear}
            </Button>
            <Button onClick={() => setRequesting(true)}>{t.cart.request}</Button>
          </div>
        </div>
      ) : null}

      {requesting ? (
        <RequestModal
          lines={lines}
          defaultStart={periodValid ? start : ""}
          defaultEnd={periodValid ? end : ""}
          onClose={() => setRequesting(false)}
          onSent={() => {
            setRequesting(false);
            setCart(new Map());
            onSent();
          }}
        />
      ) : null}
    </div>
  );
}
