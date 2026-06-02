/**
 * Timeline severity adapter — preserves contract status/severity and
 * never flattens unsafe/unknown sensor state into a generic
 * healthy/available surface.
 */
import { describe, it, expect } from "vitest";
import { adaptSnapshotClassificationToTimelineSeverity } from "@/lib/sensorSnapshotTimelineSeverityAdapter";
import { classifyAuditRow } from "@/lib/sensorSnapshotStatusContract";

const NOW = new Date("2026-05-23T12:00:00Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

describe("adaptSnapshotClassificationToTimelineSeverity", () => {
  it("usable → severity=ok, tone=ok, isHealthy=true", () => {
    const c = classifyAuditRow(
      { rowsReceived: 5, rowsAccepted: 5, capturedAt: minutesAgo(5) },
      { now: NOW },
    );
    const s = adaptSnapshotClassificationToTimelineSeverity(c);
    expect(s.status).toBe("usable");
    expect(s.severity).toBe("ok");
    expect(s.tone).toBe("ok");
    expect(s.isHealthy).toBe(true);
    expect(s.isUnsafe).toBe(false);
    expect(s.isCautionary).toBe(false);
  });

  it("stale preserves cautionary tone — never flattened to ok", () => {
    const c = classifyAuditRow(
      { rowsReceived: 5, rowsAccepted: 5, capturedAt: hoursAgo(48) },
      { now: NOW },
    );
    const s = adaptSnapshotClassificationToTimelineSeverity(c);
    expect(s.status).toBe("stale");
    expect(s.tone).toBe("caution");
    expect(s.isCautionary).toBe(true);
    expect(s.isHealthy).toBe(false);
    expect(s.severity).not.toBe("ok");
  });

  it("invalid preserves danger tone — never flattened to ok", () => {
    const c = classifyAuditRow(
      { rowsReceived: 5, rowsAccepted: 5, capturedAt: minutesAgo(1) },
      { now: NOW, validity: { isValid: false } },
    );
    const s = adaptSnapshotClassificationToTimelineSeverity(c);
    expect(s.status).toBe("invalid");
    expect(s.tone).toBe("danger");
    expect(s.severity).toBe("danger");
    expect(s.isUnsafe).toBe(true);
    expect(s.isHealthy).toBe(false);
  });

  it("needs_review preserves review tone — never flattened to ok", () => {
    const c = classifyAuditRow(
      { rowsReceived: 5, rowsAccepted: 0, capturedAt: minutesAgo(1) },
      { now: NOW },
    );
    const s = adaptSnapshotClassificationToTimelineSeverity(c);
    expect(s.status).toBe("needs_review");
    expect(s.tone).toBe("review");
    expect(s.isUnsafe).toBe(true);
    expect(s.isHealthy).toBe(false);
    expect(s.severity).not.toBe("ok");
  });

  it("no_data and null → empty tone, isMissing", () => {
    const c = classifyAuditRow(
      { rowsReceived: 0, rowsAccepted: 0 },
      { now: NOW },
    );
    const a = adaptSnapshotClassificationToTimelineSeverity(c);
    expect(a.status).toBe("no_data");
    expect(a.tone).toBe("empty");
    expect(a.isMissing).toBe(true);
    expect(a.isHealthy).toBe(false);

    const b = adaptSnapshotClassificationToTimelineSeverity(null);
    expect(b.status).toBe("no_data");
    expect(b.tone).toBe("empty");
    expect(b.isMissing).toBe(true);
  });

  it("guarantees no unsafe/unknown classification maps to isHealthy=true", () => {
    const classifications = [
      classifyAuditRow(
        { rowsReceived: 5, rowsAccepted: 5, capturedAt: hoursAgo(48) },
        { now: NOW },
      ),
      classifyAuditRow(
        { rowsReceived: 5, rowsAccepted: 5, capturedAt: minutesAgo(1) },
        { now: NOW, validity: { isValid: false } },
      ),
      classifyAuditRow(
        { rowsReceived: 5, rowsAccepted: 0, capturedAt: minutesAgo(1) },
        { now: NOW },
      ),
      classifyAuditRow(
        { rowsReceived: 0, rowsAccepted: 0 },
        { now: NOW },
      ),
    ];
    for (const c of classifications) {
      const s = adaptSnapshotClassificationToTimelineSeverity(c);
      expect(s.isHealthy).toBe(false);
      expect(s.severity).not.toBe("ok");
      expect(s.tone).not.toBe("ok");
    }
  });
});
