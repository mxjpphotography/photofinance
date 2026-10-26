import { describe, expect, it } from "vitest";
import { niceScale } from "./chart";

describe("niceScale", () => {
  it("rounds up to a round axis maximum", () => {
    expect(niceScale(980)).toMatchObject({ max: 1000, step: 250 });
    expect(niceScale(73)).toMatchObject({ max: 80, step: 20 });
    expect(niceScale(1000)).toMatchObject({ max: 1000, step: 250 });
  });
  it("always covers the data", () => {
    for (const value of [0.5, 1, 9.99, 101, 4999, 12345.67, 1e6]) {
      expect(niceScale(value).max).toBeGreaterThanOrEqual(value);
    }
  });
  it("starts at zero and ends at the maximum", () => {
    const { ticks, max } = niceScale(980);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(max);
  });
  it("falls back to a sensible axis without data", () => {
    expect(niceScale(0)).toMatchObject({ max: 100 });
    expect(niceScale(-5)).toMatchObject({ max: 100 });
    expect(niceScale(Number.NaN)).toMatchObject({ max: 100 });
  });
});
