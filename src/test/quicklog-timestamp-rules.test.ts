/**
 * quickLogTimestampRules — pure coverage for the dual-timestamp model:
 * blocking validation, the single freeze point (#317 retry discipline),
 * timezone/DST-safe conversion, and read-side observation-time resolution.
 */
import { describe, it, expect } from "vitest";
import {
  validateOccurredAtInput,
  validateLoggedAtInput,
  buildQuickLogSubmissionTimestamps,
  seedLoggedAtIso,
  resolveDiaryEntryObservationTime,
  QUICK_LOG_FUTURE_SKEW_MS,
} from "@/lib/quickLogTimestampRules";

const NOW = Date.parse("2026-07-24T12:00:00.000Z");

describe("validateOccurredAtInput (blocking gate)", () => {
  it("passes blank / missing (optional field = 'now')", () => {
    expect(validateOccurredAtInput("", NOW).ok).toBe(true);
    expect(validateOccurredAtInput("   ", NOW).ok).toBe(true);
    expect(validateOccurredAtInput(null, NOW).ok).toBe(true);
    expect(validateOccurredAtInput(undefined, NOW).ok).toBe(true);
  });

  it("BLOCKS an unparseable typed value — never silently reinterpreted", () => {
    const v = validateOccurredAtInput("yesterday-ish", NOW);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/valid date/i);
  });

  it("BLOCKS a future value beyond clock skew, allows within skew", () => {
    const future = new Date(NOW + QUICK_LOG_FUTURE_SKEW_MS + 60_000).toISOString();
    expect(validateOccurredAtInput(future, NOW).ok).toBe(false);
    expect(validateOccurredAtInput(future, NOW).error).toMatch(/future/i);
    const withinSkew = new Date(NOW + 60_000).toISOString();
    expect(validateOccurredAtInput(withinSkew, NOW).ok).toBe(true);
  });

  it("accepts a past datetime-local style value", () => {
    expect(validateOccurredAtInput("2026-07-20T09:30", NOW).ok).toBe(true);
  });

  it("validateLoggedAtInput applies the same rules", () => {
    expect(validateLoggedAtInput("", NOW).ok).toBe(true);
    expect(validateLoggedAtInput("garbage", NOW).ok).toBe(false);
  });
});

describe("buildQuickLogSubmissionTimestamps (the #317 freeze point)", () => {
  it("blank inputs → loggedAt = freeze time, occurredAt = null (server stamps now)", () => {
    const t = buildQuickLogSubmissionTimestamps({ now: NOW });
    expect(t.loggedAtIso).toBe(new Date(NOW).toISOString());
    expect(t.occurredAtIso).toBeNull();
  });

  it("is deterministic for a fixed input — retries reusing the object cannot drift", () => {
    const a = buildQuickLogSubmissionTimestamps({
      loggedAtRaw: "2026-07-24T08:00:00.000Z",
      occurredAtRaw: "2026-07-23T21:15",
      now: NOW,
    });
    const b = buildQuickLogSubmissionTimestamps({
      loggedAtRaw: "2026-07-24T08:00:00.000Z",
      occurredAtRaw: "2026-07-23T21:15",
      now: NOW,
    });
    expect(a).toEqual(b);
  });

  it("converts a tz-naive datetime-local value via the local clock (never appends Z)", () => {
    // "2026-07-23T21:15" is local wall-clock. Whatever the runner's zone, the
    // ONLY faithful conversion is new Date(v).toISOString() — assert exactly that.
    const t = buildQuickLogSubmissionTimestamps({
      occurredAtRaw: "2026-07-23T21:15",
      now: NOW,
    });
    expect(t.occurredAtIso).toBe(new Date("2026-07-23T21:15").toISOString());
  });

  it("normalizes across a DST transition without shifting the moment", () => {
    // 2026-03-08 02:30 local does not exist in US zones (spring-forward) and
    // 2026-11-01 01:30 is ambiguous (fall-back). The contract: whatever
    // JS Date resolves locally is preserved EXACTLY through the freeze —
    // freeze(v) must equal the platform's own Date(v).toISOString(), with no
    // additional offset math layered on top.
    for (const raw of ["2026-03-08T02:30", "2026-11-01T01:30"]) {
      const t = buildQuickLogSubmissionTimestamps({ occurredAtRaw: raw, now: NOW });
      expect(t.occurredAtIso).toBe(new Date(raw).toISOString());
      // Round-trip stability: freezing the resolved ISO again is identity.
      const t2 = buildQuickLogSubmissionTimestamps({
        occurredAtRaw: t.occurredAtIso as string,
        now: NOW,
      });
      expect(t2.occurredAtIso).toBe(t.occurredAtIso);
    }
  });

  it("defensive floor: unparseable values degrade to safe defaults, never throw", () => {
    const t = buildQuickLogSubmissionTimestamps({
      loggedAtRaw: "garbage",
      occurredAtRaw: "also-garbage",
      now: NOW,
    });
    expect(t.loggedAtIso).toBe(new Date(NOW).toISOString());
    expect(t.occurredAtIso).toBeNull();
  });

  it("seedLoggedAtIso emits the open-time ISO used by Fast Add entry points", () => {
    expect(seedLoggedAtIso(NOW)).toBe(new Date(NOW).toISOString());
  });
});

describe("resolveDiaryEntryObservationTime (report/calendar grouping key)", () => {
  it("prefers details.logged_at when present and parseable", () => {
    expect(
      resolveDiaryEntryObservationTime({
        entry_at: "2026-07-24T10:00:00.000Z",
        details: { logged_at: "2026-07-23T22:00:00.000Z" },
      }),
    ).toBe("2026-07-23T22:00:00.000Z");
  });

  it("falls back to entry_at then occurred_at when logged_at is absent or junk", () => {
    expect(
      resolveDiaryEntryObservationTime({
        entry_at: "2026-07-24T10:00:00.000Z",
        details: { logged_at: "not-a-date" },
      }),
    ).toBe("2026-07-24T10:00:00.000Z");
    expect(
      resolveDiaryEntryObservationTime({
        occurred_at: "2026-07-22T08:00:00.000Z",
        details: {},
      }),
    ).toBe("2026-07-22T08:00:00.000Z");
  });

  it("never invents: null row / no timestamps / non-object details → null", () => {
    expect(resolveDiaryEntryObservationTime(null)).toBeNull();
    expect(resolveDiaryEntryObservationTime({})).toBeNull();
    expect(resolveDiaryEntryObservationTime({ details: "garbage" })).toBeNull();
    expect(resolveDiaryEntryObservationTime({ details: ["logged_at"] })).toBeNull();
  });

  it("does NOT read sensor provenance: sensor_snapshot.captured_at is never the answer", () => {
    expect(
      resolveDiaryEntryObservationTime({
        entry_at: "2026-07-24T10:00:00.000Z",
        details: { sensor_snapshot: { captured_at: "2026-07-01T00:00:00.000Z" } },
      }),
    ).toBe("2026-07-24T10:00:00.000Z");
  });
});
