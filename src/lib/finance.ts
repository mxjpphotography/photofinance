import type { IntervalUnit } from "./types";

/** Exact integer cents for one amount (amounts have at most two decimals). */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Sums amounts in integer cents, so repeated additions cannot drift. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, v) => total + toCents(v), 0);
}

export function centsToEuro(cents: number): number {
  return cents / 100;
}

const intervalWords: Record<IntervalUnit, { one: string; many: string }> = {
  week: { one: "Jede Woche", many: "Alle {n} Wochen" },
  month: { one: "Jeden Monat", many: "Alle {n} Monate" },
  year: { one: "Jedes Jahr", many: "Alle {n} Jahre" },
};

/** "Jeden Monat", "Alle 3 Monate", ... */
export function describeInterval(count: number, unit: IntervalUnit): string {
  const words = intervalWords[unit];
  return count === 1 ? words.one : words.many.replace("{n}", String(count));
}
