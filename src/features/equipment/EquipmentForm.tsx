import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Modal, Select, Textarea } from "../../components/ui";
import { de } from "../../lib/de";
import { parseQuantity } from "../../lib/equipment";
import { mapDbError } from "../../lib/errors";
import { centsToDecimalString, parseCostCents, type ParseResult } from "../../lib/jobs";
import type { Equipment, EquipmentCategory, RentalListing } from "../../lib/types";
import { useSaveEquipment, type EquipmentInput } from "./api";

const f = de.eq.form;

type ErrorKey = "name" | "manufacturer" | "model" | "description" | "quantity" | "value" | "note";
type Errors = Partial<Record<ErrorKey, string>>;

interface Props {
  categories: EquipmentCategory[];
  initial?: Equipment;
  listing?: RentalListing;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function EquipmentForm({ categories, initial, listing, onClose, onSaved }: Props) {
  const save = useSaveEquipment();
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [value, setValue] = useState(initial?.purchase_value != null ? initial.purchase_value.toFixed(2).replace(".", ",") : "");
  const [status, setStatus] = useState<Equipment["availability_status"]>(initial?.availability_status ?? "available");
  const [offer, setOffer] = useState(listing?.is_active ?? false);
  const [publicNote, setPublicNote] = useState(listing?.public_note ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Inactive categories stay selectable only when the item already uses one.
  const options = categories.filter((c) => c.is_active || c.id === categoryId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const next: Errors = {};
    const cleanName = name.trim();
    if (cleanName.length < 1 || cleanName.length > 120) next.name = f.errName;
    if (manufacturer.length > 120) next.manufacturer = f.errLength;
    if (model.length > 120) next.model = f.errLength;
    if (description.length > 2000) next.description = f.errLength;
    if (publicNote.length > 1000) next.note = f.errLength;
    const q = parseQuantity(quantity);
    if (!q.ok) next.quantity = f.errQuantity;
    const v: ParseResult | null = value.trim() === "" ? null : parseCostCents(value);
    if (v && !v.ok) next.value = f.errValue;
    setErrors(next);
    if (Object.keys(next).length > 0 || !q.ok) return;

    const input: EquipmentInput = {
      name: cleanName,
      category_id: categoryId || null,
      manufacturer: manufacturer.trim() || null,
      model: model.trim() || null,
      description: description.trim() || null,
      quantity: q.value,
      purchase_value: v && v.ok ? centsToDecimalString(v.value) : null,
      availability_status: status,
    };
    try {
      await save.mutateAsync({ id: initial?.id ?? null, input, offer, publicNote: publicNote.trim() || null });
      onSaved(initial ? de.eq.updated : de.eq.created);
    } catch (error) {
      setSubmitError(mapDbError(error));
    }
  }

  return (
    <Modal title={initial ? f.titleEdit : f.titleNew} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {submitError ? <Alert tone="error">{submitError}</Alert> : null}
        <Field id="eq-name" label={f.name} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
        <Select id="eq-category" label={f.category} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{f.noCategory}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="eq-manufacturer" label={f.manufacturer} value={manufacturer} maxLength={120} onChange={(e) => setManufacturer(e.target.value)} error={errors.manufacturer} />
          <Field id="eq-model" label={f.model} value={model} maxLength={120} onChange={(e) => setModel(e.target.value)} error={errors.model} />
          <Field id="eq-quantity" label={f.quantity} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} error={errors.quantity} />
          <Field id="eq-value" label={f.value} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} />
        </div>
        <Textarea id="eq-description" label={f.description} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <Select id="eq-status" label={f.status} value={status} onChange={(e) => setStatus(e.target.value as Equipment["availability_status"])}>
          <option value="available">{f.statusAvailable}</option>
          <option value="unavailable">{f.statusUnavailable}</option>
        </Select>

        <fieldset className="space-y-2 rounded-lg bg-neutral-50 p-3">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="size-5" checked={offer} onChange={(e) => setOffer(e.target.checked)} />
            {f.offer}
          </label>
          <p className="text-sm text-neutral-600">{f.offerHint}</p>
          {offer ? (
            <Textarea id="eq-note" label={f.publicNote} value={publicNote} maxLength={1000} onChange={(e) => setPublicNote(e.target.value)} error={errors.note} />
          ) : null}
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? f.saving : f.save}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {f.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
