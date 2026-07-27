import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  addYears,
  compareDayKeys,
  consecutiveSegments,
  daysInMonth,
  diffDays,
  isDayKey,
  isMonthKey,
  monthKeyOf,
  monthRange,
  parseDayKey,
  todayKey,
  toDayKey,
  weekdayOf,
} from "./day-key.js";

const IST = "Asia/Kolkata"; // +05:30, no DST
const UTC = "UTC";
const NY = "America/New_York"; // DST, negative offset

describe("isDayKey / isMonthKey", () => {
  it("accepts well-formed keys", () => {
    expect(isDayKey("2026-07-26")).toBe(true);
    expect(isMonthKey("2026-07")).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    for (const bad of ["2026-7-26", "26-07-26", "2026-07-26T00:00:00Z", "", "2026-13-01"]) {
      expect(isDayKey(bad)).toBe(false);
    }
    // Shape-valid but not a real calendar day.
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2027-02-29")).toBe(false);
    expect(isDayKey("2028-02-29")).toBe(true); // leap year
  });

  it("rejects non-strings", () => {
    expect(isDayKey(20260726)).toBe(false);
    expect(isDayKey(null)).toBe(false);
    expect(isDayKey(new Date())).toBe(false);
  });
});

describe("toDayKey — the UTC server vs the Asia/Kolkata user", () => {
  it("disagrees with the server once IST has rolled past midnight", () => {
    // 18:30 UTC is exactly 00:00 IST the next day.
    const instant = new Date("2026-07-26T18:30:00.000Z");
    expect(toDayKey(instant, UTC)).toBe("2026-07-26");
    expect(toDayKey(instant, IST)).toBe("2026-07-27");
  });

  it("holds the same day one minute before the IST rollover", () => {
    const instant = new Date("2026-07-26T18:29:59.999Z");
    expect(toDayKey(instant, IST)).toBe("2026-07-26");
    expect(toDayKey(new Date("2026-07-26T18:30:00.000Z"), IST)).toBe("2026-07-27");
  });

  it("crosses a month boundary in the user's zone before the server's", () => {
    const instant = new Date("2026-07-31T19:00:00.000Z");
    expect(toDayKey(instant, UTC)).toBe("2026-07-31");
    expect(toDayKey(instant, IST)).toBe("2026-08-01");
  });

  it("crosses a year boundary in the user's zone before the server's", () => {
    const instant = new Date("2026-12-31T19:00:00.000Z");
    expect(toDayKey(instant, UTC)).toBe("2026-12-31");
    expect(toDayKey(instant, IST)).toBe("2027-01-01");
  });

  it("is still the previous day in a negative-offset zone", () => {
    const instant = new Date("2026-07-27T02:00:00.000Z");
    expect(toDayKey(instant, UTC)).toBe("2026-07-27");
    expect(toDayKey(instant, NY)).toBe("2026-07-26"); // 22:00 EDT
  });

  it("resolves the correct day across a DST transition", () => {
    // 2026-03-08 is the US spring-forward date; 06:59Z is 01:59 EST.
    expect(toDayKey(new Date("2026-03-08T06:59:00.000Z"), NY)).toBe("2026-03-08");
    // 07:00Z becomes 03:00 EDT — same calendar day, hour skipped.
    expect(toDayKey(new Date("2026-03-08T07:00:00.000Z"), NY)).toBe("2026-03-08");
  });

  it("pads single-digit months and days", () => {
    expect(toDayKey(new Date("2026-01-05T12:00:00.000Z"), UTC)).toBe("2026-01-05");
  });

  it("throws on an Invalid Date rather than emitting NaN keys", () => {
    expect(() => toDayKey(new Date("nope"), UTC)).toThrow(TypeError);
  });

  it("todayKey takes an injected instant so callers stay deterministic", () => {
    expect(todayKey(IST, new Date("2026-07-26T18:30:00.000Z"))).toBe("2026-07-27");
  });
});

describe("parseDayKey", () => {
  it("returns a 1-based month, not a Date's 0-based one", () => {
    expect(parseDayKey("2026-07-26")).toEqual({ year: 2026, month: 7, day: 26 });
  });

  it("throws on a non-key", () => {
    expect(() => parseDayKey("2026-07")).toThrow(TypeError);
  });
});

