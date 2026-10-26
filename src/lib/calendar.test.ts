import { describe, expect, it } from "vitest";
import { countPerDay, coversDay, entriesOnDay, monthGrid, shiftMonth, shortTime, weekdayIndex, type CalendarEntry } from "./calendar";

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  id: "x",
  kind: "appointment",
  title: "Termin",
  start_date: "2026-10-10",
  end_date: "2026-10-10",
  start_time: null,
  end_time: null,
  location: null,
  notes: null,
  job_id: null,
  equipment_id: null,
  ...over,
});

describe("weekdayIndex", () => {
  it("starts the week on Monday", () => {
    expect(weekdayIndex("2026-10-26")).toBe(0); // Monday
    expect(weekdayIndex("2026-10-25")).toBe(6); // Sunday
  });
});

describe("monthGrid", () => {
  it("returns full Monday-first weeks that contain the whole month", () => {
    const weeks = monthGrid("2026-10"); // 1 Oct 2026 is a Thursday
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks[0][3]).toBe("2026-10-01");
    expect(weeks.at(-1)?.[6]).toBe("2026-11-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat()).toContain("2026-10-31");
  });
  it("needs only four rows for a February that starts on Monday", () => {
    expect(monthGrid("2027-02")).toHaveLength(4); // 1 Feb 2027 is a Monday, 28 days
  });
  it("handles leap years", () => {
    expect(monthGrid("2028-02").flat()).toContain("2028-02-29");
  });
});

describe("shiftMonth", () => {
  it("crosses year boundaries in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
    expect(shiftMonth("2026-10", 14)).toBe("2027-12");
  });
});

describe("entriesOnDay", () => {
  it("covers every day of a multi-day entry, inclusive", () => {
    const e = entry({ start_date: "2026-10-10", end_date: "2026-10-12" });
    expect(coversDay(e, "2026-10-09")).toBe(false);
    expect(coversDay(e, "2026-10-10")).toBe(true);
    expect(coversDay(e, "2026-10-11")).toBe(true);
    expect(coversDay(e, "2026-10-12")).toBe(true);
    expect(coversDay(e, "2026-10-13")).toBe(false);
  });
  it("sorts timed entries by time before all-day entries", () => {
    const list = [
      entry({ id: "a", title: "Ganztags" }),
      entry({ id: "b", title: "Spät", start_time: "18:00:00" }),
      entry({ id: "c", title: "Früh", start_time: "09:30:00" }),
    ];
    expect(entriesOnDay(list, "2026-10-10").map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
  it("does not mutate its input", () => {
    const list = [entry({ id: "a" }), entry({ id: "b", start_time: "08:00:00" })];
    entriesOnDay(list, "2026-10-10");
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("countPerDay", () => {
  it("counts overlapping entries and leaves empty days out", () => {
    const list = [entry({ start_date: "2026-10-10", end_date: "2026-10-11" }), entry({ id: "y", start_date: "2026-10-11", end_date: "2026-10-11" })];
    const counts = countPerDay(list, ["2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(counts.get("2026-10-09")).toBeUndefined();
    expect(counts.get("2026-10-10")).toBe(1);
    expect(counts.get("2026-10-11")).toBe(2);
  });
});

describe("shortTime", () => {
  it("cuts seconds", () => {
    expect(shortTime("14:30:00")).toBe("14:30");
    expect(shortTime(null)).toBe("");
  });
});
