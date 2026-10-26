import { describe, expect, it } from "vitest";
import { parseAmount, parseDecimalDe, toGermanInput } from "./amount";

const ok = (input: string) => {
  const r = parseAmount(input);
  if (!r.ok) throw new Error(`expected ok for "${input}", got ${r.reason}`);
  return r;
};

describe("parseAmount", () => {
  it("reads German decimals", () => {
    expect(ok("19,99").value).toBe("19.99");
    expect(ok("-49,9").value).toBe("-49.90");
    expect(ok("1.234,56").value).toBe("1234.56");
    expect(ok("-1.234,5").value).toBe("-1234.50");
  });
  it("reads decimal dots and thousands dots without a comma", () => {
    expect(ok("1234.5").value).toBe("1234.50");
    expect(ok("12.5").value).toBe("12.50");
    expect(ok("1.234").value).toBe("1234.00");
    expect(ok("12.345.678").value).toBe("12345678.00");
  });
  it("ignores spaces, the euro sign and a plus sign", () => {
    expect(ok("1 000,50 €").value).toBe("1000.50");
    expect(ok("+5").value).toBe("5.00");
  });
  it("returns exact cents without floating point error", () => {
    expect(ok("0,10").cents).toBe(10);
    expect(ok("-0,07").cents).toBe(-7);
    expect(ok("19,99").cents).toBe(1999);
    expect(ok("9999999999,99").cents).toBe(999999999999);
  });
  it("strips leading zeros", () => {
    expect(ok("007,5").value).toBe("7.50");
    expect(ok("0,5").value).toBe("0.50");
  });
  it("rejects empty input", () => {
    expect(parseAmount("")).toEqual({ ok: false, reason: "empty" });
    expect(parseAmount("  ")).toEqual({ ok: false, reason: "empty" });
  });
  it("rejects zero in every spelling", () => {
    for (const z of ["0", "0,00", "-0", "-0,00", "0.0", "000"]) {
      expect(parseAmount(z)).toEqual({ ok: false, reason: "zero" });
    }
  });
  it("rejects more than two decimals instead of rounding", () => {
    expect(parseAmount("1,234")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmount("1.2345")).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects text and malformed numbers", () => {
    for (const bad of ["abc", "1,2,3", "--5", "5-", "1e5", "NaN", "12,5x"]) {
      expect(parseAmount(bad)).toEqual({ ok: false, reason: "invalid" });
    }
  });
  it("rejects amounts that do not fit numeric(12,2)", () => {
    expect(parseAmount("99999999999")).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("parseDecimalDe", () => {
  it("reads plain decimals", () => {
    expect(parseDecimalDe("12,5")).toBe(12.5);
    expect(parseDecimalDe("100")).toBe(100);
    expect(parseDecimalDe("1.234,5")).toBe(1234.5);
    expect(parseDecimalDe("0")).toBe(0);
  });
  it("returns null for empty or invalid input", () => {
    expect(parseDecimalDe("")).toBeNull();
    expect(parseDecimalDe("-5")).toBeNull();
    expect(parseDecimalDe("abc")).toBeNull();
  });
});

describe("toGermanInput", () => {
  it("formats numbers for input fields", () => {
    expect(toGermanInput(12.5)).toBe("12,5");
    expect(toGermanInput(-50.25)).toBe("-50,25");
    expect(toGermanInput(1000)).toBe("1000");
    expect(toGermanInput(null)).toBe("");
  });
});
