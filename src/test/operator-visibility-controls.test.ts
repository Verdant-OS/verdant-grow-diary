import { describe, it, expect } from "vitest";
import {
  AUDIT_URL_DEFAULT_STATE,
  buildOperatorAuditLink,
  hasAuditUrlState,
} from "@/lib/sensorIngestAuditReportQueryParams";
import { buildSensorIngestAuditReportViewModel } from "@/lib/sensorIngestAuditReportViewModel";
import { buildSensorSnapshotDetailsDrawerCsv } from "@/lib/sensorSnapshotDetailsDrawerCsvExport";
import { describeSnapshotDiaryLinkAttempt } from "@/lib/sensorSnapshotDiaryLinkRules";

describe("operator audit links", () => {
  it("builds a shareable operator URL and drops unsafe device search text", () => {
    const current = new URLSearchParams({ operator: "0", audit_q: "old", tab: "sensors" });
    const href = buildOperatorAuditLink({
      origin: "https://verdant.example",
      pathname: "/sensors",
      currentSearchParams: current,
      state: {
        ...AUDIT_URL_DEFAULT_STATE,
        provider: "ecowitt",
        deviceQuery: "x".repeat(65),
        pageSize: 50,
      },
    });
    const url = new URL(href);
    expect(url.searchParams.get("operator")).toBe("1");
    expect(url.searchParams.get("tab")).toBe("sensors");
    expect(url.searchParams.get("audit_provider")).toBe("ecowitt");
    expect(url.searchParams.get("audit_n")).toBe("50");
    expect(url.searchParams.get("audit_q")).toBeNull();
  });

  it("detects existing audit URL state", () => {
    expect(hasAuditUrlState(new URLSearchParams({ audit_n: "10" }))).toBe(true);
    expect(hasAuditUrlState(new URLSearchParams({ operator: "1" }))).toBe(false);
  });
});

describe("operator audit summary", () => {
  it("counts canonical sources and omitted categories for the filtered window", () => {
    const vm = buildSensorIngestAuditReportViewModel({
      now: new Date("2026-06-19T12:10:00Z"),
      pageSize: 10,
      rows: [
        {
          id: "live-1",
          captured_at: "2026-06-19T12:00:00Z",
          source: "live",
          metric: "humidity_pct",
          value: 61,
          raw_payload: { provider: "ecowitt", humidity_pct: 61 },
        },
        {
          id: "manual-1",
          captured_at: "2026-06-19T12:01:00Z",
          source: "manual",
          metric: "vpd_kpa",
          value: 1.2,
          raw_payload: { provider: "manual", vpd_kpa: 1.2 },
        },
      ],
    });

    expect(vm.operatorSummary.acceptedPersistedRows).toBe(2);
    expect(vm.operatorSummary.rejectedVisibleRows).toBe(0);
    expect(vm.operatorSummary.rejectedAttemptsOmitted).toBe(true);
    expect(vm.operatorSummary.rawPayloadsOmittedFromCsv).toBe(2);
    expect(vm.operatorSummary.bySource.live).toBe(1);
    expect(vm.operatorSummary.bySource.manual).toBe(1);
    expect(vm.operatorSummary.bySource.csv).toBe(0);
  });
});

describe("sensor snapshot drawer CSV", () => {
  it("exports supplied filtered rows while omitting raw payload columns", () => {
    const csv = buildSensorSnapshotDetailsDrawerCsv({
      snapshot: {
        snapshotId: "snap-1",
        capturedAt: "2026-06-19T12:00:00Z",
        source: "live",
        provider: "ecowitt",
        transport: "mqtt",
        tentId: "tent-1",
        plantId: "plant-1",
        vpdKpa: 0,
        soilMoisturePct: 34,
        humidityPct: 61,
        airTemperatureC: 24,
        confidence: 0.9,
        staleOrInvalid: false,
      },
      environmentCheckRows: [{ status: "watch", vpd_kpa: 1.2, raw_payload: "hidden" }],
      ingestAuditRows: [{ source: "live", provider: "ecowitt", rawPayload: "hidden" }],
    });

    expect(csv).toContain("environment_check");
    expect(csv).toContain("ingest_audit");
    expect(csv).toContain("soil_moisture_pct");
    expect(csv).not.toContain("raw_payload");
    expect(csv).not.toContain("rawPayload");
    expect(csv).not.toContain("hidden");
  });
});

describe("snapshot diary link attempts", () => {
  it("describes the attempted empty-state match fields without internal IDs", () => {
    const summary = describeSnapshotDiaryLinkAttempt();
    expect(summary.attemptedFields).toEqual(["snapshot_id", "tent/plant", "captured_at"]);
    expect(summary.attemptedFieldsLabel).toContain("snapshot_id");
  });
});
