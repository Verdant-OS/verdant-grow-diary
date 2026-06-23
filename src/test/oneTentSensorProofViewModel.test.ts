/**
 * Pure-rule tests for oneTentSensorProofViewModel.
 */
import { describe, it, expect } from "vitest";
import {
  buildOneTentSensorProofViewModel,
  buildOneTentSensorProofReportSection,
} from "@/lib/oneTentSensorProofViewModel";
import type { EcowittLiveProofViewModel } from "@/lib/ecowittLiveProofViewModel";
import type { EcowittIngestAuditProofViewModel } from "@/lib/ecowittIngestAuditProofRules";

const TENT = "tent-1";

function live(
  partial: Partial<EcowittLiveProofViewModel>,
): EcowittLiveProofViewModel {
  return {
    tone: "ok",
    headline: "h",
    detail: "d",
    windowLabel: "last 24 hours",
    acceptedCount: 0,
    rejectedCount: 0,
    totalEcowittInWindow: 0,
    candidateStatus: null,
    isLegacyBridgeSource: false,
    candidateCapturedAt: null,
    candidateMetricLabels: [],
    ...partial,
  };
}

function audit(
  partial: Partial<EcowittIngestAuditProofViewModel>,
): EcowittIngestAuditProofViewModel {
  return {
    status: "loaded",
    tone: "ok",
    headline: "h",
    detail: "d",
    windowLabel: "last 24 hours",
    receivedCount: 0,
    insertedCount: 0,
    rejectedCount: 0,
    lastAcceptedAt: null,
    lastRejectedAt: null,
    hasRejected: false,
    ...partial,
  };
}

describe("buildOneTentSensorProofViewModel", () => {
  it("unavailable when no tent selected", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: null,
      liveProof: null,
      auditProof: null,
    });
    expect(vm.sensorProofStatus).toBe("unavailable");
    expect(vm.proofWindowLabel).toBe("last 24 hours");
    expect(vm.operatorShortcutHref).toBe("/sensors?operator=1");
    expect(vm.reportLines.join("\n")).toMatch(/no tent selected/i);
  });

  it("present when both live and audit proof are loaded", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: "live_confirmed" }),
      auditProof: audit({ status: "loaded", insertedCount: 5 }),
    });
    expect(vm.sensorProofStatus).toBe("present");
    expect(vm.tone).toBe("ok");
    expect(vm.liveRowProofLabel).toMatch(/live row proof confirmed/);
    expect(vm.auditProofLabel).toMatch(/audit proof loaded/);
    expect(vm.limitations.length).toBe(0);
  });

  it("live_only when audit unavailable but live confirmed", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: "live_confirmed" }),
      auditProof: audit({ status: "blocked" }),
    });
    expect(vm.sensorProofStatus).toBe("live_only");
    expect(vm.limitations.map((l) => l.id)).toContain("audit-blocked");
  });

  it("audit_only when audit loaded but no live row", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: null }),
      auditProof: audit({ status: "loaded", insertedCount: 3 }),
    });
    expect(vm.sensorProofStatus).toBe("audit_only");
    expect(vm.limitations.map((l) => l.id)).toContain("live-missing");
  });

  it("stale takes precedence over audit when live is stale", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: "stale" }),
      auditProof: audit({ status: "loaded", insertedCount: 5 }),
    });
    expect(vm.sensorProofStatus).toBe("stale");
    expect(vm.tone).toBe("warn");
    expect(vm.limitations.some((l) => l.id === "live-stale")).toBe(true);
  });

  it("invalid takes precedence even with audit ok", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: "invalid" }),
      auditProof: audit({ status: "loaded", insertedCount: 1 }),
    });
    expect(vm.sensorProofStatus).toBe("invalid");
    expect(vm.tone).toBe("warn");
  });

  it("blocked state surfaces blocked limitation copy", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: null }),
      auditProof: audit({ status: "blocked" }),
    });
    expect(vm.sensorProofStatus).toBe("blocked");
    expect(vm.auditProofLabel).toMatch(/blocked or unavailable/);
    expect(vm.limitations.some((l) => l.id === "audit-blocked")).toBe(true);
  });

  it("missing when neither row nor audit proof exist", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: null }),
      auditProof: audit({ status: "no_audit_rows" }),
    });
    expect(vm.sensorProofStatus).toBe("missing");
    expect(vm.auditProofLabel).toMatch(/No EcoWitt ingest audit rows/);
  });

  it("loading when audit hook is loading", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: "live_confirmed" }),
      auditProof: audit({ status: "loading" }),
    });
    expect(vm.sensorProofStatus).toBe("loading");
  });

  it("rejected audit rows produce warn tone in audit_only path", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: null }),
      auditProof: audit({
        status: "loaded",
        hasRejected: true,
        receivedCount: 10,
        insertedCount: 6,
        rejectedCount: 4,
      }),
    });
    expect(vm.sensorProofStatus).toBe("audit_only");
    expect(vm.tone).toBe("warn");
    expect(vm.auditProofLabel).toMatch(/rejected or omitted rows/);
  });

  it("uses 'current proof window' language and not all-time", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: "live_confirmed" }),
      auditProof: audit({ status: "loaded", insertedCount: 1 }),
    });
    const text = [
      vm.headline,
      vm.liveRowProofLabel,
      vm.auditProofLabel,
      ...vm.reportLines,
    ].join("\n");
    expect(text).toMatch(/current proof window|last 24 hours/);
    expect(text).not.toMatch(/all[- ]time/i);
    expect(text).not.toMatch(/forever/i);
    expect(text).not.toMatch(/complete proof/i);
  });

  it("report lines never contain raw ids or tokens", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: "live_confirmed" }),
      auditProof: audit({ status: "loaded", insertedCount: 1 }),
    });
    const text = vm.reportLines.join("\n");
    expect(text).not.toMatch(/user_id|bridge_token_id|raw_payload|Bearer|PASSKEY|service_role/);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("report markdown section uses 'Sensor proof' heading", () => {
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: live({ candidateStatus: "live_confirmed" }),
      auditProof: audit({ status: "loaded", insertedCount: 1 }),
    });
    const md = buildOneTentSensorProofReportSection(vm);
    expect(md.startsWith("## Sensor proof")).toBe(true);
    expect(md).toMatch(/Row-level:/);
    expect(md).toMatch(/Ingest-audit:/);
  });
});
