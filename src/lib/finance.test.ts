import { describe, expect, it } from "vitest";
import { centsToEuro, describeInterval, sumCents, toCents } from "./finance";

describe("cent arithmetic", () => {
  it("avoids floating point drift", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(centsToEuro(sumCents([0.1, 0.2]))).toBe(0.3);
  });
  it("sums many small amounts exactly", () => {
    const hundredTimes = Array.from({ length: 100 }, () => 0.1);
    expect(sumCents(hundredTimes)).toBe(1000);
  });
  it("handles negative amounts", () => {
    expect(sumCents([19.99, -19.99])).toBe(0);
    expect(sumCents([-0.05, 0.1, 0.2])).toBe(25);
  });
  it("converts a single amount", () => {
    expect(toCents(1234.56)).toBe(123456);
    expect(toCents(-0.07)).toBe(-7);
  });
  it("sums an empty list to zero", () => {
    expect(sumCents([])).toBe(0);
  });
});

describe("describeInterval", () => {
  it("uses singular wording for every interval of one", () => {
    expect(describeInterval(1, "week")).toBe("Jede Woche");
    expect(describeInterval(1, "month")).toBe("Jeden Monat");
    expect(describeInterval(1, "year")).toBe("Jedes Jahr");
  });
  it("uses plural wording otherwise", () => {
    expect(describeInterval(2, "week")).toBe("Alle 2 Wochen");
    expect(describeInterval(3, "month")).toBe("Alle 3 Monate");
    expect(describeInterval(5, "year")).toBe("Alle 5 Jahre");
  });
});
