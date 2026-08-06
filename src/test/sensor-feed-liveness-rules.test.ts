/**
 * Liveness classification for a silent sensor bridge.
 *
 * The anchor case is the real incident: a live EcoWitt feed stopped on
 * 2026-07-14 and went unnoticed until 2026-07-29, because the 30-minute
 * `STALE_THRESHOLD_MS` renders a two-week outage and a half-hour gap with the
 * same badge and the same sentence.
 */
import { describe, expect, it } from "vitest";

import {
  FEED_OUTAGE_THRESHOLD_MS,
  classifySensorFeedLiveness,
  describeSensorFeedLiveness,
  describeSilentDuration,
} from "@/lib/sensorFeedLivenessRules";
import { STALE_THRESHOLD_MS } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const configured = (latestAcceptedAtIso: string | null, now: Date | number = NOW) =>
  classifySensorFeedLiveness({ latestAcceptedAtIso, hasConfiguredBridge: true, now });

describe("the outage tier is genuinely above the alert window", () => {
  it("is far longer than STALE_THRESHOLD_MS", () => {
    // If these ever converge, this module has stopped adding information and
    // the banner would fire on every routine gap.
    expect(FEED_OUTAGE_THRESHOLD_MS).toBeGreaterThan(STALE_THRESHOLD_MS * 4);
  });

  it("does NOT call a merely-stale feed an outage", () => {
    // 45 minutes: stale for alerting, but the bridge is plainly alive.
    const r = configured(new Date(NOW.getTime() - 45 * 60_000).toISOString());
    expect(r.liveness).toBe("reporting");
    expect(r.isActionable).toBe(false);
    expect(describeSensorFeedLiveness(r)).toBeNull();
  });

  it("does not fire on a router reboot or a host that briefly slept", () => {
    for (const minutes of [31, 60, 120, 300]) {
      const r = configured(new Date(NOW.getTime() - minutes * 60_000).toISOString());
      expect(r.liveness, `${minutes}m`).toBe("reporting");
    }
  });
});

describe("the EcoWitt incident", () => {
  const DIED = "2026-07-14T09:00:00.000Z";

  it("classifies the fifteen-day silence as an outage", () => {
    const r = configured(DIED);
    expect(r.liveness).toBe("outage");
    expect(r.isActionable).toBe(true);
  });

  it("states the magnitude in days, not a bare 'stale'", () => {
    const copy = describeSensorFeedLiveness(configured(DIED));
    expect(copy).toContain("15 days");
    // The whole failure was that a two-week outage read like a routine gap.
    expect(copy).not.toMatch(/\bstale\b/i);
  });

  it("would have fired on day one, not day fifteen", () => {
    const nextMorning = new Date("2026-07-15T07:00:00.000Z");
    expect(configured(DIED, nextMorning).liveness).toBe("outage");
  });

  it("names the consequence and disclaims control", () => {
    const copy = describeSensorFeedLiveness(configured(DIED)) ?? "";
    expect(copy).toMatch(/not arriving|stopped updating/i);
    expect(copy).toMatch(/cannot restart/i);
    // Never diagnose a cause we cannot observe.
    expect(copy).not.toMatch(/wifi|wi-fi|router|power|unplugged|crashed/i);
  });
});

describe("accounts with no bridge are never alarmed", () => {
  it("classifies manual-only growers as not_configured", () => {
    const r = classifySensorFeedLiveness({
      latestAcceptedAtIso: null,
      hasConfiguredBridge: false,
      now: NOW,
    });
    expect(r.liveness).toBe("not_configured");
    expect(r.isActionable).toBe(false);
    expect(describeSensorFeedLiveness(r)).toBeNull();
  });

  it("stays not_configured even with an ancient timestamp present", () => {
    // A stale row must not resurrect a banner for someone with no bridge.
    const r = classifySensorFeedLiveness({
      latestAcceptedAtIso: "2020-01-01T00:00:00.000Z",
      hasConfiguredBridge: false,
      now: NOW,
    });
    expect(r.liveness).toBe("not_configured");
    expect(r.isActionable).toBe(false);
  });

  it("flags a configured bridge that has never delivered", () => {
    const r = configured(null);
    expect(r.liveness).toBe("never_reported");
    expect(r.isActionable).toBe(true);
    expect(describeSensorFeedLiveness(r)).toContain("never delivered");
  });
});

describe("refuses to guess on bad input", () => {
  it("returns unknown for an unparseable timestamp", () => {
    const r = configured("not-a-date");
    expect(r.liveness).toBe("unknown");
    expect(r.isActionable).toBe(false);
    expect(describeSensorFeedLiveness(r)).toBeNull();
  });

  it("returns unknown for a non-finite clock", () => {
    expect(configured("2026-07-14T09:00:00.000Z", Number.NaN).liveness).toBe("unknown");
  });

  it("treats a future timestamp as clock skew, not an outage", () => {
    const future = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    const r = configured(future);
    expect(r.liveness).toBe("reporting");
    expect(r.silentForMs).toBe(0);
  });
});

describe("purity", () => {
  it("is deterministic across calls with a fixed clock", () => {
    const iso = "2026-07-14T09:00:00.000Z";
    expect(configured(iso)).toEqual(configured(iso));
  });

  it("never reads ambient time — result depends only on injected now", () => {
    const iso = new Date(NOW.getTime() - 10 * 60_000).toISOString();
    expect(configured(iso).liveness).toBe("reporting");
    // Same reading, clock advanced a week: same input, different verdict.
    const later = new Date(NOW.getTime() + 7 * 24 * 60 * 60_000);
    expect(configured(iso, later).liveness).toBe("outage");
  });
});

describe("describeSilentDuration", () => {
  it("scales minutes to hours to days", () => {
    expect(describeSilentDuration(5 * 60_000)).toBe("5 minutes");
    expect(describeSilentDuration(60_000)).toBe("1 minute");
    expect(describeSilentDuration(3 * 3_600_000)).toBe("3 hours");
    expect(describeSilentDuration(3_600_000)).toBe("1 hour");
    expect(describeSilentDuration(5 * 24 * 3_600_000)).toBe("5 days");
  });

  it("returns null rather than a bogus duration", () => {
    expect(describeSilentDuration(null)).toBeNull();
    expect(describeSilentDuration(-1)).toBeNull();
    expect(describeSilentDuration(Number.NaN)).toBeNull();
  });
});
