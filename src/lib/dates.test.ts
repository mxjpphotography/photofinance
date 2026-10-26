import { describe, expect, it } from "vitest";
import { addDays, formatMonthLong, isMonthKey, monthEnd, monthKey, monthStart, todayIso } from "./dates";

describe("todayIso", () => {
  it("uses the local calendar day with zero padding", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("month helpers", () => {
  it("extracts and rebuilds month keys", () => {
    expect(monthKey("2026-10-17")).toBe("2026-10");
    expect(monthStart("2026-10")).toBe("2026-10-01");
  });
  it("finds the last day of a month, including leap years", () => {
    expect(monthEnd("2026-04")).toBe("2026-04-30");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });
  it("validates month keys", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-25", 90)).toBe("2027-01-23");
  });
  it("is not affected by daylight saving time", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("formatMonthLong", () => {
  it("writes the German month name", () => {
    expect(formatMonthLong("2026-10-01")).toBe("Oktober 2026");
    expect(formatMonthLong("2027-03-15")).toBe("März 2027");
  });
});
