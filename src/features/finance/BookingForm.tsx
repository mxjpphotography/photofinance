import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Modal, Select } from "../../components/ui";
import { parseAmount, toGermanInput, type AmountResult } from "../../lib/amount";
import { todayIso } from "../../lib/dates";
import { de } from "../../lib/de";
import { mapDbError } from "../../lib/errors";
import { formatDate } from "../../lib/money";
import type { FinanceCategory, IntervalUnit, Transaction } from "../../lib/types";
import { useJobs } from "../planning/api";
import { useCreateRule, useCreateTransaction, useUpdateTransaction } from "./api";

const f = de.fin.form;

function amountMessage(result: Exclude<AmountResult, { ok: true }>): string {
  switch (result.reason) {
    case "empty":
      return f.errAmountEmpty;
    case "zero":
      return f.errAmountZero;
    case "too_large":
      return f.errAmountLarge;
    default:
      return f.errAmountInvalid;
  }
}

interface Props {
  categories: FinanceCategory[];
  /** set when editing an existing booking */
  initial?: Transaction;
  onClose: () => void;
  onSaved: (message: string) => void;
}

type Errors = Partial<Record<"label" | "amount" | "date" | "count" | "end", string>>;

export function BookingForm({ categories, initial, onClose, onSaved }: Props) {
  const editing = initial !== undefined;
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const createRule = useCreateRule();
  const jobs = useJobs();

  const [mode, setMode] = useState<"one_time" | "recurring">("one_time");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [amountText, setAmountText] = useState(initial ? toGermanInput(initial.amount) : "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [jobId, setJobId] = useState(initial?.job_id ?? "");
  const [date, setDate] = useState(initial?.booked_on ?? todayIso());
  const [startDate, setStartDate] = useState(todayIso());
  const [count, setCount] = useState("1");
  const [unit, setUnit] = useState<IntervalUnit>("month");
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const busy = createTransaction.isPending || updateTransaction.isPending || createRule.isPending;
  const parsed = parseAmount(amountText);
  const sign = parsed.ok ? (parsed.cents > 0 ? "income" : "expense") : null;

  // Offer active categories that fit the sign of the amount, plus the one already chosen.
  const options = categories.filter(
    (c) =>
      c.id === categoryId ||
      (c.is_active && (sign === null || c.applies_to === "both" || c.applies_to === sign)),
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const next: Errors = {};
    const cleanLabel = label.trim();
    if (cleanLabel.length < 1 || cleanLabel.length > 120) next.label = f.errLabel;
    if (!parsed.ok) next.amount = amountMessage(parsed);

    const recurring = !editing && mode === "recurring";
    const mainDate = recurring ? startDate : date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mainDate)) next.date = f.errDate;

    const countNumber = Number(count);
    if (recurring) {
      if (!/^\d+$/.test(count) || countNumber < 1 || countNumber > 60) next.count = f.errCount;
      if (endDate && endDate < startDate) next.end = f.errEnd;
    }

    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;

    const common = { label: cleanLabel, amount: parsed.value, category_id: categoryId || null };
    try {
      if (editing && initial) {
        await updateTransaction.mutateAsync({ id: initial.id, values: { ...common, booked_on: date, job_id: jobId || null } });
        onSaved(de.fin.list.saved);
      } else if (recurring) {
        await createRule.mutateAsync({
          ...common,
          interval_unit: unit,
          interval_count: countNumber,
          start_date: startDate,
          end_date: endDate || null,
        });
        onSaved(de.fin.list.ruleSaved);
      } else {
        await createTransaction.mutateAsync({ ...common, booked_on: date, job_id: jobId || null });
        onSaved(de.fin.list.saved);
      }
    } catch (error) {
      setSubmitError(mapDbError(error));
    }
  }

  const isFuture = !editing || mode === "one_time" ? date > todayIso() : false;

  return (
    <Modal title={editing ? f.titleEdit : f.titleNew} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {submitError ? <Alert tone="error">{submitError}</Alert> : null}
        {editing && initial?.recurrence_rule_id ? <Alert tone="info">{f.generatedNote}</Alert> : null}

        <Field
          id="booking-label"
          label={f.label}
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          error={errors.label}
          autoFocus
        />

        <div className="space-y-1">
          <Field
            id="booking-amount"
            label={f.amount}
            inputMode="decimal"
            autoComplete="off"
            placeholder="-49,90"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            error={errors.amount}
          />
          <p className="text-sm text-neutral-600">{f.amountHint}</p>
          {sign ? (
            <p className={`text-sm font-medium ${sign === "income" ? "text-income" : "text-expense"}`}>
              {sign === "income" ? f.asIncome : f.asExpense}
            </p>
          ) : null}
        </div>

        <Select id="booking-category" label={f.category} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{f.noCategory}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_active ? "" : " (inaktiv)"}
            </option>
          ))}
        </Select>

        {mode === "one_time" || editing ? (
          <div className="space-y-1">
            <Select id="booking-job" label={f.job} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">{f.noJob}</option>
              {(jobs.data ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} ({formatDate(j.start_date)})
                </option>
              ))}
            </Select>
            <p className="text-sm text-neutral-600">{f.jobHint}</p>
          </div>
        ) : null}

        {!editing ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-neutral-800">{f.kind}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["one_time", "recurring"] as const).map((value) => (
                <label
                  key={value}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium ring-1 ${
                    mode === value ? "bg-brand text-white ring-brand" : "bg-white text-neutral-800 ring-neutral-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="booking-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="sr-only"
                  />
                  {value === "one_time" ? f.oneTime : f.recurring}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {mode === "one_time" || editing ? (
          <div className="space-y-1">
            <Field id="booking-date" type="date" label={f.date} value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
            {isFuture ? <p className="text-sm text-neutral-600">{f.futureNote}</p> : null}
          </div>
        ) : (
          <div className="space-y-4">
            <Field
              id="booking-start"
              type="date"
              label={f.startDate}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              error={errors.date}
            />
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <Field
                id="booking-count"
                label={f.every}
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                error={errors.count}
              />
              <Select id="booking-unit" label="Einheit" value={unit} onChange={(e) => setUnit(e.target.value as IntervalUnit)}>
                <option value="week">{f.unitWeek}</option>
                <option value="month">{f.unitMonth}</option>
                <option value="year">{f.unitYear}</option>
              </Select>
            </div>
            <Field
              id="booking-end"
              type="date"
              label={f.endDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              error={errors.end}
            />
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {f.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? f.saving : f.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
