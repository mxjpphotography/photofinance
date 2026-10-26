import { describe, expect, it } from "vitest";
import { parseQuantity, validPeriod } from "./equipment";

describe("parseQuantity", () => {
  it("accepts whole numbers in range", () => {
    expect(parseQuantity("1")).toEqual({ ok: true, value: 1 });
    expect(parseQuantity(" 12 ")).toEqual({ ok: true, value: 12 });
    expect(parseQuantity("1000")).toEqual({ ok: true, value: 1000 });
  });
  it("rejects zero, decimals, negatives, text and too large values", () => {
    for (const bad of ["0", "1,5", "-2", "abc", "", "1001"]) expect(parseQuantity(bad).ok).toBe(false);
  });
  it("respects a lower maximum", () => {
    expect(parseQuantity("3", 2).ok).toBe(false);
    expect(parseQuantity("2", 2).ok).toBe(true);
  });
});

describe("validPeriod", () => {
  it("allows one-day and longer periods", () => {
    expect(validPeriod("2026-10-26", "2026-10-26")).toBe(true);
    expect(validPeriod("2026-10-26", "2026-10-30")).toBe(true);
  });
  it("rejects reversed or incomplete periods", () => {
    expect(validPeriod("2026-10-30", "2026-10-26")).toBe(false);
    expect(validPeriod("", "2026-10-26")).toBe(false);
  });
});
