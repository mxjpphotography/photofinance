import { describe, expect, it } from "vitest";
import { amountClass, formatDate, formatEuro } from "./money";

// Intl output uses a non-breaking space before the euro sign.
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatEuro", () => {
  it("formats with German separators and the euro sign", () => {
    expect(norm(formatEuro(1234.5))).toBe("1.234,50 €");
    expect(norm(formatEuro("-19.99"))).toBe("-19,99 €");
  });
  it("shows zero without a minus sign", () => {
    expect(norm(formatEuro(-0))).toBe("0,00 €");
  });
  it("falls back for invalid input", () => {
    expect(formatEuro("abc")).toBe("–");
  });
});

describe("amountClass", () => {
  it("is green for positive, red for negative and neutral for zero", () => {
    expect(amountClass(5)).toBe("text-income");
    expect(amountClass("-0.01")).toBe("text-expense");
    expect(amountClass(0)).toBe("text-neutral-600");
  });
});

describe("formatDate", () => {
  it("uses the German date format", () => {
    expect(formatDate("2026-03-09")).toBe("09.03.2026");
  });
  it("does not shift the day across time zones", () => {
    expect(formatDate("2026-01-01")).toBe("01.01.2026");
  });
  it("returns unknown input unchanged", () => {
    expect(formatDate("heute")).toBe("heute");
  });
});
