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

/**
 * Parses what a person types into an amount string for the database
 * (numeric(12,2)). Accepts "12,50", "1.234,56", "-19,99", "12.5", "+7", "5 €".
 * Returns a normalised string such as "-1234.50", or null when the input is
 * not a valid, non-zero amount with at most two decimals. No floating point is
 * involved, so nothing can be rounded by accident.
 */
export function parseAmount(input: string): string | null {
  let s = input.replace(/[\s€]/g, "");
  if (!s) return null;

  let sign = "";
  if (s[0] === "-" || s[0] === "−" || s[0] === "+") {
    if (s[0] !== "+") sign = "-";
    s = s.slice(1);
  }

  if (s.includes(",")) {
    // German style: dots are thousands separators, the comma is the decimal mark.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" or "1.234.567": thousands separators only.
    s = s.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [intPart, fraction = ""] = s.split(".");
  const integer = intPart.replace(/^0+(?=\d)/, "");
  if (integer.length > 10) return null; // numeric(12,2) holds at most 10 integer digits
  const normalised = `${integer}.${fraction.padEnd(2, "0")}`;
  if (/^0\.00$/.test(normalised)) return null; // an amount of zero is invalid
  return sign + normalised;
}

/** Converts an amount to whole cents without accumulating floating point error. */
export function toCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

/** Sums amounts exactly by adding whole cents. Returns the total in cents. */
export function sumCents(values: Array<number | string>): number {
  return values.reduce<number>((total, v) => total + toCents(v), 0);
}

export function formatCents(cents: number): string {
  return formatEuro(cents / 100);
}

/** Today's date in the browser's local time zone as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True when the string is a real calendar date in YYYY-MM-DD form. */
export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
