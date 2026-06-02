/**
 * Sensor Snapshot Status Contract v1 — pure contract tests (Step 1).
 *
 * Covers only the new canonical API:
 *   classifyAuditRow, resolveStaleWindowMs, countsAsHealthyEvidence,
 *   DEFAULT_STALE_WINDOW_MS, PER_SOURCE_STALE_WINDOW_MS.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyAuditRow,
  countsAsHealthyEvidence,
  DEFAULT_STALE_WINDOW_MS,
  PER_SOURCE_STALE_WINDOW_MS,
  resolveStaleWindowMs,
  type AuditRowLike,
  type SnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";

const NOW = new Date("2026-05-23T12:00:00Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

afterEach(() => {
  // Tests may temporarily set per-source overrides; always clean up.
  for (const k of Object.keys(PER_SOURCE_STALE_WINDOW_MS)) {
    delete PER_SOURCE_STALE_WINDOW_MS[k];
  }
});

describe("classifyAuditRow", () => {
  it("fresh accepted (5/5, recent ts) → usable + fresh_accepted", () => {
    const row: AuditRowLike = {
      rowsReceived: 5,
      rowsAccepted: 5,
      capturedAt: minutesAgo(10),
    };
    const c = classifyAuditRow(row, { now: NOW });
    expect(c.status).toBe("usable");
    expect(c.reason).toBe("fresh_accepted");
    expect(c.isHealthyEvidence).toBe(true);
    expect(c.label).toBe("Latest bridge reading accepted.");
  });

  it("old accepted (5/5, ts past window) → stale + outside_stale_window", () => {
    const row: AuditRowLike = {
      rowsReceived: 5,
      rowsAccepted: 5,
      capturedAt: hoursAgo(48),
    };
    const c = classifyAuditRow(row, { now: NOW });
    expect(c.status).toBe("stale");
    expect(c.reason).toBe("outside_stale_window");
    expect(c.isHealthyEvidence).toBe(false);
  });

  it("validity.isValid === false → invalid (uses validity.reason or malformed_reading)", () => {
    const row: AuditRowLike = {
      rowsReceived: 5,
      rowsAccepted: 5,
      capturedAt: minutesAgo(1),
    };
    const c1 = classifyAuditRow(row, {
      now: NOW,
      validity: { isValid: false, reason: "out_of_range" },
    });
    expect(c1.status).toBe("invalid");
    expect(c1.reason).toBe("out_of_range");
    expect(c1.isHealthyEvidence).toBe(false);

    const c2 = classifyAuditRow(row, {
      now: NOW,
      validity: { isValid: false },
    });
    expect(c2.status).toBe("invalid");
    expect(c2.reason).toBe("malformed_reading");
  });

  it("null/missing row → no_data + no_rows", () => {
    const c1 = classifyAuditRow(null, { now: NOW });
    const c2 = classifyAuditRow(undefined, { now: NOW });
    for (const c of [c1, c2]) {
      expect(c.status).toBe("no_data");
      expect(c.reason).toBe("no_rows");
      expect(c.isHealthyEvidence).toBe(false);
    }
  });

  it("0/0 → no_data + no_rows (counts-first precedence)", () => {
    const row: AuditRowLike = {
      rowsReceived: 0,
      rowsAccepted: 0,
      capturedAt: minutesAgo(1),
    };
    const c = classifyAuditRow(row, { now: NOW });
    expect(c.status).toBe("no_data");
    expect(c.reason).toBe("no_rows");
    expect(c.isHealthyEvidence).toBe(false);
  });

  it("5/0 → needs_review + none_inserted + exact label", () => {
    const row: AuditRowLike = {
      rowsReceived: 5,
      rowsAccepted: 0,
      capturedAt: minutesAgo(1),
    };
    const c = classifyAuditRow(row, { now: NOW });
    expect(c.status).toBe("needs_review");
    expect(c.reason).toBe("none_inserted");
    expect(c.label).toBe("Latest bridge reading needs review.");
    expect(c.isHealthyEvidence).toBe(false);
  });

  it("5/3 → needs_review + partial_accept (derived from received - accepted)", () => {
    const row: AuditRowLike = {
      rowsReceived: 5,
      rowsAccepted: 3,
      capturedAt: minutesAgo(1),
    };
    const c = classifyAuditRow(row, { now: NOW });
    expect(c.status).toBe("needs_review");
    expect(c.reason).toBe("partial_accept");
  });

  it("status and reason are separate fields (different values, both present)", () => {
    const row: AuditRowLike = {
      rowsReceived: 5,
      rowsAccepted: 0,
      capturedAt: minutesAgo(1),
    };
    const c = classifyAuditRow(row, { now: NOW });
    expect(c.status).toBeDefined();
    expect(c.reason).toBeDefined();
    expect(c.status).not.toBe(c.reason);
    // Reason codes are not status variants.
    const statuses: SnapshotStatus[] = [
      "usable",
      "stale",
      "invalid",
      "needs_review",
      "no_data",
    ];
    expect(statuses).not.toContain(
      c.reason as unknown as SnapshotStatus,
    );
  });
});

describe("resolveStaleWindowMs", () => {
  it("resolveStaleWindowMs(undefined) === DEFAULT_STALE_WINDOW_MS", () => {
    expect(resolveStaleWindowMs(undefined)).toBe(DEFAULT_STALE_WINDOW_MS);
    expect(resolveStaleWindowMs(null)).toBe(DEFAULT_STALE_WINDOW_MS);
    expect(DEFAULT_STALE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("per-source override resolves to the override value; removing it falls back to default", () => {
    PER_SOURCE_STALE_WINDOW_MS.ecowitt = 60 * 60 * 1000;
    expect(resolveStaleWindowMs("ecowitt")).toBe(60 * 60 * 1000);

    // Classifier honors the override.
    const row: AuditRowLike = {
      rowsReceived: 1,
      rowsAccepted: 1,
      capturedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      source: "ecowitt",
    };
    expect(classifyAuditRow(row, { now: NOW }).status).toBe("stale");

    delete PER_SOURCE_STALE_WINDOW_MS.ecowitt;
    expect(resolveStaleWindowMs("ecowitt")).toBe(DEFAULT_STALE_WINDOW_MS);
  });
});

describe("countsAsHealthyEvidence", () => {
  it("true for usable, false for stale/invalid/needs_review/no_data", () => {
    expect(countsAsHealthyEvidence("usable")).toBe(true);
    for (const s of [
      "stale",
      "invalid",
      "needs_review",
      "no_data",
    ] as SnapshotStatus[]) {
      expect(countsAsHealthyEvidence(s)).toBe(false);
    }
    // Also works against a full Classification.
    const usable = classifyAuditRow(
      { rowsReceived: 1, rowsAccepted: 1, capturedAt: minutesAgo(1) },
      { now: NOW },
    );
    expect(countsAsHealthyEvidence(usable)).toBe(true);
    expect(countsAsHealthyEvidence(null)).toBe(false);
    expect(countsAsHealthyEvidence(undefined)).toBe(false);
  });
});
