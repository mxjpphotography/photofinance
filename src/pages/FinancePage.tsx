import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, Field, Select } from "../components/ui";
import { BookingForm } from "../features/finance/BookingForm";
import { CategoryView } from "../features/finance/CategoryView";
import { RulesPanel } from "../features/finance/RulesPanel";
import { TRANSACTION_LIMIT, useCategories, useDeleteTransaction, useTransactions } from "../features/finance/api";
import { isMonthKey, monthEnd, monthStart, formatMonthLong, todayIso } from "../lib/dates";
import { de } from "../lib/de";
import { mapDbError } from "../lib/errors";
import { centsToEuro, sumCents } from "../lib/finance";
import { amountClass, formatDate, formatEuro } from "../lib/money";
import type { Transaction } from "../lib/types";

const t = de.fin;

type View = "liste" | "einnahmen-kategorie" | "ausgaben-kategorie" | "regeln";

const views: { id: View; label: string }[] = [
  { id: "liste", label: t.views.list },
  { id: "einnahmen-kategorie", label: t.views.incomeByCategory },
  { id: "ausgaben-kategorie", label: t.views.expenseByCategory },
  { id: "regeln", label: t.views.rules },
];

function isView(value: string | null): value is View {
  return views.some((v) => v.id === value);
}

const isoDate = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

const quickViews = [
  { label: t.quick.all, typ: "", wdh: "" },
  { label: t.quick.incomeOne, typ: "einnahme", wdh: "einmalig" },
  { label: t.quick.incomeRec, typ: "einnahme", wdh: "wiederkehrend" },
  { label: t.quick.expenseOne, typ: "ausgabe", wdh: "einmalig" },
  { label: t.quick.expenseRec, typ: "ausgabe", wdh: "wiederkehrend" },
] as const;

export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();

  const viewParam = params.get("ansicht");
  const view: View = isView(viewParam) ? viewParam : "liste";

  const monthParam = params.get("monat");
  const month = isMonthKey(monthParam) ? monthParam : null;
  const from = month ? monthStart(month) : isoDate(params.get("von"));
  const to = month ? monthEnd(month) : isoDate(params.get("bis"));
  const category = params.get("kategorie") ?? "";
  const typ = params.get("typ") ?? "";
  const wdh = params.get("wdh") ?? "";
  const includeFuture = params.get("zukunft") === "1";

  const categories = useCategories();
  const [formOpen, setFormOpen] = useState<"new" | Transaction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  const categoryList = categories.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <Button onClick={() => setFormOpen("new")} aria-label={t.newBooking}>
          <span aria-hidden="true" className="mr-2 text-lg leading-none">
            +
          </span>
          {t.newBooking}
        </Button>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {categories.isError ? <Alert tone="error">{mapDbError(categories.error)}</Alert> : null}

      <nav aria-label="Ansichten" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? "page" : undefined}
            onClick={() => update({ ansicht: v.id === "liste" ? null : v.id })}
            className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium ${
              view === v.id ? "bg-brand text-white" : "bg-white text-neutral-800 ring-1 ring-neutral-300"
            }`}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view !== "regeln" ? (
        <Card title={t.filters.title}>
          <div className="space-y-4">
            {month ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{t.filters.monthChip.replace("{m}", formatMonthLong(monthStart(month)))}</Badge>
                <button
                  type="button"
                  className="min-h-11 px-2 text-sm text-neutral-700 underline"
                  onClick={() => update({ monat: null })}
                >
                  {t.filters.clearMonth}
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                id="filter-from"
                type="date"
                label={t.filters.from}
                value={from ?? ""}
                onChange={(e) => update({ von: e.target.value, monat: null, bis: month ? monthEnd(month) : params.get("bis") })}
              />
              <Field
                id="filter-to"
                type="date"
                label={t.filters.to}
                value={to ?? ""}
                onChange={(e) => update({ bis: e.target.value, monat: null, von: month ? monthStart(month) : params.get("von") })}
              />
            </div>

            {view === "liste" ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Select id="filter-category" label={t.filters.category} value={category} onChange={(e) => update({ kategorie: e.target.value })}>
                    <option value="">{t.filters.allCategories}</option>
                    <option value="none">{t.filters.noCategory}</option>
                    {categoryList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.is_active ? "" : " (inaktiv)"}
                      </option>
                    ))}
                  </Select>
                  <Select id="filter-type" label={t.filters.type} value={typ} onChange={(e) => update({ typ: e.target.value })}>
                    <option value="">{t.filters.typeAll}</option>
                    <option value="einnahme">{t.filters.typeIncome}</option>
                    <option value="ausgabe">{t.filters.typeExpense}</option>
                  </Select>
                  <Select id="filter-recurrence" label={t.filters.recurrence} value={wdh} onChange={(e) => update({ wdh: e.target.value })}>
                    <option value="">{t.filters.recurrenceAll}</option>
                    <option value="einmalig">{t.filters.recurrenceOne}</option>
                    <option value="wiederkehrend">{t.filters.recurrenceRec}</option>
                  </Select>
                </div>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={includeFuture}
                    onChange={(e) => update({ zukunft: e.target.checked ? "1" : null })}
                  />
                  {t.filters.showFuture}
                </label>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setParams(new URLSearchParams(), { replace: true })
                  }
                >
                  {t.filters.reset}
                </Button>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      {view === "liste" ? (
        <>
          <div role="group" aria-label={t.quick.label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {quickViews.map((q) => {
              const active = typ === q.typ && wdh === q.wdh;
              return (
                <button
                  key={q.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ typ: q.typ, wdh: q.wdh })}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${
                    active ? "bg-neutral-900 text-white" : "bg-white text-neutral-800 ring-1 ring-neutral-300"
                  }`}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
          <BookingList
            filters={{
              from,
              to,
              categoryId: category || undefined,
              kind: typ === "einnahme" ? "income" : typ === "ausgabe" ? "expense" : undefined,
              recurrence: wdh === "einmalig" ? "one_time" : wdh === "wiederkehrend" ? "recurring" : undefined,
              includeFuture,
              today,
            }}
            onEdit={setFormOpen}
            categories={categoryList}
            onNotice={setNotice}
          />
        </>
      ) : null}

      {view === "einnahmen-kategorie" || view === "ausgaben-kategorie" ? (
        <CategoryView
          kind={view === "einnahmen-kategorie" ? "income" : "expense"}
          from={from}
          to={to}
          categories={categoryList}
          onOpen={(categoryId) =>
            update({
              ansicht: null,
              kategorie: categoryId,
              typ: view === "einnahmen-kategorie" ? "einnahme" : "ausgabe",
              wdh: null,
            })
          }
        />
      ) : null}

      {view === "regeln" ? <RulesPanel categories={categoryList} onNotice={setNotice} /> : null}

      {formOpen ? (
        <BookingForm
          categories={categoryList}
          initial={formOpen === "new" ? undefined : formOpen}
          onClose={() => setFormOpen(null)}
          onSaved={(message) => {
            setFormOpen(null);
            setNotice(message);
          }}
        />
      ) : null}
    </div>
  );
}

