import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Modal, Textarea } from "../../components/ui";
import { todayIso } from "../../lib/dates";
import { de } from "../../lib/de";
import { mapDbError } from "../../lib/errors";
import { validRequestPeriod } from "../../lib/rentals";
import type { RentalOffer } from "../../lib/types";
import { useCreateRequest } from "./api";

const t = de.rent.request;

export interface CartLine {
  offer: RentalOffer;
  units: number;
}

interface Props {
  lines: CartLine[];
  defaultStart: string;
  defaultEnd: string;
  onClose: () => void;
  onSent: () => void;
}

export function RequestModal({ lines, defaultStart, defaultEnd, onClose, onSent }: Props) {
  const create = useCreateRequest();
  const today = todayIso();
  const [start, setStart] = useState(defaultStart || today);
  const [end, setEnd] = useState(defaultEnd || defaultStart || today);
  const [purpose, setPurpose] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"period" | "purpose", string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const next: typeof errors = {};
    if (!validRequestPeriod(start, end, today)) next.period = t.errPeriod;
    const cleanPurpose = purpose.trim();
    if (cleanPurpose.length < 1 || cleanPurpose.length > 2000) next.purpose = t.errPurpose;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      await create.mutateAsync({
        items: lines.map((l) => ({ equipment_id: l.offer.equipment_id, units: l.units })),
        start,
        end,
        purpose: cleanPurpose,
      });
      onSent();
    } catch (error) {
      setSubmitError(mapDbError(error));
    }
  }

  return (
    <Modal title={t.title} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {submitError ? <Alert tone="error">{submitError}</Alert> : null}
        <div>
          <p className="text-sm font-medium">{t.items}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-neutral-700">
            {lines.map((l) => (
              <li key={l.offer.equipment_id}>
                {l.units} × {l.offer.name} ({de.rent.offer.from.replace("{name}", l.offer.owner_name)})
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="req-start" label={t.from} type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} error={errors.period} />
          <Field id="req-end" label={t.to} type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Textarea id="req-purpose" label={t.purpose} value={purpose} maxLength={2000} onChange={(e) => setPurpose(e.target.value)} error={errors.purpose} />
        <p className="text-sm text-neutral-600">{t.hint}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t.sending : t.send}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
