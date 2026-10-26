/**
 * Parsing of user-typed numbers in German notation. The result for money is a
 * STRING with exactly two decimals, which is sent to PostgreSQL numeric(12,2)
 * as it is. No floating point arithmetic is involved.
 */

export type AmountResult =
  | { ok: true; value: string; cents: number }
  | { ok: false; reason: "empty" | "invalid" | "zero" | "too_large" };

/**
 * Accepts "49,90", "-1.234,5", "1234.5", "1 000,50", "+5".
 * - A comma means German notation: dots are thousands separators.
 * - Without a comma, "1.234" is read as one thousand two hundred thirty-four,
 *   while "12.5" or "12.50" are read as decimals.
 * - More than two decimals are rejected instead of being silently rounded.
 * - Zero is rejected (a booking of 0 is invalid).
 */
export function parseAmount(input: string): AmountResult {
  const raw = input.replace(/[\s €]/g, "");
  if (raw === "") return { ok: false, reason: "empty" };

  let s = raw;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }

  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!match) return { ok: false, reason: "invalid" };

  const negative = match[1] === "-";
  const intPart = match[2].replace(/^0+(?=\d)/, "");
  const decimals = ((match[3] ?? "") + "00").slice(0, 2);

  if (intPart.length > 10) return { ok: false, reason: "too_large" };
  if (/^0+$/.test(intPart) && decimals === "00") return { ok: false, reason: "zero" };

  const cents = (negative ? -1 : 1) * (Number(intPart) * 100 + Number(decimals));
  return { ok: true, value: `${negative ? "-" : ""}${intPart}.${decimals}`, cents };
}

/** Plain decimal in German notation (no sign handling needed), or null if invalid. */
export function parseDecimalDe(input: string): number | null {
  const raw = input.replace(/[\s ]/g, "");
  if (raw === "") return null;
  const normalised = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** Number to an input string in German notation: 12.5 -> "12,5". */
export function toGermanInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(".", ",");
}
