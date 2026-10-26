/**
 * Date helpers. Dates travel as ISO strings (YYYY-MM-DD) and are never turned
 * into local-time Date objects for arithmetic, which avoids off-by-one-day
 * errors around time zones and daylight saving time.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date in the browser's local time zone as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-10-17" -> "2026-10" */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function isMonthKey(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "2026-10" -> "2026-10-01" */
export function monthStart(key: string): string {
  return `${key}-01`;
}

/** "2026-02" -> "2026-02-28" (leap years handled) */
export function monthEnd(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${key}-${pad(lastDay)}`;
}

/** Adds days to an ISO date without any time zone influence. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const longMonth = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "UTC" });

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d || 1));
}

/** "2026-10-01" -> "Oktober 2026" */
export function formatMonthLong(iso: string): string {
  return longMonth.format(toUtc(iso));
}

/** "2026-10-01" -> "Okt 26" (compact label for chart axes) */
export function formatMonthShort(iso: string): string {
  return `${shortMonth.format(toUtc(iso)).replace(".", "")} ${iso.slice(2, 4)}`;
}
