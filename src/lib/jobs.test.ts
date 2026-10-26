import { describe, expect, it } from "vitest";
import { centsToDecimalString, formatHours, jobHours, parseCostCents, parseHours, previewQuote, type QuoteInput } from "./jobs";

const base: QuoteInput = {
  shootingHours: 0,
  editingHours: 0,
  organisationHours: 0,
  travelCents: 0,
  otherCents: 0,
  quotedCents: null,
  hourlyRateCents: 5000,
  taxRate: null,
  reserveRate: null,
};

describe("parseHours", () => {
  it("accepts German and plain decimals, empty counts as zero", () => {
    expect(parseHours("2,5")).toEqual({ ok: true, value: 2.5 });
    expect(parseHours("1.75")).toEqual({ ok: true, value: 1.75 });
    expect(parseHours("")).toEqual({ ok: true, value: 0 });
    expect(parseHours("8")).toEqual({ ok: true, value: 8 });
  });
  it("rejects garbage, negatives, three decimals and too large values", () => {
    expect(parseHours("-1").ok).toBe(false);
    expect(parseHours("abc").ok).toBe(false);
    expect(parseHours("1,234").ok).toBe(false);
    expect(parseHours("10000").ok).toBe(false);
    expect(parseHours("1,2,3").ok).toBe(false);
  });
});

describe("parseCostCents", () => {
  it("returns whole cents", () => {
    expect(parseCostCents("12,50")).toEqual({ ok: true, value: 1250 });
    expect(parseCostCents("1.234,56")).toEqual({ ok: true, value: 123456 });
    expect(parseCostCents("0")).toEqual({ ok: true, value: 0 });
    expect(parseCostCents("")).toEqual({ ok: true, value: 0 });
  });
  it("rejects negative amounts and garbage", () => {
    expect(parseCostCents("-5").ok).toBe(false);
    expect(parseCostCents("zehn").ok).toBe(false);
    expect(parseCostCents("1,234").ok).toBe(false);
  });
});

describe("centsToDecimalString", () => {
  it("always has two decimals", () => {
    expect(centsToDecimalString(0)).toBe("0.00");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(123456)).toBe("1234.56");
    expect(centsToDecimalString(-1999)).toBe("-19.99");
  });
});

describe("previewQuote (mirrors calculate_job_quote)", () => {
  it("matches the database test: 12 h at 50 EUR plus 50 EUR costs", () => {
    // supabase/tests/30_jobs_calendar.sql: price 650.00, profit 600.00, set aside 180.00 at 30 %
    const q = previewQuote({ ...base, shootingHours: 8, editingHours: 3, organisationHours: 1, travelCents: 3000, otherCents: 2000, taxRate: 0.2, reserveRate: 0.1 });
    expect(q?.recommendedCents).toBe(65000);
    expect(q?.priceUsedCents).toBe(65000);
    expect(q?.profitCents).toBe(60000);
    expect(q?.setAsideCents).toBe(18000);
    expect(q?.hourlyEarningCents).toBe(5000);
  });
  it("matches the database test with a quoted price of 1000", () => {
    const q = previewQuote({ ...base, shootingHours: 8, editingHours: 3, organisationHours: 1, travelCents: 3000, otherCents: 2000, quotedCents: 100000, taxRate: 0.2, reserveRate: 0.1 });
    expect(q?.profitCents).toBe(95000);
    expect(q?.hourlyEarningCents).toBe(7917);
    expect(q?.setAsideCents).toBe(28500);
  });
  it("invents nothing without an hourly rate", () => {
    expect(previewQuote({ ...base, hourlyRateCents: null, shootingHours: 5 })).toBeNull();
  });
  it("sets nothing aside when no rates are configured or the profit is negative", () => {
    expect(previewQuote({ ...base, shootingHours: 2 })?.setAsideCents).toBe(0);
    const loss = previewQuote({ ...base, shootingHours: 1, travelCents: 20000, quotedCents: 10000, taxRate: 0.2 });
    expect(loss?.profitCents).toBe(-10000);
    expect(loss?.setAsideCents).toBe(0);
  });
  it("has no hourly earning for a job without hours", () => {
    expect(previewQuote({ ...base, travelCents: 1000 })?.hourlyEarningCents).toBeNull();
  });
  it("does not drift with fractional hours", () => {
    const q = previewQuote({ ...base, shootingHours: 0.1, editingHours: 0.2, hourlyRateCents: 3333 });
    expect(q?.totalHours).toBe(0.3);
    expect(q?.recommendedCents).toBe(1000); // 0.3 h * 33.33 = 9.999 -> 10.00
  });
});

describe("hours helpers", () => {
  it("formats German", () => {
    expect(formatHours(12)).toBe("12");
    expect(formatHours(2.5)).toBe("2,5");
  });
  it("sums stored hours exactly", () => {
    expect(jobHours({ shooting_hours: 0.1, editing_hours: 0.2, organisation_hours: 0 })).toBe(0.3);
  });
});
