/**
 * Money helpers for DISPLAY only. All financial arithmetic happens in the
 * database with numeric(12,2). Supabase returns numeric columns as numbers or
 * strings, so values are normalised here before formatting.
 */

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export function formatEuro(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "–";
  // Intl renders -0 as "-0,00 €"; show a plain zero instead.
  return eur.format(n === 0 ? 0 : n);
}

/** Tailwind text colour class: green for income / positive, red for expense / negative. */
export function amountClass(value: number | string): string {
  const n = Number(value);
  if (n > 0) return "text-income";
  if (n < 0) return "text-expense";
  return "text-neutral-600";
}

/** Formats an ISO date (YYYY-MM-DD) as DD.MM.YYYY without time zone shifts. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return dateFormat.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}