function BookingList({
  filters,
  categories,
  onEdit,
  onNotice,
}: {
  filters: Parameters<typeof useTransactions>[0];
  categories: { id: string; name: string }[];
  onEdit: (transaction: Transaction) => void;
  onNotice: (message: string) => void;
}) {
  const transactions = useTransactions(filters);
  const remove = useDeleteTransaction();
  const [actionError, setActionError] = useState<string | null>(null);

  if (transactions.isLoading) return <p role="status">{de.common.loading}</p>;
  if (transactions.isError) {
    return (
      <div className="space-y-3">
        <Alert tone="error">{mapDbError(transactions.error)}</Alert>
        <Button variant="secondary" onClick={() => void transactions.refetch()}>
          {de.common.retry}
        </Button>
      </div>
    );
  }

  const rows = transactions.data ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <p className="font-medium">{t.list.empty}</p>
        <p className="mt-1 text-sm text-neutral-600">{t.list.emptyHint}</p>
      </Card>
    );
  }

  const incomeCents = sumCents(rows.filter((r) => r.amount > 0).map((r) => r.amount));
  const expenseCents = sumCents(rows.filter((r) => r.amount < 0).map((r) => r.amount));
  const name = (id: string | null) => categories.find((c) => c.id === id)?.name ?? t.categories.noCategory;

  function onDelete(transaction: Transaction) {
    if (!window.confirm(t.list.deleteConfirm)) return;
    setActionError(null);
    remove.mutate(transaction.id, {
      onSuccess: () => onNotice(t.list.deleted),
      onError: (e) => setActionError(mapDbError(e)),
    });
  }

  return (
    <div className="space-y-3">
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      <Card>
        <p className="mb-2 text-sm text-neutral-600">{t.list.sumNote}</p>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-neutral-600">{t.list.income}</dt>
            <dd className="font-semibold tabular-nums text-income">{formatEuro(centsToEuro(incomeCents))}</dd>
          </div>
          <div>
            <dt className="text-neutral-600">{t.list.expense}</dt>
            <dd className="font-semibold tabular-nums text-expense">{formatEuro(centsToEuro(expenseCents))}</dd>
          </div>
          <div>
            <dt className="text-neutral-600">{t.list.balance}</dt>
            <dd className={`font-semibold tabular-nums ${amountClass(incomeCents + expenseCents)}`}>
              {formatEuro(centsToEuro(incomeCents + expenseCents))}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <ul className="divide-y divide-neutral-200">
          {rows.map((row) => (
            <li key={row.id} className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.label}</p>
                  <p className="text-sm text-neutral-600">
                    {formatDate(row.booked_on)} · {name(row.category_id)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.recurrence_rule_id ? <Badge tone="info">{t.list.recurring}</Badge> : null}
                    {row.booked_on > filters.today ? <Badge>{t.list.future}</Badge> : null}
                  </div>
                </div>
                <p className={`shrink-0 font-semibold tabular-nums ${amountClass(row.amount)}`}>{formatEuro(row.amount)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="min-h-10 px-3" onClick={() => onEdit(row)}>
                  {t.list.edit}
                </Button>
                <Button variant="secondary" className="min-h-10 px-3" onClick={() => onDelete(row)} disabled={remove.isPending}>
                  {t.list.delete}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {rows.length >= TRANSACTION_LIMIT ? <p className="mt-3 text-sm text-neutral-600">{t.list.limitNote}</p> : null}
      </Card>
    </div>
  );
}
