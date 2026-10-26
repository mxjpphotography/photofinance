import { useState, type FormEvent } from "react";
import { Alert, Button, Field } from "../../components/ui";
import { todayIso } from "../../lib/dates";
import { de } from "../../lib/de";
import { parseQuantity, validPeriod } from "../../lib/equipment";
import { mapDbError } from "../../lib/errors";
import { formatDate } from "../../lib/money";
import type { Equipment, EquipmentBlock } from "../../lib/types";
import { useCreateBlock, useDeleteBlock } from "./api";

const t = de.eq.block;

type Errors = Partial<Record<"units" | "date" | "reason", string>>;

/** Upcoming blocks of one item and the form to add another. The database refuses blocks that exceed the stock. */
export function BlocksPanel({ item, blocks }: { item: Equipment; blocks: EquipmentBlock[] }) {
  const create = useCreateBlock();
  const remove = useDeleteBlock();
  const [units, setUnits] = useState("1");
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const next: Errors = {};
    const u = parseQuantity(units, item.quantity);
    if (!u.ok) next.units = t.errUnits;
    if (!validPeriod(start, end)) next.date = t.errDate;
    if (reason.length > 500) next.reason = t.errReason;
    setErrors(next);
    if (Object.keys(next).length > 0 || !u.ok) return;
    try {
      await create.mutateAsync({ equipment_id: item.id, units: u.value, start_date: start, end_date: end, reason: reason.trim() || null });
      setReason("");
      setNotice({ tone: "success", text: t.saved });
    } catch (error) {
      setNotice({ tone: "error", text: mapDbError(error) });
    }
  }

  async function onRemove(id: string) {
    if (!window.confirm(t.removeConfirm)) return;
    try {
      await remove.mutateAsync(id);
      setNotice({ tone: "success", text: t.removed });
    } catch (error) {
      setNotice({ tone: "error", text: mapDbError(error) });
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-neutral-50 p-3">
      <h4 className="text-sm font-semibold">{t.title}</h4>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {blocks.length === 0 ? <p className="text-sm text-neutral-600">{t.none}</p> : null}
      <ul className="space-y-2">
        {blocks.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {t.period.replace("{from}", formatDate(b.start_date)).replace("{to}", formatDate(b.end_date))} ·{" "}
              {t.units_text.replace("{n}", String(b.units))}
              {b.reason ? ` · ${b.reason}` : ""}
            </span>
            <Button variant="secondary" onClick={() => void onRemove(b.id)} disabled={remove.isPending}>
              {t.remove}
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit} className="space-y-3 border-t border-neutral-200 pt-3" noValidate>
        <p className="text-sm font-medium">{t.add}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field id={`blk-start-${item.id}`} label={t.start} type="date" value={start} onChange={(e) => setStart(e.target.value)} error={errors.date} />
          <Field id={`blk-end-${item.id}`} label={t.end} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          <Field id={`blk-units-${item.id}`} label={t.units} inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} error={errors.units} />
        </div>
        <Field id={`blk-reason-${item.id}`} label={t.reason} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        <Button type="submit" disabled={create.isPending}>
          {t.save}
        </Button>
      </form>
    </div>
  );
}
