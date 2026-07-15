/**
 * buildAiDoctorReadinessDiaryEntry — pure builder unit coverage.
 *
 * This is the write-path contract the timeline readiness badge consumes:
 * details.kind discriminator, snapshot freshness graded at check time
 * with the shared 48h window (inclusive at the cutoff), floored age
 * minutes, honest missing states, and identity handling.
 */
import { describe, it, expect } from "vitest";
import {
  AI_DOCTOR_READINESS_CHECK_KIND,
  buildAiDoctorReadinessDiaryEntry,
} from "@/lib/aiDoctorReadinessDiaryEntryRules";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");

function build(
  overrides: Partial<Parameters<typeof buildAiDoctorReadinessDiaryEntry>[0]> = {},
) {
  return buildAiDoctorReadinessDiaryEntry({
    readiness: "partial",
    latestSnapshotAtIso: null,
    growId: "g1",
    now: NOW,
    ...overrides,
  });
}

describe("identity handling", () => {
  it("fails with missing_grow_id for blank/whitespace/absent growId", () => {
    for (const growId of ["", "   ", null, undefined]) {
      const res = build({ growId });
      expect(res).toEqual({ ok: false, reason: "missing_grow_id" });
    }
  });

  it("passes plant/tent ids through, normalizing blank to null", () => {
    const res = build({ plantId: "p1", tentId: "  " });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.grow_id).toBe("g1");
    expect(res.draft.plant_id).toBe("p1");
    expect(res.draft.tent_id).toBeNull();
  });
});

describe("details shape (the badge contract)", () => {
  it("stamps the exported kind discriminator and checked_at from injected now", () => {
    const res = build();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(AI_DOCTOR_READINESS_CHECK_KIND).toBe("ai_doctor_readiness_check");
    expect(res.draft.details.kind).toBe(AI_DOCTOR_READINESS_CHECK_KIND);
    expect(res.draft.details.checked_at).toBe(new Date(NOW).toISOString());
  });

  it("allowed is false only for insufficient readiness", () => {
    for (const [readiness, allowed] of [
      ["strong", true],
      ["partial", true],
      ["insufficient", false],
    ] as const) {
      const res = build({ readiness });
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.draft.details.readiness).toBe(readiness);
      expect(res.draft.details.allowed).toBe(allowed);
    }
  });

  it("passes blocking codes through verbatim (default empty)", () => {
    const withCodes = build({
      readiness: "insufficient",
      blockingCodes: ["recent-timeline-activity", "recent-manual-sensor-snapshot"],
    });
    expect(withCodes.ok).toBe(true);
    if (withCodes.ok) {
      expect(withCodes.draft.details.blocking_codes).toEqual([
        "recent-timeline-activity",
        "recent-manual-sensor-snapshot",
      ]);
    }
    const without = build();
    if (without.ok) expect(without.draft.details.blocking_codes).toEqual([]);
  });
});

describe("snapshot freshness graded at check time (shared 48h window)", () => {
  it("a snapshot EXACTLY 48h old is fresh (inclusive cutoff)", () => {
    const atCutoff = new Date(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS).toISOString();
    const res = build({ latestSnapshotAtIso: atCutoff });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.details.snapshot_freshness).toBe("fresh");
    expect(res.draft.details.snapshot_at).toBe(atCutoff);
    expect(res.draft.details.snapshot_age_minutes).toBe(
      AI_DOCTOR_SNAPSHOT_FRESH_MS / 60_000,
    );
  });

  it("one minute past the cutoff is stale, and the note says so", () => {
    const pastCutoff = new Date(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS - 60_000).toISOString();
    const res = build({ latestSnapshotAtIso: pastCutoff });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.details.snapshot_freshness).toBe("stale");
    expect(res.draft.note).toContain("Snapshot: Stale");
  });

  it("floors the age to whole minutes", () => {
    const res = build({
      latestSnapshotAtIso: new Date(NOW - (3 * 60_000 + 59_000)).toISOString(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.details.snapshot_age_minutes).toBe(3);
  });

  it("missing or unparseable snapshot ISO records the honest missing state", () => {
    for (const iso of [null, "not-a-timestamp"]) {
      const res = build({ latestSnapshotAtIso: iso });
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.draft.details.snapshot_freshness).toBe("missing");
      expect(res.draft.details.snapshot_age_minutes).toBeNull();
      expect(res.draft.note).toContain("Snapshot: No snapshot");
    }
  });
});

describe("note copy per readiness", () => {
  it("names the readiness verdict without claiming a diagnosis", () => {
    const strong = build({
      readiness: "strong",
      latestSnapshotAtIso: new Date(NOW - 3 * 3_600_000).toISOString(),
    });
    if (strong.ok) {
      expect(strong.draft.note).toBe(
        "AI Doctor readiness: allowed (strong context). Snapshot: Fresh · 3h ago.",
      );
    }
    const partial = build();
    if (partial.ok) expect(partial.draft.note).toMatch(/allowed with limited confidence/);
    const insufficient = build({ readiness: "insufficient" });
    if (insufficient.ok) expect(insufficient.draft.note).toMatch(/blocked \(insufficient context\)/);
  });
});
