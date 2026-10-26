import { describe, expect, it } from "vitest";
import {
  amountClass,
  formatCents,
  formatDate,
  formatEuro,
  isValidIsoDate,
  localToday,
  parseAmount,
  sumCents,
  toCents,
} from "./money";

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


describe("parseAmount", () => {
  it("accepts German and plain notation", () => {
    expect(parseAmount("12,50")).toBe("12.50");
    expect(parseAmount("-1.234,5")).toBe("-1234.50");
    expect(parseAmount("12.5")).toBe("12.50");
    expect(parseAmount("+7")).toBe("7.00");
    expect(parseAmount(" 5 € ")).toBe("5.00");
    expect(parseAmount("-0,01")).toBe("-0.01");
    expect(parseAmount("007")).toBe("7.00");
  });
  it("treats dots followed by three digits as thousands separators", () => {
    expect(parseAmount("1.234")).toBe("1234.00");
    expect(parseAmount("1.234.567")).toBe("1234567.00");
  });
  it("rejects zero, garbage and more than two decimals", () => {
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("0,00")).toBeNull();
    expect(parseAmount("-0")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1,234")).toBeNull();
    expect(parseAmount("1,2,3")).toBeNull();
    expect(parseAmount("12,5x")).toBeNull();
  });
  it("rejects amounts that do not fit numeric(12,2)", () => {
    expect(parseAmount("12345678901")).toBeNull();
    expect(parseAmount("9999999999,99")).toBe("9999999999.99");
  });
});

describe("cent arithmetic", () => {
  it("adds exactly where floats would drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumCents([0.1, 0.2])).toBe(30);
    expect(sumCents(["19.99", "-19.99"])).toBe(0);
  });
  it("converts and formats", () => {
    expect(toCents("1234.5")).toBe(123450);
    expect(formatCents(-1999).replace(/ /g, " ")).toBe("-19,99 €");
  });
});

describe("dates", () => {
  it("formats local dates without time zone shifts", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("validates calendar dates", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2027-13-01")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});
