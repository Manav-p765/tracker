import { describe, expect, it } from "vitest";

import { hitsWindow, localMinutes, parseTimeOfDay } from "./schedule.js";

/**
 * The timezone tests.
 *
 * This project has shipped three UTC-vs-IST bugs already, so these are the highest
 * value tests in the worker: they pin that "is it 21:00 for this user" is answered
 * in the USER's zone and nowhere else. The suite runs with TZ=UTC, so any
 * accidental reliance on the server clock shows up immediately.
 */

const IST = "Asia/Kolkata"; // +05:30, no DST
const UTC = "UTC";
const NY = "America/New_York";

describe("localMinutes", () => {
  it("reads the clock in the given zone, not the server's", () => {
    // 15:30 UTC is 21:00 in Kolkata.
    const instant = new Date("2026-07-27T15:30:00.000Z");
    expect(localMinutes(instant, UTC)).toBe(15 * 60 + 30);
    expect(localMinutes(instant, IST)).toBe(21 * 60);
  });

  it("handles a negative offset", () => {
    const instant = new Date("2026-07-27T02:00:00.000Z");
    expect(localMinutes(instant, NY)).toBe(22 * 60); // 22:00 the previous day
  });
});

describe("parseTimeOfDay", () => {
  it("converts HH:mm to minutes", () => {
    expect(parseTimeOfDay("00:00")).toBe(0);
    expect(parseTimeOfDay("09:00")).toBe(540);
    expect(parseTimeOfDay("21:00")).toBe(1260);
    expect(parseTimeOfDay("23:59")).toBe(1439);
  });
});

describe("hitsWindow — the 21:00 IST reminder", () => {
  const REMINDER = "21:00";
  const WINDOW = 15;

  it("FIRES when it is 21:00 for the user", () => {
    // 15:30 UTC === 21:00 IST.
    const hit = hitsWindow(new Date("2026-07-27T15:30:00.000Z"), IST, REMINDER, WINDOW);
    expect(hit).not.toBeNull();
    expect(hit?.day).toBe("2026-07-27");
    expect(hit?.minutesLate).toBe(0);
  });

  it("does NOT fire at 21:00 UTC — the bug this whole module exists to prevent", () => {
    // 21:00 UTC is 02:30 the NEXT day in Kolkata. Nothing should fire.
    const hit = hitsWindow(new Date("2026-07-27T21:00:00.000Z"), IST, REMINDER, WINDOW);
    expect(hit).toBeNull();
  });

  it("fires for a UTC user at 21:00 UTC, and not at 21:00 IST", () => {
    // The mirror image, so the test cannot pass by ignoring the zone entirely.
    expect(hitsWindow(new Date("2026-07-27T21:00:00.000Z"), UTC, REMINDER, WINDOW)).not.toBeNull();
    expect(hitsWindow(new Date("2026-07-27T15:30:00.000Z"), UTC, REMINDER, WINDOW)).toBeNull();
  });

  it("covers the whole window and stops at its edge", () => {
    // 21:00 → 21:14 fire; 21:15 does not.
    expect(hitsWindow(new Date("2026-07-27T15:30:00.000Z"), IST, REMINDER, WINDOW)).not.toBeNull();
    expect(hitsWindow(new Date("2026-07-27T15:44:00.000Z"), IST, REMINDER, WINDOW)).not.toBeNull();
    expect(hitsWindow(new Date("2026-07-27T15:45:00.000Z"), IST, REMINDER, WINDOW)).toBeNull();
  });

  it("does not fire before the reminder time", () => {
    expect(hitsWindow(new Date("2026-07-27T15:29:00.000Z"), IST, REMINDER, WINDOW)).toBeNull();
  });

  it("reports how late in the window the scan landed", () => {
    const hit = hitsWindow(new Date("2026-07-27T15:37:00.000Z"), IST, REMINDER, WINDOW);
    expect(hit?.minutesLate).toBe(7);
  });
});

describe("hitsWindow — midnight wrap", () => {
  /**
   * A 23:58 reminder evaluated by the 00:01 scan is still YESTERDAY's reminder.
   * If the day rolled over here the jobId would change and the user would be
   * notified twice for one reminder.
   */
  it("attributes a post-midnight scan to the previous day", () => {
    // 18:31 UTC === 00:01 IST on the 28th.
    const hit = hitsWindow(new Date("2026-07-27T18:31:00.000Z"), IST, "23:58", 15);
    expect(hit).not.toBeNull();
    expect(hit?.day).toBe("2026-07-27");
    expect(hit?.minutesLate).toBe(3);
  });

  it("attributes a pre-midnight scan to the same day", () => {
    // 18:28 UTC === 23:58 IST on the 27th.
    const hit = hitsWindow(new Date("2026-07-27T18:28:00.000Z"), IST, "23:58", 15);
    expect(hit?.day).toBe("2026-07-27");
    expect(hit?.minutesLate).toBe(0);
  });

  it("gives both sides of midnight the SAME day, so the jobId is stable", () => {
    const before = hitsWindow(new Date("2026-07-27T18:28:00.000Z"), IST, "23:58", 15);
    const after = hitsWindow(new Date("2026-07-27T18:31:00.000Z"), IST, "23:58", 15);
    expect(before?.day).toBe(after?.day);
  });

  it("handles a 00:00 reminder without wrapping to yesterday", () => {
    // 18:30 UTC === 00:00 IST on the 28th.
    const hit = hitsWindow(new Date("2026-07-27T18:30:00.000Z"), IST, "00:00", 15);
    expect(hit?.day).toBe("2026-07-28");
    expect(hit?.minutesLate).toBe(0);
  });
});

describe("hitsWindow — DST", () => {
  it("tracks the wall clock across a spring-forward, not the offset", () => {
    // 2026-03-08 is US spring-forward. 13:00 UTC is 09:00 EDT (was 08:00 EST).
    expect(hitsWindow(new Date("2026-03-08T13:00:00.000Z"), NY, "09:00", 15)).not.toBeNull();
    // The day before, 09:00 EST is 14:00 UTC.
    expect(hitsWindow(new Date("2026-03-07T14:00:00.000Z"), NY, "09:00", 15)).not.toBeNull();
    // And 14:00 UTC on the 8th is 10:00 EDT — outside the window.
    expect(hitsWindow(new Date("2026-03-08T14:00:00.000Z"), NY, "09:00", 15)).toBeNull();
  });
});
