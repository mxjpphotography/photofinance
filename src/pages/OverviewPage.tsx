import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card } from "../components/ui";
import { MonthlyChart } from "../components/MonthlyChart";
import { CalendarCard } from "../features/planning/CalendarCard";
import { useBudgetTotal, useMonthlyBalance, useUserSettings } from "../features/finance/api";
import { formatMonthLong, monthKey } from "../lib/dates";
import { de } from "../lib/de";
import { mapDbError } from "../lib/errors";
import { amountClass, formatEuro } from "../lib/money";

const t = de.overview;

export default function OverviewPage() {
  const navigate = useNavigate();
  const settings = useUserSettings();
  const balanceMonths = settings.data?.balance_months ?? 6;
  const chartMonths = settings.data?.chart_months ?? 6;
  // One request serves both the table and the chart.
  const monthly = useMonthlyBalance(Math.max(balanceMonths, chartMonths));
  const budget = useBudgetTotal();

  const openMonth = (key: string) => navigate(`/finanzen?monat=${key}`);

  const allRows = monthly.data ?? [];
  const tableRows = allRows.slice(-balanceMonths).reverse();
  const chartRows = allRows.slice(-chartMonths);
  const hasData = allRows.some((r) => r.income !== 0 || r.expense !== 0);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t.title}</h1>

      <Card title={t.budget}>
        {budget.isLoading ? <p role="status">{de.common.loading}</p> : null}
        {budget.isError ? <Alert tone="error">{mapDbError(budget.error)}</Alert> : null}
        {budget.data !== undefined ? (
          <p className={`text-3xl font-semibold tabular-nums ${amountClass(budget.data)}`}>{formatEuro(budget.data)}</p>
        ) : null}
        <p className="mt-2 text-sm text-neutral-600">{t.budgetNote}</p>
      </Card>

      {monthly.isError ? (
        <div className="space-y-3">
          <Alert tone="error">{mapDbError(monthly.error)}</Alert>
          <Button variant="secondary" onClick={() => void monthly.refetch()}>
            {de.common.retry}
          </Button>
        </div>
      ) : null}
      {monthly.isLoading || settings.isLoading ? <p role="status">{de.common.loading}</p> : null}

      {monthly.data && !hasData ? (
        <Card>
          <p className="text-neutral-700">{t.noData}</p>
          <Link className="mt-3 inline-block min-h-11 py-2 text-sm font-medium underline" to="/finanzen">
            {de.nav.finance}
          </Link>
        </Card>
      ) : null}

      {monthly.data && hasData ? (
        <>
          <Card title={t.balanceTitle}>
            <p className="mb-3 text-sm text-neutral-600">{t.balanceNote.replace("{n}", String(balanceMonths))}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-600">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      {t.month}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t.income}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t.expense}
                    </th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">
                      {t.balance}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.month} className="border-b border-neutral-100 last:border-0">
                      <th scope="row" className="py-1 pr-3 text-left font-medium">
                        <button
                          type="button"
                          className="min-h-11 text-left underline decoration-neutral-400 underline-offset-2"
                          aria-label={`${formatMonthLong(row.month)}: ${t.openMonth}`}
                          onClick={() => openMonth(monthKey(row.month))}
                        >
                          {formatMonthLong(row.month)}
                        </button>
                      </th>
                      <td className="px-3 py-1 text-right tabular-nums text-income">{formatEuro(row.income)}</td>
                      <td className="px-3 py-1 text-right tabular-nums text-expense">{formatEuro(-row.expense)}</td>
                      <td className={`py-1 pl-3 text-right font-semibold tabular-nums ${amountClass(row.balance)}`}>
                        {formatEuro(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={t.chartTitle}>
            <MonthlyChart rows={chartRows} onSelect={openMonth} />
          </Card>
        </>
      ) : null}

      <CalendarCard />
    </div>
  );
}
