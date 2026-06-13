/**
 * sensor-history-import-audit-wiring — unit tests for the audit builders
 * and static safety scans for TentCsvImportCard wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildRegistryCsvAuditInput,
  buildVerdantGeneticsXlsxAuditInput,
} from "@/lib/sensorHistoryImportAuditEventBuilders";
import type { VerdantGeneticsXlsxInsertRowsResult } from "@/lib/verdantGeneticsXlsxInsertRowsAdapter";
import type { VerdantGeneticsXlsxPreviewViewModel } from "@/lib/verdantGeneticsXlsxPreviewViewModel";
import type { AdapterResult as RegistryAdapterResult } from "@/lib/registryCsvInsertRowsAdapter";

function makeXlsxResult(
  overrides: Partial<VerdantGeneticsXlsxInsertRowsResult> = {},
): VerdantGeneticsXlsxInsertRowsResult {
  return {
    rows: [],
    acceptedRowCount: 10,
    rejectedRowCount: 2,
    rejectionReasons: {},
    blocked: false,
    ...overrides,
  } as VerdantGeneticsXlsxInsertRowsResult;
}

function makeXlsxVm(
  overrides: Partial<VerdantGeneticsXlsxPreviewViewModel> = {},
): VerdantGeneticsXlsxPreviewViewModel {
  return {
    detectedGroups: ["Veg Tent", "Flower Tent"],
    dateRange: { start: "2026-05-01", end: "2026-05-31" },
  } as unknown as VerdantGeneticsXlsxPreviewViewModel & typeof overrides;
}

function makeRegistryResult(
  overrides: Partial<RegistryAdapterResult> = {},
): RegistryAdapterResult {
  return {
    rows: [
      { captured_at: "2026-05-10T00:00:00.000Z" },
      { captured_at: "2026-05-15T12:00:00.000Z" },
    ] as never,
    acceptedRowCount: 2,
    rejectedRowCount: 1,
    rejectionReasons: {},
    blocked: false,
    blockedReason: null,
    ...overrides,
  } as RegistryAdapterResult;
}

describe("buildVerdantGeneticsXlsxAuditInput", () => {
  it("builds an audit input on successful save", () => {
    const input = buildVerdantGeneticsXlsxAuditInput({
      previewVm: makeXlsxVm(),
      adapterResult: makeXlsxResult({ acceptedRowCount: 120 }),
      tentIdBySensorGroup: { "Veg Tent": "t-1", "Flower Tent": "t-2" },
      tentOptions: [
        { id: "t-1", name: "Tent A" },
        { id: "t-2", name: "Tent B" },
      ],
    });
    expect(input).not.toBeNull();
    expect(input!.sourceAppId).toBe("verdant_genetics_xlsx");
    expect(input!.fileType).toBe("xlsx");
    expect(input!.acceptedRowCount).toBe(120);
    expect(input!.rejectedRowCount).toBe(2);
    expect(input!.dateRange).toEqual({ start: "2026-05-01", end: "2026-05-31" });
    expect(input!.mappedTentLabels).toEqual(["Tent A", "Tent B"]);
    expect(input!.mappedSensorGroups).toEqual(["Veg Tent", "Flower Tent"]);
  });

  it("returns null when adapter is blocked", () => {
    const input = buildVerdantGeneticsXlsxAuditInput({
      previewVm: makeXlsxVm(),
      adapterResult: makeXlsxResult({
        blocked: true,
        blockedReason: "missing_tent_mapping",
        acceptedRowCount: 0,
      }),
      tentIdBySensorGroup: {},
      tentOptions: [],
    });
    expect(input).toBeNull();
  });

  it("returns null when no rows were accepted", () => {
    const input = buildVerdantGeneticsXlsxAuditInput({
      previewVm: makeXlsxVm(),
      adapterResult: makeXlsxResult({ acceptedRowCount: 0 }),
      tentIdBySensorGroup: {},
      tentOptions: [],
    });
    expect(input).toBeNull();
  });
});

describe("buildRegistryCsvAuditInput", () => {
  it("builds an audit input for Spider Farmer", () => {
    const input = buildRegistryCsvAuditInput({
      sourceAppId: "spider_farmer",
      adapterResult: makeRegistryResult(),
      tentId: "t-1",
      tentOptions: [{ id: "t-1", name: "Tent A" }],
    });
    expect(input).not.toBeNull();
    expect(input!.sourceAppId).toBe("spider_farmer");
    expect(input!.fileType).toBe("csv");
    expect(input!.acceptedRowCount).toBe(2);
    expect(input!.rejectedRowCount).toBe(1);
    expect(input!.dateRange).toEqual({ start: "2026-05-10", end: "2026-05-15" });
    expect(input!.mappedTentLabels).toEqual(["Tent A"]);
    expect(input!.mappedSensorGroups).toEqual([]);
  });

  it("builds an audit input for Vivosun", () => {
    const input = buildRegistryCsvAuditInput({
      sourceAppId: "vivosun",
      adapterResult: makeRegistryResult(),
      tentId: "t-1",
      tentOptions: [{ id: "t-1", name: "Tent A" }],
    });
    expect(input!.sourceAppId).toBe("vivosun");
  });

  it("returns null when blocked", () => {
    const input = buildRegistryCsvAuditInput({
      sourceAppId: "spider_farmer",
      adapterResult: makeRegistryResult({
        blocked: true,
        blockedReason: "unknown_source_app",
        acceptedRowCount: 0,
      }),
      tentId: "t-1",
      tentOptions: [],
    });
    expect(input).toBeNull();
  });

  it("returns null when zero rows accepted", () => {
    const input = buildRegistryCsvAuditInput({
      sourceAppId: "vivosun",
      adapterResult: makeRegistryResult({
        acceptedRowCount: 0,
        rows: [] as never,
      }),
      tentId: "t-1",
      tentOptions: [],
    });
    expect(input).toBeNull();
  });
});

// --- static guard: wiring inside TentCsvImportCard ---

const ROOT = resolve(__dirname, "../..");
const CARD = readFileSync(
  resolve(ROOT, "src/components/TentCsvImportCard.tsx"),
  "utf8",
);

describe("TentCsvImportCard audit wiring", () => {
  it("imports and calls recordSensorHistoryImportAuditEvent", () => {
    expect(CARD).toMatch(/recordSensorHistoryImportAuditEvent/);
    expect(CARD).toMatch(/sensorHistoryImportAuditLog/);
  });

  it("uses the registry + xlsx audit builders", () => {
    expect(CARD).toMatch(/buildRegistryCsvAuditInput/);
    expect(CARD).toMatch(/buildVerdantGeneticsXlsxAuditInput/);
  });

  it("mounts the read-only audit ledger near the import UI", () => {
    expect(CARD).toMatch(/<SensorHistoryImportAuditLedger/);
  });

  it("never adds alerts/action_queue/AI surfaces in the wiring", () => {
    for (const t of [
      "alerts",
      "alert_events",
      "action_queue",
      "ai_doctor_sessions",
    ]) {
      expect(CARD).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
    }
    expect(CARD).not.toMatch(/openai|anthropic/i);
  });

  it("never references raw payload or device serials in the wiring", () => {
    const stripped = CARD.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(stripped).not.toMatch(/raw_payload/);
    expect(stripped).not.toMatch(/device_serial/i);
    expect(stripped).not.toMatch(/bridge_token/i);
  });
});

const BUILDERS = readFileSync(
  resolve(ROOT, "src/lib/sensorHistoryImportAuditEventBuilders.ts"),
  "utf8",
);

describe("sensorHistoryImportAuditEventBuilders safety", () => {
  it("does not import supabase / network / AI surfaces", () => {
    expect(BUILDERS).not.toMatch(/@\/integrations\/supabase/);
    expect(BUILDERS).not.toMatch(/\bfetch\(/);
    expect(BUILDERS).not.toMatch(/openai|anthropic/i);
  });

  it("does not reference raw payload internals or tokens", () => {
    const stripped = BUILDERS.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /(^|[^:])\/\/[^\n]*/g,
      "$1",
    );
    expect(stripped).not.toMatch(/raw_payload/);
    expect(stripped).not.toMatch(/device_serial/i);
    expect(stripped).not.toMatch(/bridge_token/i);
    expect(stripped).not.toMatch(/service_role/i);
  });
});
