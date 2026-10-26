import { useMemo, useState, type FormEvent } from "react";
import { Alert, Button, Field, Modal, Textarea } from "../../components/ui";
import { formatMonthLong, todayIso } from "../../lib/dates";
import { de } from "../../lib/de";
import { mapDbError } from "../../lib/errors";
import { centsToDecimalString, formatHours, parseCostCents, parseHours, previewQuote, type ParseResult } from "../../lib/jobs";
import { formatCents, isValidIsoDate } from "../../lib/money";
import type { Job } from "../../lib/types";
import { useDebounced } from "../../lib/useDebounced";
import { useUserSettings } from "../finance/api";
import { useCreateJob, useHourCheck, useUpdateJob, type HourCheckInput, type JobInput } from "./api";

const f = de.jobs.form;

type ErrorKey = "name" | "client" | "date" | "endDate" | "time" | "shooting" | "editing" | "organisation" | "travel" | "other" | "quoted" | "notes";
type Errors = Partial<Record<ErrorKey, string>>;

interface Props {
  /** set when editing an existing job */
  initial?: Job;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const hhmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : "");

/** Numbers back into the German text fields: 2.5 -> "2,5", 30 -> "30,00". */
const hoursText = (value: number | undefined) => (value ? String(value).replace(".", ",") : "");
const moneyText = (value: number | null | undefined) => (value === null || value === undefined ? "" : value.toFixed(2).replace(".", ","));

