import { parseAmount } from "./amount";

/**
 * Helpers for the job form. The authoritative calculation is the database
 * function calculate_job_quote (see docs/calculation.md). previewQuote mirrors
 * it so the form can show a price while typing; the saved job always shows the
 * database figures.
 */

export type ParseResult = { ok: true; value: number } | { ok: false };

/** Hours: "3", "2,5", "1.75". Empty counts as 0. At most two decimals, 0..max. */
export function parseHours(input: string, max = 9999.99): ParseResult {
  const raw = input.replace(/[\s ]/g, "");
  if (raw === "") return { ok: true, value: 0 };
  const normalised = raw.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return { ok: false };
  const value = Number(normalised);
  return value <= max ? { ok: true, value } : { ok: false };
}

/**
 * Costs and prices in euro, never negative. Returns whole cents so nothing is
 * rounded by accident. Empty counts as 0 (callers that treat empty as "not set"
 * check for it first).
 */
export function parseCostCents(input: string): ParseResult {
  if (input.replace(/[\s €]/g, "") === "") return { ok: true, value: 0 };
  const result = parseAmount(input);
  if (result.ok) return result.cents > 0 ? { ok: true, value: result.cents } : { ok: false };
  return result.reason === "zero" ? { ok: true, value: 0 } : { ok: false };
}

/** Cents to the two-decimal string the database expects: 12345 -> "123.45". */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export interface QuoteInput {
  shootingHours: number;
  editingHours: number;
  organisationHours: number;
  travelCents: number;
  otherCents: number;
  /** price offered to the client, in cents; null = none entered */
  quotedCents: number | null;
  /** desired hourly rate before tax, in cents; null = not configured */
  hourlyRateCents: number | null;
  /** optional shares of the profit to set aside, as fractions (0.2 = 20 %) */
  taxRate: number | null;
  reserveRate: number | null;
}

export interface QuotePreview {
  totalHours: number;
  costsCents: number;
  recommendedCents: number;
  priceUsedCents: number;
  profitCents: number;
  /** profit per hour in cents, null when no hours are planned */
  hourlyEarningCents: number | null;
  setAsideCents: number;
}

/** Same formula as the database: recommended = H * w + K, profit = price - K. */
export function previewQuote(input: QuoteInput): QuotePreview | null {
  if (input.hourlyRateCents === null) return null;
  const hundredths = (hours: number) => Math.round(hours * 100);
  const totalHundredths = hundredths(input.shootingHours) + hundredths(input.editingHours) + hundredths(input.organisationHours);
  const totalHours = totalHundredths / 100;
  const costsCents = input.travelCents + input.otherCents;
  // hours * rate(in cents), kept in integers: (hundredths / 100) * cents
  const labourCents = Math.round((totalHundredths * input.hourlyRateCents) / 100);
  const recommendedCents = labourCents + costsCents;
  const priceUsedCents = input.quotedCents ?? recommendedCents;
  const profitCents = priceUsedCents - costsCents;
  const rate = (input.taxRate ?? 0) + (input.reserveRate ?? 0);
  return {
    totalHours,
    costsCents,
    recommendedCents,
    priceUsedCents,
    profitCents,
    hourlyEarningCents: totalHundredths > 0 ? Math.round((profitCents * 100) / totalHundredths) : null,
    setAsideCents: Math.round(Math.max(profitCents, 0) * rate),
  };
}

/** Hours to German text without needless decimals: 12 -> "12", 2.5 -> "2,5". */
export function formatHours(hours: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(hours);
}

/** Total hours of a job as stored. */
export function jobHours(job: { shooting_hours: number; editing_hours: number; organisation_hours: number }): number {
  return (
    (Math.round(job.shooting_hours * 100) + Math.round(job.editing_hours * 100) + Math.round(job.organisation_hours * 100)) / 100
  );
}
