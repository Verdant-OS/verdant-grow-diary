/**
 * Pure-rule tests for ecowittIngestAuditProofRules.
 */
import { describe, it, expect } from "vitest";
import {
  buildEcowittIngestAuditProof,
  ECOWITT_AUDIT_PROOF_WINDOW_MS,
  ECOWITT_AUDIT_PROOF_WINDOW_LABEL,
  type EcowittIngestAuditProofRow,
} from "@/lib/ecowittIngestAuditProofRules";

const TENT = "tent-1";
const NOW = new Date("2025-01-15T12:00:00Z");

function row(
  partial: Partial<EcowittIngestAuditProofRow>,
): EcowittIngestAuditProofRow {
  return {
    source: "ecowitt",
    tent_id: TENT,
    rows_received: 0,
    rows_inserted: 0,
    captured_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    ...partial,
  };
}

describe("buildEcowittIngestAuditProof", () => {
  it("returns unavailable when tentId missing", () => {
    const vm = buildEcowittIngestAuditProof([], {
      status: "loaded",
      tentId: null,
      now: NOW,
    });
    expect(vm.status).toBe("unavailable");
    expect(vm.detail).toMatch(/unavailable with current read permissions/);
    expect(vm.windowLabel).toBe(ECOWITT_AUDIT_PROOF_WINDOW_LABEL);
  });

  it("returns blocked copy when status is blocked", () => {
    const vm = buildEcowittIngestAuditProof(null, {
      status: "blocked",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.status).toBe("blocked");
    expect(vm.headline).toMatch(/unavailable/);
    expect(vm.receivedCount).toBe(0);
  });

  it("returns loading copy when status is loading", () => {
    const vm = buildEcowittIngestAuditProof(null, {
      status: "loading",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.status).toBe("loading");
    expect(vm.tone).toBe("neutral");
  });

  it("returns no_audit_rows when filtered rows are empty", () => {
    const vm = buildEcowittIngestAuditProof([], {
      status: "loaded",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.status).toBe("no_audit_rows");
    expect(vm.detail).toMatch(/No EcoWitt ingest audit rows/);
  });

  it("sums received/inserted/rejected for in-window EcoWitt rows", () => {
    const rows: EcowittIngestAuditProofRow[] = [
      row({ rows_received: 10, rows_inserted: 10, created_at: "2025-01-15T11:00:00Z" }),
      row({ rows_received: 8, rows_inserted: 5, created_at: "2025-01-15T10:00:00Z" }),
      row({ rows_received: 4, rows_inserted: 4, created_at: "2025-01-15T09:00:00Z" }),
    ];
    const vm = buildEcowittIngestAuditProof(rows, {
      status: "loaded",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.status).toBe("loaded");
    expect(vm.receivedCount).toBe(22);
    expect(vm.insertedCount).toBe(19);
    expect(vm.rejectedCount).toBe(3);
    expect(vm.hasRejected).toBe(true);
    expect(vm.tone).toBe("warn");
    expect(vm.lastAcceptedAt).toBe("2025-01-15T11:00:00Z");
    expect(vm.lastRejectedAt).toBe("2025-01-15T10:00:00Z");
  });

  it("ignores rows outside the proof window", () => {
    const oldIso = new Date(
      NOW.getTime() - ECOWITT_AUDIT_PROOF_WINDOW_MS - 60_000,
    ).toISOString();
    const rows = [
      row({ rows_received: 99, rows_inserted: 99, created_at: oldIso }),
      row({ rows_received: 2, rows_inserted: 2, created_at: NOW.toISOString() }),
    ];
    const vm = buildEcowittIngestAuditProof(rows, {
      status: "loaded",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.receivedCount).toBe(2);
    expect(vm.insertedCount).toBe(2);
  });

  it("ignores non-ecowitt source rows", () => {
    const rows = [
      row({ source: "mqtt", rows_received: 50, rows_inserted: 50 }),
      row({ rows_received: 1, rows_inserted: 1 }),
    ];
    const vm = buildEcowittIngestAuditProof(rows, {
      status: "loaded",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.receivedCount).toBe(1);
  });

  it("scopes to current tent only", () => {
    const rows = [
      row({ tent_id: "other", rows_received: 50, rows_inserted: 50 }),
      row({ rows_received: 1, rows_inserted: 1 }),
    ];
    const vm = buildEcowittIngestAuditProof(rows, {
      status: "loaded",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.receivedCount).toBe(1);
  });

  it("ok tone when all accepted, no rejects", () => {
    const rows = [row({ rows_received: 5, rows_inserted: 5 })];
    const vm = buildEcowittIngestAuditProof(rows, {
      status: "loaded",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.tone).toBe("ok");
    expect(vm.detail).toMatch(/current proof window/);
    expect(vm.headline).toMatch(/loaded/);
  });

  it("handles malformed input safely", () => {
    const rows = [
      // @ts-expect-error intentional bad shape
      null,
      // @ts-expect-error intentional bad shape
      { source: "ecowitt", tent_id: TENT, rows_received: "x", rows_inserted: -3, created_at: "bad" },
      row({ rows_received: 2, rows_inserted: 1 }),
    ];
    const vm = buildEcowittIngestAuditProof(rows, {
      status: "loaded",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.receivedCount).toBe(2);
    expect(vm.insertedCount).toBe(1);
    expect(vm.rejectedCount).toBe(1);
  });

  it("uses 'last 24 hours' proof window copy", () => {
    const vm = buildEcowittIngestAuditProof([], {
      status: "loaded",
      tentId: TENT,
      now: NOW,
    });
    expect(vm.windowLabel).toBe("last 24 hours");
  });
});
