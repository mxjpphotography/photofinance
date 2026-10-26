import { useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Field, Modal, Select } from "../../components/ui";
import { parseAmount, toGermanInput } from "../../lib/amount";
import { addDays, todayIso } from "../../lib/dates";
import { de } from "../../lib/de";
import { mapDbError } from "../../lib/errors";
import { describeInterval } from "../../lib/finance";
import { amountClass, formatDate, formatEuro } from "../../lib/money";
import type { FinanceCategory, RecurrenceRule } from "../../lib/types";
import { useDeleteRule, useForecast, useRules, useUpdateRule } from "./api";

const t = de.fin.rules;
const f = de.fin.form;

function RuleEditForm({
  rule,
  categories,
  onClose,
  onSaved,
}: {
  rule: RecurrenceRule;
  categories: FinanceCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useUpdateRule();
  const [label, setLabel] = useState(rule.label);
  const [amountText, setAmountText] = useState(toGermanInput(rule.amount));
  const [categoryId, setCategoryId] = useState(rule.category_id ?? "");
  const [endDate, setEndDate] = useState(rule.end_date ?? "");
  const [errors, setErrors] = useState<Partial<Record<"label" | "amount" | "end", string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const next: typeof errors = {};
    const cleanLabel = label.trim();
    const parsed = parseAmount(amountText);
    if (cleanLabel.length < 1 || cleanLabel.length > 120) next.label = f.errLabel;
    if (!parsed.ok) {
      next.amount =
        parsed.reason === "empty" ? f.errAmountEmpty : parsed.reason === "zero" ? f.errAmountZero : f.errAmountInvalid;
    }
    if (endDate && endDate < rule.start_date) next.end = f.errEnd;
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;

    try {
      await update.mutateAsync({
        id: rule.id,
        values: { label: cleanLabel, amount: parsed.value, category_id: categoryId || null, end_date: endDate || null },
      });
      onSaved();
    } catch (error) {
      setSubmitError(mapDbError(error));
    }
  }

  const options = categories.filter((c) => c.is_active || c.id === rule.category_id);

  return (
    <Modal title={t.editTitle} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {submitError ? <Alert tone="error">{submitError}</Alert> : null}
        <Alert tone="info">
          {describeInterval(rule.interval_count, rule.interval_unit)} {t.from} {formatDate(rule.start_date)}.{" "}
          {t.scheduleLocked}
        </Alert>
        <p className="text-sm text-neutral-600">{t.historyNote}</p>
        <Field id="rule-label" label={f.label} value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} error={errors.label} />
        <Field
          id="rule-amount"
          label={f.amount}
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          error={errors.amount}
        />
        <Select id="rule-category" label={f.category} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{f.noCategory}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_active ? "" : " (inaktiv)"}
            </option>
          ))}
        </Select>
        <Field id="rule-end" type="date" label={f.endDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} error={errors.end} />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            {f.cancel}
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? f.saving : f.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RulesPanel({ categories, onNotice }: { categories: FinanceCategory[]; onNotice: (message: string) => void }) {
  const rules = useRules();
  const forecast = useForecast(addDays(todayIso(), 90));
  const update = useUpdateRule();
  const remove = useDeleteRule();
  const [editing, setEditing] = useState<RecurrenceRule | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? de.fin.categories.noCategory;

  function toggleActive(rule: RecurrenceRule) {
    setActionError(null);
    update.mutate(
      { id: rule.id, values: { is_active: !rule.is_active } },
      {
        onSuccess: () => onNotice(rule.is_active ? t.deactivated : t.activated),
        onError: (e) => setActionError(mapDbError(e)),
      },
    );
  }

  function deleteRule(rule: RecurrenceRule) {
    if (!window.confirm(t.deleteConfirm)) return;
    setActionError(null);
    remove.mutate(rule.id, {
      onSuccess: () => onNotice(t.deleted),
      onError: (e) => setActionError(mapDbError(e)),
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">{t.intro}</p>
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      <Card title={t.title}>
        {rules.isLoading ? <p role="status">{de.common.loading}</p> : null}
        {rules.isError ? (
          <div className="space-y-3">
            <Alert tone="error">{mapDbError(rules.error)}</Alert>
            <Button variant="secondary" onClick={() => void rules.refetch()}>
              {de.common.retry}
            </Button>
          </div>
        ) : null}
        {rules.data && rules.data.length === 0 ? <p className="text-neutral-700">{t.empty}</p> : null}
        {rules.data && rules.data.length > 0 ? (
          <ul className="divide-y divide-neutral-200">
            {rules.data.map((rule) => (
              <li key={rule.id} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{rule.label}</p>
                    <p className="text-sm text-neutral-600">
                      {describeInterval(rule.interval_count, rule.interval_unit)} · {t.from} {formatDate(rule.start_date)}
                      {rule.end_date ? ` · ${t.until} ${formatDate(rule.end_date)}` : ""} · {categoryName(rule.category_id)}
                    </p>
                    <div className="mt-1">
                      <Badge tone={rule.is_active ? "info" : "neutral"}>{rule.is_active ? t.active : t.inactive}</Badge>
                    </div>
                  </div>
                  <p className={`shrink-0 font-semibold tabular-nums ${amountClass(rule.amount)}`}>{formatEuro(rule.amount)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="min-h-10 px-3" onClick={() => setEditing(rule)}>
                    {t.edit}
                  </Button>
                  <Button variant="secondary" className="min-h-10 px-3" onClick={() => toggleActive(rule)} disabled={update.isPending}>
                    {rule.is_active ? t.deactivate : t.activate}
                  </Button>
                  <Button variant="secondary" className="min-h-10 px-3" onClick={() => deleteRule(rule)} disabled={remove.isPending}>
                    {t.delete}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title={t.forecastTitle}>
        <p className="mb-3 text-sm text-neutral-600">{t.forecastNote}</p>
        {forecast.isLoading ? <p role="status">{de.common.loading}</p> : null}
        {forecast.isError ? <Alert tone="error">{mapDbError(forecast.error)}</Alert> : null}
        {forecast.data && forecast.data.length === 0 ? <p className="text-neutral-700">{t.forecastEmpty}</p> : null}
        {forecast.data && forecast.data.length > 0 ? (
          <ul className="divide-y divide-neutral-200">
            {forecast.data.slice(0, 40).map((row) => (
              <li key={`${row.rule_id}-${row.occurrence_date}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="tabular-nums text-neutral-600">{formatDate(row.occurrence_date)}</span> · {row.label}
                </span>
                <span className={`shrink-0 tabular-nums ${amountClass(row.amount)}`}>{formatEuro(row.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {editing ? (
        <RuleEditForm
          rule={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onNotice(t.saved);
          }}
        />
      ) : null}
    </div>
  );
}
