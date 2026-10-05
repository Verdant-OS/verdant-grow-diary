/**
 * #1001 — Action Queue evidence is trustworthy only when it matches a stored
 * sensor row the grower can read (RLS), for the action's tent, with the same
 * source and captured timestamp. Anything else is unverified context and
 * never renders as healthy/live.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_VERIFIED_EVIDENCE_REFS,
  sensorEvidenceRefIdsToRead,
  unverifiedEvidenceCaution,
  verifyActionEvidenceRefs,
  type EvidenceSensorRow,
} from "@/lib/actionEvidenceVerificationRules";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";

const TENT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENT = "22222222-2222-4222-8222-222222222222";
const ROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AT = "2026-09-30T12:00:00.000Z";

function ref(over: Partial<OriginatingTimelineEventRef> = {}): OriginatingTimelineEventRef {
  return { id: ROW_ID, type: "sensor_snapshot", occurred_at: AT, source: "live", ...over };
}
function row(over: Partial<EvidenceSensorRow> = {}): EvidenceSensorRow {
  return { id: ROW_ID, tent_id: TENT, source: "live", quality: "ok", captured_at: AT, ...over };
}
function verifyOne(r: OriginatingTimelineEventRef, rows: EvidenceSensorRow[], tent = TENT) {
  return verifyActionEvidenceRefs({
    refs: [r],
    actionTentId: tent,
    read: { status: "ok", rows },
  }).get(r.id);
}

describe("verifyActionEvidenceRefs — fail closed", () => {
  it("fabricated id + source live (no stored row) is unverified, never live", () => {
    const v = verifyOne(ref(), []);
    expect(v).toEqual({ status: "unverified", reason: "not_found", displaySource: "unknown" });
  });

  it("another user's row is invisible under RLS, so it reads as not found", () => {
    // RLS returns no row for a reading owned by someone else.
    expect(verifyOne(ref({ id: ROW_ID_2 }), [row()])?.reason).toBe("not_found");
  });

  it("a row from a different tent fails closed", () => {
    expect(verifyOne(ref(), [row({ tent_id: OTHER_TENT })])?.reason).toBe("wrong_tent");
  });

  it("an action with no tent cannot bind sensor evidence", () => {
    expect(verifyOne(ref(), [row()], null as unknown as string)?.reason).toBe("no_tent_scope");
  });

  it("a captured_at that differs from the stored row is rejected", () => {
    const v = verifyOne(ref({ occurred_at: "2026-09-30T12:05:00.000Z" }), [row()]);
    expect(v?.status).toBe("unverified");
    expect(v?.reason).toBe("timestamp_mismatch");
  });

  it("the same instant in another ISO form still matches", () => {
    expect(verifyOne(ref({ occurred_at: "2026-09-30T12:00:00+00:00" }), [row()])?.status).toBe(
      "verified",
    );
  });

  it("a ref claiming live over a stored manual row is a source mismatch", () => {
    expect(verifyOne(ref({ source: "live" }), [row({ source: "manual" })])?.reason).toBe(
      "source_mismatch",
    );
  });

  it("a non-UUID id is never queried and stays unverified", () => {
    const r = ref({ id: "fake-id" });
    expect(sensorEvidenceRefIdsToRead([r])).toEqual([]);
    expect(verifyOne(r, [])?.reason).toBe("invalid_id");
  });

  it("pending and failed reads are unverified, never live", () => {
    for (const read of [{ status: "pending" as const }, { status: "error" as const }]) {
      const v = verifyActionEvidenceRefs({ refs: [ref()], actionTentId: TENT, read }).get(ROW_ID);
      expect(v?.status).toBe("unverified");
      expect(v?.displaySource).toBe("unknown");
      expect(v?.reason).toBe(read.status === "pending" ? "not_checked" : "read_failed");
    }
  });

  it("a non-sensor ref that claims live cannot be verified as live", () => {
    const v = verifyOne(ref({ id: "diary-1", type: "diary_entry", source: "live" }), []);
    expect(v).toEqual({
      status: "unverified",
      reason: "live_not_verifiable",
      displaySource: "unknown",
    });
  });

  it("non-sensor manual/csv refs are left to the existing presenter", () => {
    const map = verifyActionEvidenceRefs({
      refs: [ref({ id: "diary-1", type: "diary_entry", source: "manual" })],
      actionTentId: TENT,
      read: { status: "ok", rows: [] },
    });
    expect(map.has("diary-1")).toBe(false);
  });
});

describe("verifyActionEvidenceRefs — persisted provenance wins", () => {
  it("matching live row with quality ok verifies as Live", () => {
    expect(verifyOne(ref(), [row()])).toEqual({
      status: "verified",
      reason: "verified",
      displaySource: "live",
    });
  });

  it("pi_bridge rows normalize canonically to live", () => {
    expect(
      verifyOne(ref({ source: "unknown" }), [row({ source: "pi_bridge" })])?.displaySource,
    ).toBe("live");
  });

  it("stored stale / invalid quality never renders healthy", () => {
    expect(verifyOne(ref({ source: "unknown" }), [row({ quality: "stale" })])?.displaySource).toBe(
      "stale",
    );
    expect(
      verifyOne(ref({ source: "unknown" }), [row({ quality: "invalid" })])?.displaySource,
    ).toBe("invalid");
  });

  it("degraded live is not shown as live", () => {
    const v = verifyOne(ref({ source: "unknown" }), [row({ quality: "degraded" })]);
    expect(v?.displaySource).toBe("unknown");
  });

  it("degraded or missing quality is never trusted, for manual and csv too", () => {
    for (const source of ["manual", "csv", "live"]) {
      expect(
        verifyOne(ref({ source: "unknown" }), [row({ source, quality: "degraded" })])
          ?.displaySource,
      ).toBe("unknown");
    }
    expect(
      verifyOne(ref({ source: "unknown" }), [row({ source: "manual", quality: null })])
        ?.displaySource,
    ).toBe("unknown");
    expect(
      verifyOne(ref({ source: "manual" }), [row({ source: "manual", quality: "ok" })])
        ?.displaySource,
    ).toBe("manual");
  });

  it("demo / sim rows verify but stay demo", () => {
    expect(verifyOne(ref({ source: "demo" }), [row({ source: "sim" })])?.displaySource).toBe(
      "demo",
    );
  });

  it("unrecognized vendor tokens are unknown, not live", () => {
    expect(verifyOne(ref({ source: "unknown" }), [row({ source: "ecowitt" })])?.displaySource).toBe(
      "unknown",
    );
  });

  it("mixed-source metrics keep separate provenance per row", () => {
    const map = verifyActionEvidenceRefs({
      refs: [ref(), ref({ id: ROW_ID_2, source: "manual" })],
      actionTentId: TENT,
      read: { status: "ok", rows: [row(), row({ id: ROW_ID_2, source: "manual" })] },
    });
    expect(map.get(ROW_ID)?.displaySource).toBe("live");
    expect(map.get(ROW_ID_2)?.displaySource).toBe("manual");
  });

  it("is deterministic", () => {
    const input = {
      refs: [ref()],
      actionTentId: TENT,
      read: { status: "ok" as const, rows: [row()] },
    };
    expect([...verifyActionEvidenceRefs(input)]).toEqual([...verifyActionEvidenceRefs(input)]);
  });
});

describe("sensorEvidenceRefIdsToRead", () => {
  it("returns sorted unique UUID ids of sensor refs only, capped", () => {
    const ids = Array.from(
      { length: MAX_VERIFIED_EVIDENCE_REFS + 5 },
      (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    const refs = [
      ...ids.map((id) => ref({ id })),
      ref({ id: ids[0] }),
      ref({ id: "diary-1", type: "diary_entry" }),
    ];
    const out = sensorEvidenceRefIdsToRead(refs);
    expect(out).toHaveLength(MAX_VERIFIED_EVIDENCE_REFS);
    expect(out).toEqual([...out].sort());
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("unverifiedEvidenceCaution copy (DP P2-3)", () => {
  it("never claims a reading doesn't exist: it may be hidden by the Free window or past the cap", () => {
    const copy = unverifiedEvidenceCaution("not_found");
    expect(copy).toMatch(/couldn't be matched to a stored sensor reading you can see/);
    expect(copy).not.toMatch(/doesn't match/);
    expect(copy).toMatch(/Review before approving/);
  });
});