describe("addDays", () => {
  it("moves within a month", () => {
    expect(addDays("2026-07-26", 1)).toBe("2026-07-27");
    expect(addDays("2026-07-26", -1)).toBe("2026-07-25");
    expect(addDays("2026-07-26", 0)).toBe("2026-07-26");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-07-26", 30)).toBe("2026-08-25");
  });

  it("handles leap and non-leap Februaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("is unaffected by DST — the arithmetic is pure UTC", () => {
    // A local-time implementation would return 2026-03-08 twice or skip a day.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("addMonths / addYears", () => {
  it("clamps a 31st into a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("crosses the year in both directions", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("clamps 29 Feb into a non-leap year", () => {
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(addYears("2028-02-29", 4)).toBe("2032-02-29");
    expect(addYears("2026-07-26", 1)).toBe("2027-07-26");
  });
});

describe("diffDays / compareDayKeys", () => {
  it("counts whole days, signed", () => {
    expect(diffDays("2026-07-26", "2026-07-27")).toBe(1);
    expect(diffDays("2026-07-27", "2026-07-26")).toBe(-1);
    expect(diffDays("2026-07-26", "2026-07-26")).toBe(0);
    expect(diffDays("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("counts across a DST transition without dropping an hour", () => {
    expect(diffDays("2026-03-07", "2026-03-09")).toBe(2);
    expect(diffDays("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("orders lexicographically", () => {
    expect(compareDayKeys("2026-07-26", "2026-07-27")).toBe(-1);
    expect(compareDayKeys("2026-07-27", "2026-07-26")).toBe(1);
    expect(compareDayKeys("2026-07-26", "2026-07-26")).toBe(0);
    expect(["2026-12-01", "2026-02-01", "2026-07-01"].sort()).toEqual([
      "2026-02-01",
      "2026-07-01",
      "2026-12-01",
    ]);
  });
});

describe("monthRange / monthKeyOf / daysInMonth", () => {
  it("spans a 31-day month", () => {
    const range = monthRange("2026-07");
    expect(range.start).toBe("2026-07-01");
    expect(range.end).toBe("2026-07-31");
    expect(range.days).toHaveLength(31);
    expect(range.days[0]).toBe("2026-07-01");
    expect(range.days.at(-1)).toBe("2026-07-31");
  });

  it("spans February in both leap and non-leap years", () => {
    expect(monthRange("2026-02").days).toHaveLength(28);
    expect(monthRange("2026-02").end).toBe("2026-02-28");
    expect(monthRange("2028-02").days).toHaveLength(29);
    expect(monthRange("2028-02").end).toBe("2028-02-29");
  });

  it("pads the month in start/end keys", () => {
    expect(monthRange("2026-01").start).toBe("2026-01-01");
    expect(monthRange("2026-09").end).toBe("2026-09-30");
  });

  it("rejects a bad month key", () => {
    expect(() => monthRange("2026-13")).toThrow(TypeError);
    expect(() => monthRange("2026-7")).toThrow(TypeError);
  });

  it("derives the month of a day", () => {
    expect(monthKeyOf("2026-07-26")).toBe("2026-07");
  });

  it("knows month lengths", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("weekdayOf", () => {
  it("returns 0 for Sunday", () => {
    expect(weekdayOf("2026-07-26")).toBe(0); // a Sunday
    expect(weekdayOf("2026-07-27")).toBe(1);
  });
});

describe("consecutiveSegments — gaps must break the chart line", () => {
  it("returns one segment for an unbroken run", () => {
    expect(consecutiveSegments(["2026-07-01", "2026-07-02", "2026-07-03"])).toEqual([
      ["2026-07-01", "2026-07-02", "2026-07-03"],
    ]);
  });

  it("splits at a missing day", () => {
    expect(
      consecutiveSegments(["2026-07-01", "2026-07-02", "2026-07-05", "2026-07-06"]),
    ).toEqual([
      ["2026-07-01", "2026-07-02"],
      ["2026-07-05", "2026-07-06"],
    ]);
  });

  it("keeps an isolated day as its own segment", () => {
    expect(consecutiveSegments(["2026-07-01", "2026-07-04"])).toEqual([
      ["2026-07-01"],
      ["2026-07-04"],
    ]);
  });

  it("splits across a month boundary only when a day is actually missing", () => {
    expect(consecutiveSegments(["2026-07-31", "2026-08-01"])).toEqual([
      ["2026-07-31", "2026-08-01"],
    ]);
    expect(consecutiveSegments(["2026-07-30", "2026-08-01"])).toEqual([
      ["2026-07-30"],
      ["2026-08-01"],
    ]);
  });

  it("handles an empty month", () => {
    expect(consecutiveSegments([])).toEqual([]);
  });
});