export function JobForm({ initial, onClose, onSaved }: Props) {
  const create = useCreateJob();
  const update = useUpdateJob();
  const settings = useUserSettings();

  const [name, setName] = useState(initial?.name ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [date, setDate] = useState(initial?.start_date ?? todayIso());
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [startTime, setStartTime] = useState(hhmm(initial?.start_time));
  const [endTime, setEndTime] = useState(hhmm(initial?.end_time));
  const [shooting, setShooting] = useState(hoursText(initial?.shooting_hours));
  const [editing, setEditing] = useState(hoursText(initial?.editing_hours));
  const [organisation, setOrganisation] = useState(hoursText(initial?.organisation_hours));
  const [travel, setTravel] = useState(initial && initial.travel_costs > 0 ? moneyText(initial.travel_costs) : "");
  const [other, setOther] = useState(initial && initial.other_costs > 0 ? moneyText(initial.other_costs) : "");
  const [quoted, setQuoted] = useState(moneyText(initial?.quoted_price));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  // Parsed values drive the live preview and the hour warning. Invalid input yields null.
  const parsed = useMemo(() => {
    const h = [parseHours(shooting), parseHours(editing), parseHours(organisation)];
    const costs = [parseCostCents(travel), parseCostCents(other)];
    const q = quoted.trim() === "" ? null : parseCostCents(quoted);
    if (!h.every((x) => x.ok) || !costs.every((x) => x.ok) || (q !== null && !q.ok)) return null;
    return {
      shooting: (h[0] as { value: number }).value,
      editing: (h[1] as { value: number }).value,
      organisation: (h[2] as { value: number }).value,
      travelCents: (costs[0] as { value: number }).value,
      otherCents: (costs[1] as { value: number }).value,
      quotedCents: q === null ? null : (q as { value: number }).value,
    };
  }, [shooting, editing, organisation, travel, other, quoted]);

  const preview = useMemo(() => {
    if (!parsed || settings.data === undefined) return null;
    const s = settings.data;
    return previewQuote({
      shootingHours: parsed.shooting,
      editingHours: parsed.editing,
      organisationHours: parsed.organisation,
      travelCents: parsed.travelCents,
      otherCents: parsed.otherCents,
      quotedCents: parsed.quotedCents,
      hourlyRateCents: s?.target_hourly_rate != null ? Math.round(s.target_hourly_rate * 100) : null,
      taxRate: s?.tax_rate ?? null,
      reserveRate: s?.reserve_rate ?? null,
    });
  }, [parsed, settings.data]);

  const checkInput = useMemo<HourCheckInput | null>(
    () =>
      parsed && isValidIsoDate(date)
        ? {
            startDate: date,
            shooting: parsed.shooting,
            editing: parsed.editing,
            organisation: parsed.organisation,
            excludeJobId: initial?.id ?? null,
          }
        : null,
    [parsed, date, initial?.id],
  );
  const hourCheck = useHourCheck(useDebounced(checkInput));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const next: Errors = {};
    const cleanName = name.trim();
    if (cleanName.length < 1 || cleanName.length > 120) next.name = f.errName;
    if (client.length > 120) next.client = f.errClient;
    if (!isValidIsoDate(date)) next.date = f.errDate;
    if (endDate !== "") {
      if (!isValidIsoDate(endDate)) next.endDate = f.errDate;
      else if (isValidIsoDate(date) && endDate < date) next.endDate = f.errEndDate;
    }
    const sameDay = endDate === "" || endDate === date;
    if (startTime && endTime && sameDay && endTime <= startTime) next.time = f.errTime;
    const shootingResult = parseHours(shooting);
    const editingResult = parseHours(editing);
    const organisationResult = parseHours(organisation);
    if (!shootingResult.ok) next.shooting = f.errHours;
    if (!editingResult.ok) next.editing = f.errHours;
    if (!organisationResult.ok) next.organisation = f.errHours;
    const travelResult = parseCostCents(travel);
    const otherResult = parseCostCents(other);
    const quotedResult = quoted.trim() === "" ? null : parseCostCents(quoted);
    if (!travelResult.ok) next.travel = f.errMoney;
    if (!otherResult.ok) next.other = f.errMoney;
    if (quotedResult && !quotedResult.ok) next.quoted = f.errMoney;
    if (notes.length > 4000) next.notes = f.errNotes;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // Every result was checked above, so the fallback 0 is never used.
    const value = (r: ParseResult) => (r.ok ? r.value : 0);
    const input: JobInput = {
      name: cleanName,
      client: client.trim() === "" ? null : client.trim(),
      start_date: date,
      start_time: startTime === "" ? null : startTime,
      end_date: endDate === "" ? null : endDate,
      end_time: endTime === "" ? null : endTime,
      shooting_hours: value(shootingResult),
      editing_hours: value(editingResult),
      organisation_hours: value(organisationResult),
      travel_costs: centsToDecimalString(value(travelResult)),
      other_costs: centsToDecimalString(value(otherResult)),
      quoted_price: quotedResult === null ? null : centsToDecimalString(value(quotedResult)),
      notes: notes.trim() === "" ? null : notes.trim(),
    };
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, input });
        onSaved(de.jobs.updated);
      } else {
        await create.mutateAsync(input);
        onSaved(de.jobs.created);
      }
    } catch (error) {
      setSubmitError(mapDbError(error));
    }
  }

  const check = hourCheck.data;
  const monthLabel = isValidIsoDate(date) ? formatMonthLong(date) : "";

  return (
    <Modal title={initial ? f.titleEdit : f.titleNew} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {submitError ? <Alert tone="error">{submitError}</Alert> : null}
        <Field id="job-name" label={f.name} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
        <Field id="job-client" label={f.client} value={client} maxLength={120} onChange={(e) => setClient(e.target.value)} error={errors.client} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="job-date" label={f.startDate} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <Field id="job-start" label={f.startTime} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Field id="job-end-date" label={f.endDate} type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} error={errors.endDate} />
          <Field id="job-end" label={f.endTime} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} error={errors.time} />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{f.hoursTitle}</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field id="job-shooting" label={f.shooting} inputMode="decimal" value={shooting} onChange={(e) => setShooting(e.target.value)} error={errors.shooting} />
            <Field id="job-editing" label={f.editing} inputMode="decimal" value={editing} onChange={(e) => setEditing(e.target.value)} error={errors.editing} />
            <Field id="job-organisation" label={f.organisation} inputMode="decimal" value={organisation} onChange={(e) => setOrganisation(e.target.value)} error={errors.organisation} />
          </div>
        </fieldset>

        {check && check.monthly_limit !== null && monthLabel ? (
          check.exceeds ? (
            <Alert tone="warning">
              {f.hourWarning
                .replace("{m}", monthLabel)
                .replace("{total}", formatHours(check.total_hours))
                .replace("{limit}", formatHours(check.monthly_limit))}
            </Alert>
          ) : (
            <p className="text-sm text-neutral-600">
              {f.hourOk
                .replace("{m}", monthLabel)
                .replace("{total}", formatHours(check.total_hours))
                .replace("{limit}", formatHours(check.monthly_limit))}
            </p>
          )
        ) : null}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{f.costsTitle}</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="job-travel" label={f.travel} inputMode="decimal" value={travel} onChange={(e) => setTravel(e.target.value)} error={errors.travel} />
            <Field id="job-other" label={f.other} inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} error={errors.other} />
          </div>
          <Field id="job-quoted" label={f.quoted} inputMode="decimal" value={quoted} onChange={(e) => setQuoted(e.target.value)} error={errors.quoted} />
          <p className="text-sm text-neutral-600">{f.quotedHint}</p>
        </fieldset>

        {parsed ? (
          <div className="space-y-1 rounded-lg bg-neutral-50 p-3 text-sm" aria-live="polite">
            <p className="font-semibold">{f.preview}</p>
            {preview ? (
              <>
                <p>
                  {de.jobs.calc.recommended}: {formatCents(preview.recommendedCents)}
                </p>
                <p>
                  {de.jobs.calc.profit}: {formatCents(preview.profitCents)}
                  {preview.hourlyEarningCents !== null ? ` (${formatCents(preview.hourlyEarningCents)} / Std.)` : ""}
                </p>
                {preview.setAsideCents > 0 ? (
                  <p>
                    {de.jobs.calc.setAside}: {formatCents(preview.setAsideCents)}
                  </p>
                ) : null}
                <p className="text-neutral-600">{f.previewNote}</p>
              </>
            ) : (
              <p className="text-neutral-600">{f.previewNoRate}</p>
            )}
          </div>
        ) : null}

        <Textarea id="job-notes" label={f.notes} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? f.saving : f.save}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {f.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
