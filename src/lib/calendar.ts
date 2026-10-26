import { addDays, monthEnd, monthStart } from "./dates";

/** Everything the calendar can show. Only "appointment" can be edited here. */
export type CalendarKind = "appointment" | "job" | "equipment_block" | "rental_out" | "rental_in";

export interface CalendarEntry {
  id: string;
  kind: CalendarKind;
  title: string;
  start_date: string;
  /** the calendar_feed view always fills this (end = start for single days) */
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  job_id: string | null;
  equipment_id: string | null;
}

/** 0 = Monday ... 6 = Sunday (German week). */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * The weeks to draw for a month ("2026-10"): Monday-first rows of seven ISO
 * dates, including the leading and trailing days of the neighbouring months.
 */
export function monthGrid(key: string): string[][] {
  const first = monthStart(key);
  const last = monthEnd(key);
  let day = addDays(first, -weekdayIndex(first));
  const weeks: string[][] = [];
  while (day <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** "2026-12" + 1 -> "2027-01". */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** True when the entry covers the day (multi-day entries cover every day of their range). */
export function coversDay(entry: Pick<CalendarEntry, "start_date" | "end_date">, day: string): boolean {
  return entry.start_date <= day && day <= (entry.end_date || entry.start_date);
}

const kindOrder: Record<CalendarKind, number> = {
  appointment: 0,
  job: 1,
  rental_out: 2,
  rental_in: 3,
  equipment_block: 4,
};

/** Entries of one day: timed ones first by time, then all-day ones by kind and title. */
export function entriesOnDay(entries: readonly CalendarEntry[], day: string): CalendarEntry[] {
  return entries
    .filter((e) => coversDay(e, day))
    .sort((a, b) => {
      if (a.start_time && !b.start_time) return -1;
      if (!a.start_time && b.start_time) return 1;
      if (a.start_time && b.start_time && a.start_time !== b.start_time) return a.start_time < b.start_time ? -1 : 1;
      return kindOrder[a.kind] - kindOrder[b.kind] || a.title.localeCompare(b.title, "de");
    });
}

/** "14:30:00" -> "14:30" */
export function shortTime(time: string | null): string {
  return time ? time.slice(0, 5) : "";
}

/** How many entries cover each day of a range, for the dots in the month grid. */
export function countPerDay(entries: readonly CalendarEntry[], days: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const day of days) {
    const n = entries.reduce((total, e) => total + (coversDay(e, day) ? 1 : 0), 0);
    if (n > 0) counts.set(day, n);
  }
  return counts;
}
