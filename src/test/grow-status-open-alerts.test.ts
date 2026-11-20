/**
 * Friction item 2: the Grow status card said "Good" with open alerts on the
 * same page, and "recent diary activity" beside "No recent check-in."
 */
import { describe, expect, it } from "vitest";
import { deriveStatus, GROW_STATUS_DIARY_FRESH_HOURS } from "@/lib/growStatus";
import { NO_RECENT_LOG_STALE_AFTER_HOURS } from "@/constants/sensorTiming";

const NOW = new Date("2026-11-19T12:00:00Z").getTime();
const HOUR = 3600000;
const fresh = new Date(NOW - 2 * HOUR).toISOString();

describe("deriveStatus with open alerts", () => {
  it("an open critical alert needs review", () => {
    const r = deriveStatus({
      pending: 0,
      highestRisk: "none",
      lastDiaryAt: fresh,
      now: NOW,
      alertsOpen: 2,
      alertsCritical: 1,
    });
    expect(r).toEqual({ level: "needs_review", reason: "1 open critical alert" });
  });

  it("any other open alert is Watch, never Good", () => {
    const r = deriveStatus({
      pending: 0,
      highestRisk: "none",
      lastDiaryAt: fresh,
      now: NOW,
      alertsOpen: 2,
      alertsCritical: 0,
    });
    expect(r).toEqual({ level: "watch", reason: "2 open alerts" });
  });

  it("unavailable alert counts keep the legacy result", () => {
    const r = deriveStatus({
      pending: 0,
      highestRisk: "none",
      lastDiaryAt: fresh,
      now: NOW,
      alertsOpen: "unavailable",
      alertsCritical: "unavailable",
    });
    expect(r.level).toBe("good");
  });

  it("high pending risk still outranks alert counts", () => {
    const r = deriveStatus({
      pending: 1,
      highestRisk: "high",
      lastDiaryAt: fresh,
      now: NOW,
      alertsOpen: 1,
      alertsCritical: 1,
    });
    expect(r.reason).toBe("Pending action at high risk needs review");
  });
});

describe("deriveStatus freshness matches the check-in prompt", () => {
  it("uses the same window as 'No recent check-in.'", () => {
    expect(GROW_STATUS_DIARY_FRESH_HOURS).toBe(NO_RECENT_LOG_STALE_AFTER_HOURS);
  });

  it("an entry older than the window is Watch", () => {
    const r = deriveStatus({
      pending: 0,
      highestRisk: "none",
      lastDiaryAt: new Date(NOW - (NO_RECENT_LOG_STALE_AFTER_HOURS + 8) * HOUR).toISOString(),
      now: NOW,
      alertsOpen: 0,
      alertsCritical: 0,
    });
    expect(r.level).toBe("watch");
    expect(r.reason).toBe("Last diary entry 3 days ago");
  });

  it("an entry inside the window with nothing open is Good", () => {
    const r = deriveStatus({
      pending: 0,
      highestRisk: "none",
      lastDiaryAt: new Date(NOW - (NO_RECENT_LOG_STALE_AFTER_HOURS - 1) * HOUR).toISOString(),
      now: NOW,
      alertsOpen: 0,
      alertsCritical: 0,
    });
    expect(r.level).toBe("good");
  });
});
