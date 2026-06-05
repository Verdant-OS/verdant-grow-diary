/**
 * Polish tests:
 *  - Export filename sanitization
 *  - Copy/Download JSON share the same redacted payload (no secrets)
 *  - Drag/drop helpers + parseCanaryImport line/column + schema errors
 *  - localStorage workflow v0 → v1 migration (idempotent + safe)
 *  - Drill-down evidence row IDs and graceful missing-row behavior
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  WORKFLOW_BACKUP_KEY,
  WORKFLOW_MIGRATION_FLAG,
  WORKFLOW_STORAGE_KEY,
  buildAuditReport,
  buildDrillDown,
  buildVerdictExport,
  buildVerdictFilename,
  computeVerdict,
  evaluatePreflight,
  loadWorkflowFromLocalStorage,
  migrateLegacyWorkflowSnapshots,
  migrateSnapshotToV1,
  parseCanaryImport,
  positionToLineColumn,
  sanitizeFilenamePart,
  type CanaryReportInput,
} from "@/lib/ecowittCanaryAuditRules";

const pageSrc = readFileSync(resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx"), "utf8");

const goodTent = {
  id: "t1",
  name: "Canary Tent",
  is_archived: false,
  hardware_config: {
    ecowitt: { passkey_fingerprint: "ewfp_abcdef0123", air_channels: [1], soil_channels: [1] },
  },
};

const goodReport: CanaryReportInput = {
  responses: {
    main: { http: 200, ok: true },
    duplicate: { http: 200, ok: true },
    malformed: { http: 400, ok: false },
  },
  main_row_counts: { temperature_c: 1, humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
  malformed_row_counts: { humidity: 1, soil_moisture: 1 },
  duplicate_replay_counts: { temperature_c: 1, humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
  channel_9_count: 0,
  leak_scan_count: 0,
  secret_value_leak_count: 0,
  null_captured_at_count: 0,
  timestamp_source_counts: { ecowitt_dateutc: 4 },
  vpd_provenance: { calculated: true, derived_from: ["temperature_c", "humidity"] },
};

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("sanitizeFilenamePart", () => {
  it("lowercases, dashes spaces, strips unsafe chars", () => {
    expect(sanitizeFilenamePart("My Canary / Tent #1")).toBe("my-canary-tent-1");
  });
  it("falls back when empty or all-unsafe", () => {
    expect(sanitizeFilenamePart("")).toBe("workflow");
    expect(sanitizeFilenamePart("///***")).toBe("workflow");
    expect(sanitizeFilenamePart(null)).toBe("workflow");
  });
});

describe("buildVerdictFilename", () => {
  it("uses pattern verdant-canary-verdict-{slug}-{stamp}.{ext}", () => {
    const fn = buildVerdictFilename({
      workflowSlug: "Canary Tent",
      ext: "json",
      now: new Date(2026, 5, 5, 13, 7), // local
    });
    expect(fn).toBe("verdant-canary-verdict-canary-tent-2026-06-05_1307.json");
  });
  it("falls back to 'workflow' and supports csv", () => {
    const fn = buildVerdictFilename({ ext: "csv", now: new Date(2026, 0, 1, 0, 0) });
    expect(fn).toBe("verdant-canary-verdict-workflow-2026-01-01_0000.csv");
  });
});

describe("Copy JSON parity (redacted only)", () => {
  it("verdict export payload equals download payload and contains no secret-bearing fields", () => {
    const preflight = evaluatePreflight({ authAvailable: true, tent: goodTent });
    const verdict = computeVerdict({ preflight, report: goodReport, logReviewed: true });
    const audit = buildAuditReport({
      tent: { id: goodTent.id, name: goodTent.name },
      endpoint: "/functions/v1/ecowitt-ingest",
      preflight,
      report: goodReport,
      verdict,
    });
    const exported = buildVerdictExport(audit);
    const json = JSON.stringify(exported, null, 2);
    // No raw secrets
    expect(json).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
    expect(json).not.toMatch(/PASSKEY\s*[=:]\s*[A-Z0-9]{16,}/i);
    expect(json).not.toMatch(/\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/);
    // Page wires Copy JSON to the same source via buildVerdictExport
    expect(pageSrc).toMatch(/verdictJsonString\s*=\s*useMemo/);
    expect(pageSrc).toContain("buildVerdictExport(builtAudit)");
    expect(pageSrc).toContain("data-testid=\"copy-verdict-json\"");
  });
});

describe("Drag/drop import UI wiring", () => {
  it("exposes a dropzone with drag/drop handlers", () => {
    expect(pageSrc).toContain('data-testid="import-dropzone"');
    expect(pageSrc).toContain("onDragOver=");
    expect(pageSrc).toContain("onDrop={handleDrop}");
  });
});

describe("parseCanaryImport", () => {
  it("returns line/column on invalid JSON", () => {
    const bad = '{\n  "main_row_counts": { "temperature_c": 1, },\n}';
    const r = parseCanaryImport(bad);
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe("json");
    expect(typeof r.error?.line).toBe("number");
    expect(typeof r.error?.column).toBe("number");
  });
  it("distinguishes schema mismatch from JSON parse error", () => {
    const r = parseCanaryImport(JSON.stringify({ totally: "different" }));
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe("schema");
    expect(r.error?.expectedFields).toContain("main_row_counts");
  });
  it("accepts a well-formed canary JSON object", () => {
    const r = parseCanaryImport(JSON.stringify(goodReport));
    expect(r.ok).toBe(true);
    expect(r.report?.channel_9_count).toBe(0);
  });
  it("returns empty error for empty input", () => {
    expect(parseCanaryImport("").error?.kind).toBe("empty");
  });
});

describe("positionToLineColumn", () => {
  it("maps 0-based position to 1-based line/column", () => {
    const t = "abc\nde\nfghi";
    expect(positionToLineColumn(t, 0)).toEqual({ line: 1, column: 1 });
    expect(positionToLineColumn(t, 4)).toEqual({ line: 2, column: 1 });
    expect(positionToLineColumn(t, 7)).toEqual({ line: 3, column: 1 });
  });
});

describe("workflow snapshot migration (legacy → v1)", () => {
  it("is idempotent: v1 data is left alone (only normalized once)", () => {
    const v1 = {
      schemaVersion: 1,
      workflowId: "wf_test",
      workflowName: "x",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      verdict: null,
      evidence: [],
      source: "manual-import",
      metadata: {},
    };
    localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(v1));
    const a = migrateLegacyWorkflowSnapshots();
    const b = migrateLegacyWorkflowSnapshots();
    expect(a.alreadyV1).toBe(true);
    expect(b.ran).toBe(false); // flag set
    expect(JSON.parse(localStorage.getItem(WORKFLOW_STORAGE_KEY)!)).toEqual(v1);
  });

  it("migrates legacy snapshot, backs up first, and tolerates malformed data", () => {
    localStorage.setItem("operator.ecowitt.canary.workflow.v0", JSON.stringify({ saved_at: "old", cards: [{ key: "x" }] }));
    localStorage.setItem("operator.ecowitt.canary.workflow", "{not json");
    const out = migrateLegacyWorkflowSnapshots();
    expect(out.ran).toBe(true);
    expect(out.backedUp).toBe(true);
    expect(localStorage.getItem(WORKFLOW_BACKUP_KEY)).toBeTruthy();
    expect(localStorage.getItem(WORKFLOW_MIGRATION_FLAG)).toBe("1");
    const migrated = JSON.parse(localStorage.getItem(WORKFLOW_STORAGE_KEY)!);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.evidence).toEqual([{ key: "x" }]);
    // Legacy key cleared
    expect(localStorage.getItem("operator.ecowitt.canary.workflow.v0")).toBeNull();
  });

  it("does not crash boot when localStorage is malformed", () => {
    localStorage.setItem(WORKFLOW_STORAGE_KEY, "@@@not-json@@@");
    expect(() => migrateLegacyWorkflowSnapshots()).not.toThrow();
    // loadWorkflowFromLocalStorage also handles bad data:
    expect(() => loadWorkflowFromLocalStorage()).not.toThrow();
  });

  it("migrateSnapshotToV1 normalizes minimal data with sane defaults", () => {
    const out = migrateSnapshotToV1({ saved_at: "2025-01-01T00:00:00Z" }, { migratedFrom: "legacy" });
    expect(out?.schemaVersion).toBe(1);
    expect(out?.source).toBe("localStorage-migration");
    expect(out?.metadata.migratedFrom).toBe("legacy");
    expect(typeof out?.workflowId).toBe("string");
  });
});

describe("Drill-down evidence rows", () => {
  it("uses stable row ids like evidence-row-{key}-{i}", () => {
    expect(pageSrc).toMatch(/evidence-row-\$\{card\.key\}-\$\{i\}/);
    expect(pageSrc).toContain("scrollIntoView");
    expect(pageSrc).toContain('autoOpenAndScroll={c.status === "fail"}');
  });

  it("buildDrillDown returns unavailable for missing data without throwing", () => {
    const preflight = evaluatePreflight({ authAvailable: true, tent: goodTent });
    const verdict = computeVerdict({ preflight, report: null, logReviewed: false });
    for (const c of verdict.cards) {
      const d = buildDrillDown(c, null);
      expect(d).toBeTruthy();
      // No offending rows referenced → unavailable flag or empty list.
      expect(Array.isArray(d.offending)).toBe(true);
    }
  });
});

describe("page-level safety", () => {
  it("does not introduce DB writes, function invokes, or device control", () => {
    const stripped = pageSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "")
      .toLowerCase();
    for (const w of ["functions.invoke", ".rpc(", "action_queue", "mqtt", "relay", "actuator"]) {
      expect(stripped).not.toContain(w);
    }
    expect(pageSrc).not.toMatch(/\.insert\(/);
    expect(pageSrc).not.toMatch(/\.update\(/);
    expect(pageSrc).not.toMatch(/\.delete\(/);
    expect(pageSrc).not.toMatch(/\.upsert\(/);
  });
});
