import type { ParseResult } from "./jobs";

/** Stock count: a whole number from 1 to max. */
export function parseQuantity(input: string, max = 1000): ParseResult {
  const raw = input.trim();
  if (!/^\d+$/.test(raw)) return { ok: false };
  const value = Number(raw);
  return value >= 1 && value <= max ? { ok: true, value } : { ok: false };
}

/** Block dates are valid when both are real ISO dates and the end is not before the start. */
export function validPeriod(start: string, end: string): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return iso.test(start) && iso.test(end) && end >= start;
}
