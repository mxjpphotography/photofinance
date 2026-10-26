import { describe, expect, it } from "vitest";
import { actionsFor, groupByRequest, maxUnits, validRequestPeriod } from "./rentals";

const item = { status: "pending" as const, owner_id: "o", requester_id: "r" };

describe("actionsFor", () => {
  it("lets the owner decide and the requester withdraw a pending item", () => {
    expect(actionsFor(item, "o")).toEqual(["accept", "decline"]);
    expect(actionsFor(item, "r")).toEqual(["cancel"]);
  });
  it("lets both sides cancel an accepted item", () => {
    expect(actionsFor({ ...item, status: "accepted" }, "o")).toEqual(["cancel"]);
    expect(actionsFor({ ...item, status: "accepted" }, "r")).toEqual(["cancel"]);
  });
  it("offers nothing for finished items or strangers", () => {
    expect(actionsFor({ ...item, status: "declined" }, "o")).toEqual([]);
    expect(actionsFor({ ...item, status: "cancelled" }, "r")).toEqual([]);
    expect(actionsFor(item, "x")).toEqual([]);
  });
});

describe("validRequestPeriod", () => {
  it("accepts today and later", () => {
    expect(validRequestPeriod("2026-10-26", "2026-10-26", "2026-10-26")).toBe(true);
    expect(validRequestPeriod("2026-11-01", "2026-11-05", "2026-10-26")).toBe(true);
  });
  it("rejects the past, reversed periods and more than a year", () => {
    expect(validRequestPeriod("2026-10-25", "2026-10-26", "2026-10-26")).toBe(false);
    expect(validRequestPeriod("2026-11-05", "2026-11-01", "2026-10-26")).toBe(false);
    expect(validRequestPeriod("2026-10-26", "2027-10-27", "2026-10-26")).toBe(false);
    expect(validRequestPeriod("2026-10-26", "2027-10-26", "2026-10-26")).toBe(true);
    expect(validRequestPeriod("", "", "2026-10-26")).toBe(false);
  });
});

describe("groupByRequest", () => {
  it("keeps items together, newest request first", () => {
    const groups = groupByRequest([
      { id: "1", request_id: "a", created_at: "2026-10-01T10:00:00Z" },
      { id: "2", request_id: "b", created_at: "2026-10-02T10:00:00Z" },
      { id: "3", request_id: "a", created_at: "2026-10-01T10:00:00Z" },
    ]);
    expect(groups.map((g) => g.map((i) => i.id))).toEqual([["2"], ["1", "3"]]);
  });
});

describe("maxUnits", () => {
  it("uses free units for a period and the stock without one", () => {
    expect(maxUnits({ quantity: 5, available_units: 2 }, true)).toBe(2);
    expect(maxUnits({ quantity: 5, available_units: 2 }, false)).toBe(5);
    expect(maxUnits({ quantity: 5, available_units: 0 }, true)).toBe(1);
  });
});
