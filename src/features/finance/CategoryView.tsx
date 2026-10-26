import { Alert, Button, Card } from "../../components/ui";
import { de } from "../../lib/de";
import { mapDbError } from "../../lib/errors";
import { centsToEuro, sumCents } from "../../lib/finance";
import { amountClass, formatEuro } from "../../lib/money";
import type { FinanceCategory } from "../../lib/types";
import { useCategoryTotals } from "./api";

const t = de.fin.categories;

/**
 * Income or expenses grouped by category. The numbers come from the database
 * function category_totals, so they match the booking list and the dashboard.
 */
export function CategoryView({
  kind,
  from,
  to,
  categories,
  onOpen,
}: {
  kind: "income" | "expense";
  from?: string;
  to?: string;
  categories: FinanceCategory[];
  /** category id, or "none" for bookings without a category */
  onOpen: (categoryId: string) => void;
}) {
  // The function never counts bookings that are not yet due.
  const totals = useCategoryTotals(from ?? "2000-01-01", to ?? "2999-12-31");

  if (totals.isLoading) return <p role="status">{de.common.loading}</p>;
  if (totals.isError) {
    return (
      <div className="space-y-3">
        <Alert tone="error">{mapDbError(totals.error)}</Alert>
        <Button variant="secondary" onClick={() => void totals.refetch()}>
          {de.common.retry}
        </Button>
      </div>
    );
  }

  const rows = (totals.data ?? []).filter((r) => r.kind === kind);
  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-neutral-700">{t.empty}</p>
      </Card>
    );
  }

  const name = (id: string | null) => categories.find((c) => c.id === id)?.name ?? t.noCategory;
  const sorted = [...rows].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const sum = centsToEuro(sumCents(rows.map((r) => r.total)));

  return (
    <Card>
      <ul className="divide-y divide-neutral-200">
        {sorted.map((row) => (
          <li key={row.category_id ?? "none"} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{name(row.category_id)}</p>
              <p className="text-sm text-neutral-600">
                {row.booking_count} {t.count}
                {row.recurring_total !== 0 ? ` · ${t.recurringPart}: ${formatEuro(row.recurring_total)}` : ""}
              </p>
              <Button variant="secondary" className="mt-2 min-h-10 px-3" onClick={() => onOpen(row.category_id ?? "none")}>
                {t.open}
              </Button>
            </div>
            <p className={`shrink-0 font-semibold tabular-nums ${amountClass(row.total)}`}>{formatEuro(row.total)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-3 font-semibold">
        <span>{t.total}</span>
        <span className={`tabular-nums ${amountClass(sum)}`}>{formatEuro(sum)}</span>
      </div>
    </Card>
  );
}
