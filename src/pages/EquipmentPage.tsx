import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { BlocksPanel } from "../features/equipment/BlocksPanel";
import { EquipmentForm } from "../features/equipment/EquipmentForm";
import {
  useBlocks,
  useDeleteEquipment,
  useEquipment,
  useEquipmentCategories,
  useEquipmentOverview,
  useListings,
} from "../features/equipment/api";
import { todayIso } from "../lib/dates";
import { de } from "../lib/de";
import { mapDbError } from "../lib/errors";
import { formatCents, formatEuro, sumCents } from "../lib/money";
import type { Equipment } from "../lib/types";

const t = de.eq;

export default function EquipmentPage() {
  const today = todayIso();
  const equipment = useEquipment();
  const categories = useEquipmentCategories();
  const overview = useEquipmentOverview();
  const listings = useListings();
  const blocks = useBlocks(today);
  const remove = useDeleteEquipment();
  const [form, setForm] = useState<{ item?: Equipment } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const categoryName = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const stateById = useMemo(() => new Map((overview.data ?? []).map((o) => [o.equipment_id, o])), [overview.data]);
  const listingById = useMemo(() => new Map((listings.data ?? []).map((l) => [l.equipment_id, l])), [listings.data]);
  const items = equipment.data ?? [];

  // Sum in whole cents so many small prices do not drift.
  const totalValue = sumCents(items.map((e) => e.purchase_value ?? 0));

  async function onDelete(item: Equipment) {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await remove.mutateAsync(item.id);
      setNotice({ tone: "success", text: t.deleted });
    } catch (error) {
      setNotice({ tone: "error", text: mapDbError(error) });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <Button onClick={() => setForm({})}>{t.newItem}</Button>
      </div>

      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      {items.length > 0 ? (
        <Card title={t.totalValue}>
          <p className="text-2xl font-semibold tabular-nums">{formatCents(totalValue)}</p>
        </Card>
      ) : null}

      {equipment.isLoading ? <p role="status">{de.common.loading}</p> : null}
      {equipment.isError ? (
        <div className="space-y-3">
          <Alert tone="error">{t.loadError}</Alert>
          <Button variant="secondary" onClick={() => void equipment.refetch()}>
            {de.common.retry}
          </Button>
        </div>
      ) : null}
      {equipment.data && items.length === 0 ? <p className="text-neutral-700">{t.empty}</p> : null}

      <ul className="space-y-3">
        {items.map((item) => {
          const state = stateById.get(item.id);
          const listing = listingById.get(item.id);
          const open = openId === item.id;
          const itemBlocks = (blocks.data ?? []).filter((b) => b.equipment_id === item.id);
          const subtitle = [item.manufacturer, item.model].filter(Boolean).join(" ");
          return (
            <li key={item.id} className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{item.name}</h3>
                <Badge>{item.category_id ? (categoryName.get(item.category_id) ?? t.uncategorised) : t.uncategorised}</Badge>
                <Badge>{t.pieces.replace("{n}", String(item.quantity))}</Badge>
                {item.availability_status === "unavailable" ? <Badge>{t.unavailable}</Badge> : null}
                {listing?.is_active ? <Badge tone="info">{t.offered}</Badge> : null}
              </div>
              {subtitle ? <p className="text-sm text-neutral-700">{subtitle}</p> : null}
              {item.description ? <p className="whitespace-pre-line text-sm text-neutral-700">{item.description}</p> : null}
              {item.purchase_value !== null ? <p className="text-sm text-neutral-700">{formatEuro(item.purchase_value)}</p> : null}
              {state && item.availability_status === "available" ? (
                <p className="text-sm text-neutral-700">
                  {t.today.replace("{free}", String(state.available_today)).replace("{total}", String(state.quantity))}
                  {state.blocked_today > 0 ? ` · ${t.blockedToday.replace("{n}", String(state.blocked_today))}` : ""}
                  {state.lent_today > 0 ? ` · ${t.lentToday.replace("{n}", String(state.lent_today))}` : ""}
                  {state.reserved_upcoming > 0 ? ` · ${t.reservedUpcoming.replace("{n}", String(state.reserved_upcoming))}` : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" aria-expanded={open} onClick={() => setOpenId(open ? null : item.id)}>
                  {open ? t.hideBlocks : t.blocks}
                </Button>
                <Button variant="secondary" onClick={() => setForm({ item })}>
                  {t.edit}
                </Button>
                <Button variant="secondary" onClick={() => void onDelete(item)}>
                  {t.delete}
                </Button>
              </div>
              {open ? <BlocksPanel item={item} blocks={itemBlocks} /> : null}
            </li>
          );
        })}
      </ul>

      {form ? (
        <EquipmentForm
          categories={categories.data ?? []}
          initial={form.item}
          listing={form.item ? listingById.get(form.item.id) : undefined}
          onClose={() => setForm(null)}
          onSaved={(text) => {
            setForm(null);
            setNotice({ tone: "success", text });
          }}
        />
      ) : null}
    </div>
  );
}
