import type { KeyboardEvent } from "react";
import { niceScale } from "../lib/chart";
import { monthKey, formatMonthLong, formatMonthShort } from "../lib/dates";
import { de } from "../lib/de";
import { formatEuro } from "../lib/money";
import type { MonthlyBalanceRow } from "../lib/types";

const t = de.overview;

const axisFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Layout in SVG units
const GROUP_WIDTH = 56;
const BAR_WIDTH = 18;
const BAR_GAP = 4;
const PAD_LEFT = 68;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 34;
const HEIGHT = 260;
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;

/**
 * Income (green) and expenses (red) per month. Recurring bookings are drawn
 * with a diagonal hatch on top of the solid one-time part, so the two kinds
 * can be told apart without relying on colour alone. Each month is a link that
 * opens its bookings. Drawn as plain SVG, so it needs no chart library.
 */
export function MonthlyChart({ rows, onSelect }: { rows: MonthlyBalanceRow[]; onSelect: (monthIso: string) => void }) {
  const maxValue = Math.max(0, ...rows.flatMap((r) => [r.income, r.expense]));
  const scale = niceScale(maxValue);
  const width = PAD_LEFT + PAD_RIGHT + rows.length * GROUP_WIDTH;
  const y = (value: number) => PAD_TOP + PLOT_HEIGHT - (value / scale.max) * PLOT_HEIGHT;
  const heightOf = (value: number) => (value / scale.max) * PLOT_HEIGHT;

  const onKey = (event: KeyboardEvent, month: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(month);
    }
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="group"
          aria-label={t.chartLabel}
          className="h-auto w-full"
          style={{ minWidth: Math.min(width, 900) }}
        >
          <defs>
            <pattern id="pf-hatch-income" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" style={{ fill: "var(--color-income-soft)" }} />
              <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" style={{ stroke: "var(--color-income)" }} />
            </pattern>
            <pattern id="pf-hatch-expense" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" style={{ fill: "var(--color-expense-soft)" }} />
              <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" style={{ stroke: "var(--color-expense)" }} />
            </pattern>
          </defs>

          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={y(tick)} y2={y(tick)} stroke="#e5e7eb" strokeWidth="1" />
              <text x={PAD_LEFT - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#4b5563">
                {axisFormat.format(tick)}
              </text>
            </g>
          ))}

          {rows.map((row, index) => {
            const groupX = PAD_LEFT + index * GROUP_WIDTH;
            const incomeX = groupX + (GROUP_WIDTH - 2 * BAR_WIDTH - BAR_GAP) / 2;
            const expenseX = incomeX + BAR_WIDTH + BAR_GAP;
            const label = `${formatMonthLong(row.month)}: ${t.income} ${formatEuro(row.income)}, ${t.expense} ${formatEuro(
              row.expense,
            )}, ${t.balance} ${formatEuro(row.balance)}. ${t.openMonth}`;

            const incomeOneHeight = heightOf(row.income_one_time);
            const incomeRecHeight = heightOf(row.income_recurring);
            const expenseOneHeight = heightOf(row.expense_one_time);
            const expenseRecHeight = heightOf(row.expense_recurring);

            return (
              <g
                key={row.month}
                className="pf-month"
                role="link"
                tabIndex={0}
                aria-label={label}
                onClick={() => onSelect(monthKey(row.month))}
                onKeyDown={(e) => onKey(e, monthKey(row.month))}
                style={{ cursor: "pointer" }}
              >
                <title>{label}</title>
                <rect className="pf-focus" x={groupX + 1} y={PAD_TOP} width={GROUP_WIDTH - 2} height={PLOT_HEIGHT + PAD_BOTTOM - 4} rx="6" fill="transparent" />

                {/* income: one-time part at the bottom, recurring part stacked on top */}
                <rect x={incomeX} y={y(row.income_one_time)} width={BAR_WIDTH} height={incomeOneHeight} style={{ fill: "var(--color-income)" }} />
                <rect
                  x={incomeX}
                  y={y(row.income_one_time) - incomeRecHeight}
                  width={BAR_WIDTH}
                  height={incomeRecHeight}
                  fill="url(#pf-hatch-income)"
                  strokeWidth="1"
                  style={{ stroke: "var(--color-income)" }}
                />

                {/* expenses */}
                <rect x={expenseX} y={y(row.expense_one_time)} width={BAR_WIDTH} height={expenseOneHeight} style={{ fill: "var(--color-expense)" }} />
                <rect
                  x={expenseX}
                  y={y(row.expense_one_time) - expenseRecHeight}
                  width={BAR_WIDTH}
                  height={expenseRecHeight}
                  fill="url(#pf-hatch-expense)"
                  strokeWidth="1"
                  style={{ stroke: "var(--color-expense)" }}
                />

                <text x={groupX + GROUP_WIDTH / 2} y={HEIGHT - 12} textAnchor="middle" fontSize="11" fill="#374151">
                  {formatMonthShort(row.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2" aria-label="Legende">
        {[
          { label: t.legendIncomeOne, fill: "var(--color-income)", stroke: "var(--color-income)" },
          { label: t.legendIncomeRec, fill: "url(#pf-hatch-income)", stroke: "var(--color-income)" },
          { label: t.legendExpenseOne, fill: "var(--color-expense)", stroke: "var(--color-expense)" },
          { label: t.legendExpenseRec, fill: "url(#pf-hatch-expense)", stroke: "var(--color-expense)" },
        ].map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <svg width="18" height="18" aria-hidden="true">
              <rect x="1" y="1" width="16" height="16" rx="2" style={{ fill: item.fill, stroke: item.stroke }} strokeWidth="1" />
            </svg>
            {item.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-neutral-600">{t.chartHint}</p>
    </div>
  );
}
