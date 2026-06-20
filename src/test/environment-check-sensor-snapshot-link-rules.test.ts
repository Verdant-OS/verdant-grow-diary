import { describe, it, expect } from "vitest";
import {
  linkEnvironmentCheckToSnapshot,
  SNAPSHOT_LINK_TOLERANCE_MS,
} from "@/lib/environmentCheckSensorSnapshotLinkRules";

describe("environmentCheckSensorSnapshotLinkRules", () => {
  it("matches by exact snapshot ID when present", () => {
    const r = linkEnvironmentCheckToSnapshot({
      entry: { id: "e1", tentId: "t", sensorSnapshotId: "snap-1", capturedAt: "2026-06-19T12:00:00Z" },
      snapshots: [
        { id: "snap-1", tentId: "t", capturedAt: "2026-06-19T12:00:00Z", vpdKpa: 1.1, source: "live", provider: "ecowitt", transport: "mqtt" },
      ],
    });
    expect(r.matchKind).toBe("exact_id");
    expect(r.snapshotId).toBe("snap-1");
    expect(r.href).toContain("tent=t");
    expect(r.vpdKpa).toBe(1.1);
  });

  it("matches by tent + captured_at within tolerance when no ID", () => {
    const r = linkEnvironmentCheckToSnapshot({
      entry: { id: "e", tentId: "t", capturedAt: "2026-06-19T12:00:00Z" },
      snapshots: [
        { id: "s", tentId: "t", capturedAt: "2026-06-19T12:00:30Z", source: "live", provider: "ecowitt", transport: "mqtt", vpdKpa: 1.0 },
      ],
    });
    expect(r.matchKind).toBe("deterministic_keys");
    expect(r.snapshotId).toBe("s");
  });

  it("does not link when ambiguous (multiple candidates)", () => {
    const r = linkEnvironmentCheckToSnapshot({
      entry: { id: "e", tentId: "t", capturedAt: "2026-06-19T12:00:00Z" },
      snapshots: [
        { id: "a", tentId: "t", capturedAt: "2026-06-19T12:00:10Z" },
        { id: "b", tentId: "t", capturedAt: "2026-06-19T12:00:20Z" },
      ],
    });
    expect(r.matchKind).toBe("none");
    expect(r.reason).toMatch(/ambiguous/i);
    expect(r.snapshotId).toBeNull();
  });

  it("does not link when no candidate within tolerance", () => {
    const r = linkEnvironmentCheckToSnapshot({
      entry: { id: "e", tentId: "t", capturedAt: "2026-06-19T12:00:00Z" },
      snapshots: [{ id: "x", tentId: "t", capturedAt: "2026-06-19T11:00:00Z" }],
    });
    expect(r.matchKind).toBe("none");
    expect(r.href).toBeNull();
  });

  it("vpd is never 0 — coerces 0 to null", () => {
    const r = linkEnvironmentCheckToSnapshot({
      entry: { id: "e", tentId: "t", sensorSnapshotId: "s" },
      snapshots: [{ id: "s", tentId: "t", capturedAt: "2026-06-19T12:00:00Z", vpdKpa: 0 }],
    });
    expect(r.vpdKpa).toBeNull();
  });

  it("uses default tolerance window", () => {
    expect(SNAPSHOT_LINK_TOLERANCE_MS).toBe(60_000);
  });

  it("propagates stale/invalid flag — never marked healthy", () => {
    const r = linkEnvironmentCheckToSnapshot({
      entry: { id: "e", tentId: "t", sensorSnapshotId: "s" },
      snapshots: [{ id: "s", tentId: "t", capturedAt: "2026-06-19T12:00:00Z", isStaleOrInvalid: true }],
    });
    expect(r.staleOrInvalid).toBe(true);
  });
});
