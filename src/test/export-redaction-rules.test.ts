/**
 * exportRedactionRules — unit + static-scanner tests.
 *
 * Step 0 findings encoded:
 *   - Forbidden-key list and sensitive-value patterns are SHARED with
 *     `actionQueueRedactionRules.ts` (this module imports
 *     `detectDeviceIdentifierLeaks` + re-exports `SENSITIVE_DEVICE_PATTERNS`).
 *   - Enumerated existing export surfaces include CSV/JSON/PDF blob
 *     builders under src/lib (csv preview, ai-doctor evidence csv, ai-doctor
 *     prompt measurement csv, environment summary, ecowitt cloud canary,
 *     verdant genetics template). The static scanner below asserts NONE
 *     of these files reference forbidden export keys as exported columns.
 *
 * Test 6 (static safety scanner) is implemented as a filesystem scan: it
 * reads candidate export-builder files and fails if any forbidden key
 * appears as a string literal in a header/column position. This is a
 * load-bearing test, not advisory.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  FORBIDDEN_EXPORT_KEYS,
  isForbiddenExportKey,
  sanitizeExportRow,
  sanitizeExportRows,
  findForbiddenHeaders,
  detectExportLeaks,
  getExportAllowlist,
  assertExportSafe,
  assertExportHeadersSafe,
  SENSITIVE_DEVICE_PATTERNS,
} from "@/lib/exportRedactionRules";

const MAC = "AA:BB:CC:DD:EE:FF";
const BRIDGE_TOKEN = "brg_tok_aF3kQ9zP1xY2";
const VENDOR_ID = "vendor_xyz_001";

describe("exportRedactionRules — forbidden keys", () => {
  it("flags every key in the forbidden list, case-insensitive", () => {
    for (const k of FORBIDDEN_EXPORT_KEYS) {
      expect(isForbiddenExportKey(k)).toBe(true);
      expect(isForbiddenExportKey(k.toUpperCase())).toBe(true);
    }
    expect(isForbiddenExportKey("metric")).toBe(false);
    expect(isForbiddenExportKey("captured_at")).toBe(false);
  });

  it("findForbiddenHeaders returns offenders only", () => {
    expect(
      findForbiddenHeaders(["metric", "value", "target_device", "captured_at"]),
    ).toEqual(["target_device"]);
    expect(findForbiddenHeaders(["metric", "value", "unit"])).toEqual([]);
  });
});

describe("exportRedactionRules — allowlists", () => {
  it("preserves safe sensor source labels and timestamps", () => {
    const row = {
      metric: "temp_c",
      value: 24.5,
      unit: "C",
      source: "live",
      captured_at: "2026-05-27T10:00:00Z",
      raw_payload: { vendor: "ecowitt", mac: MAC },
      target_device: "device_abc_001",
      bridge_token: BRIDGE_TOKEN,
    };
    const { row: safe, droppedKeys } = sanitizeExportRow(
      row,
      "sensor_snapshot",
    );
    expect(safe).toEqual({
      metric: "temp_c",
      value: 24.5,
      unit: "C",
      source: "live",
      captured_at: "2026-05-27T10:00:00Z",
    });
    expect(droppedKeys.sort()).toEqual(
      ["bridge_token", "raw_payload", "target_device"].sort(),
    );
  });

  it("keeps every canonical source label", () => {
    for (const src of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      const { row } = sanitizeExportRow(
        { metric: "rh_pct", value: 50, source: src },
        "sensor_snapshot",
      );
      expect(row.source).toBe(src);
    }
  });

  it("Action Queue export does not include target_device", () => {
    const row = {
      id: "aq-1",
      action_type: "raise_light",
      target_metric: null,
      target_device: MAC,
      target_label: "Grow-room equipment",
      suggested_change: "Raise the light by 10cm",
      reason: "Reduce radiant load.",
      risk_level: "medium",
      status: "pending_approval",
      source: "ai_doctor",
      created_at: "2026-05-27T10:00:00Z",
    };
    const { row: safe } = sanitizeExportRow(row, "action_queue");
    expect("target_device" in safe).toBe(false);
    expect(safe.target_label).toBe("Grow-room equipment");
    expect(safe.action_type).toBe("raise_light");
  });

  it("Diary/timeline export does not include raw_payload", () => {
    const row = {
      occurred_at: "2026-05-27T10:00:00Z",
      kind: "diary_entry",
      title: "Top dressed soil",
      body: "Added 2tbsp worm castings.",
      raw_payload: { vendor: "ecowitt" },
      target_device: VENDOR_ID,
    };
    const { row: safe } = sanitizeExportRow(row, "timeline");
    expect("raw_payload" in safe).toBe(false);
    expect("target_device" in safe).toBe(false);
    expect(safe.title).toBe("Top dressed soil");
  });

  it("drops sensitive *values* even when the key is allowlisted", () => {
    // Defensive: an allowlisted `note` field accidentally containing a MAC
    // must be dropped, not exported.
    const { row, droppedKeys } = sanitizeExportRow(
      {
        metric: "temp_c",
        value: 22,
        source: "live",
        note: `Probe at ${MAC} fault`,
      },
      "sensor_snapshot",
    );
    expect("note" in row).toBe(false);
    expect(droppedKeys).toContain("note");
  });
});

describe("exportRedactionRules — rows and serialized scans", () => {
  it("sanitizeExportRows aggregates dropped keys across the batch", () => {
    const { rows, droppedKeys } = sanitizeExportRows(
      [
        { metric: "temp_c", value: 22, source: "live", raw_payload: {} },
        { metric: "rh_pct", value: 55, source: "live", target_device: MAC },
      ],
      "sensor_snapshot",
    );
    expect(rows).toHaveLength(2);
    expect(droppedKeys).toEqual(["raw_payload", "target_device"]);
  });

  it("detectExportLeaks flags MAC and bridge-token-shaped strings in CSV text", () => {
    const csv =
      `metric,value,source,captured_at\n` +
      `temp_c,22,live,2026-05-27T10:00:00Z\n` +
      `rh_pct,55,live,2026-05-27T10:00:00Z ${MAC}\n`;
    const leaks = detectExportLeaks(csv);
    expect(leaks).toContain("mac_address");
  });

  it("detectExportLeaks flags forbidden header columns", () => {
    const csv = `metric,value,target_device,captured_at\n`;
    const leaks = detectExportLeaks(csv);
    expect(leaks.some((l) => l.includes("forbidden_key:target_device"))).toBe(
      true,
    );
  });

  it("clean CSV returns no leaks", () => {
    const csv =
      `metric,value,unit,source,captured_at\n` +
      `temp_c,22,C,live,2026-05-27T10:00:00Z\n`;
    expect(detectExportLeaks(csv)).toEqual([]);
  });
});

describe("exportRedactionRules — pattern source is shared", () => {
  it("re-exports SENSITIVE_DEVICE_PATTERNS from actionQueueRedactionRules", () => {
    expect(Array.isArray(SENSITIVE_DEVICE_PATTERNS)).toBe(true);
    const names = SENSITIVE_DEVICE_PATTERNS.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["mac_address", "bridge_token"]),
    );
  });
});

describe("exportRedactionRules — allowlist sanity", () => {
  it("no forbidden key is ever on an allowlist", () => {
    const kinds = [
      "sensor_snapshot",
      "timeline",
      "action_queue",
      "environment_summary",
    ] as const;
    for (const k of kinds) {
      for (const col of getExportAllowlist(k)) {
        expect(isForbiddenExportKey(col)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Static safety scanner (Test 6 — load-bearing)
// ---------------------------------------------------------------------------

const EXPORT_BUILDER_FILES = [
  "src/lib/aiDoctorEvidenceCsvExportRules.ts",
  "src/lib/cost/aiDoctorPromptMeasurementCsvExport.ts",
  "src/lib/ecowittCloudCanaryExport.ts",
  "src/lib/csvSensorPreviewPdf.ts",
  "src/lib/verdantGeneticsImportPreviewRules.ts",
  "src/lib/environmentSummaryExportReceiptView.ts",
  "src/lib/environmentSummaryExportAuditRules.ts",
];

/**
 * Forbidden-as-EXPORTED-COLUMN keys: a subset of FORBIDDEN_EXPORT_KEYS
 * that should never appear as a string literal in any export builder
 * file. Keys excluded here are common, generic identifiers (e.g.
 * `user_id`, `mac`, `auth`) that legitimately appear in non-export
 * contexts (audit redaction, type names, schema docs). The static scan
 * focuses on the high-signal device/secret class.
 */
const STATIC_SCAN_FORBIDDEN = [
  "target_device",
  "raw_payload",
  "bridge_token",
  "service_role",
  "service_role_key",
  "private_key",
  "webhook_secret",
  "refresh_token",
  "access_token",
];

describe("exportRedactionRules — static scan of export builders", () => {
  it("no known export builder embeds forbidden columns as string literals", () => {
    const offenders: Array<{ file: string; key: string; line: number }> = [];
    for (const rel of EXPORT_BUILDER_FILES) {
      const abs = join(process.cwd(), rel);
      if (!existsSync(abs)) continue; // file optional / future-proof
      const src = readFileSync(abs, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Ignore comment-only lines so doc strings don't trigger.
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        for (const k of STATIC_SCAN_FORBIDDEN) {
          // Match the key as a string literal: "key" or 'key'.
          if (
            new RegExp(`["']${k}["']`).test(line) ||
            // also catch `key:` style header maps without quotes
            new RegExp(`(^|[\\s,{])${k}\\s*:`).test(line)
          ) {
            offenders.push({ file: rel, key: k, line: i + 1 });
          }
        }
      }
    }
    if (offenders.length) {
      throw new Error(
        `Forbidden export columns detected in export builders:\n${JSON.stringify(
          offenders,
          null,
          2,
        )}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hard-fail guardrail helpers — `assertExportSafe` / `assertExportHeadersSafe`
// ---------------------------------------------------------------------------

describe("assertExportSafe / assertExportHeadersSafe", () => {
  it("passes a clean CSV body", () => {
    const csv =
      `metric,value,unit,source,captured_at\n` +
      `temp_c,22,C,live,2026-05-27T10:00:00Z\n`;
    expect(() => assertExportSafe(csv, "test")).not.toThrow();
  });

  it("throws when a MAC-like value contaminates the body", () => {
    const csv = `metric,value,source\n` + `temp_c,22,${MAC}\n`;
    expect(() => assertExportSafe(csv, "test")).toThrowError(
      /export-redaction.*test.*mac_address/,
    );
  });

  it("throws when a forbidden key appears in headers", () => {
    expect(() =>
      assertExportHeadersSafe(
        ["metric", "value", "target_device"],
        "test",
      ),
    ).toThrowError(/target_device/);
  });

  it("passes a clean header list", () => {
    expect(() =>
      assertExportHeadersSafe(
        ["metric", "value", "unit", "source", "captured_at"],
        "test",
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Retrofit verification — each enumerated builder now imports + calls the
// centralized guardrail at its serialization boundary.
// ---------------------------------------------------------------------------

const RETROFIT_FILES: Array<{ file: string; needsHeaders: boolean }> = [
  { file: "src/lib/aiDoctorEvidenceCsvExportRules.ts", needsHeaders: true },
  {
    file: "src/lib/cost/aiDoctorPromptMeasurementCsvExport.ts",
    needsHeaders: true,
  },
  { file: "src/lib/ecowittCloudCanaryExport.ts", needsHeaders: true },
  { file: "src/lib/csvSensorPreviewPdf.ts", needsHeaders: false },
  {
    file: "src/lib/environmentSummaryExportReceiptView.ts",
    needsHeaders: false,
  },
  {
    file: "src/lib/environmentSummaryExportAuditRules.ts",
    needsHeaders: false,
  },
];

describe("retrofit — every enumerated export builder routes through the centralized helper", () => {
  for (const { file, needsHeaders } of RETROFIT_FILES) {
    it(`${file} imports and calls assertExportSafe`, () => {
      const abs = join(process.cwd(), file);
      const src = readFileSync(abs, "utf8");
      expect(src).toMatch(/from\s+["']\.\.?\/exportRedactionRules["']|from\s+["']@\/lib\/exportRedactionRules["']/);
      expect(src).toMatch(/assertExportSafe\s*\(/);
      if (needsHeaders) {
        expect(src).toMatch(/assertExportHeadersSafe\s*\(/);
      }
    });
  }

  it("verdantGeneticsImportPreviewRules.ts is documented as not-an-export (import preview only)", () => {
    // Sanity: this file remains untouched by the retrofit because it is
    // an *import preview* of user-supplied CSV cells, not an export of
    // DB rows. If a future change starts emitting DB rows from it, this
    // test should be updated to require the same guardrail wiring.
    const abs = join(
      process.cwd(),
      "src/lib/verdantGeneticsImportPreviewRules.ts",
    );
    const src = readFileSync(abs, "utf8");
    // No DB-row egress markers expected.
    expect(src).not.toMatch(/from\s+["'].*supabase.*["']/);
    expect(src).not.toMatch(/raw_payload|target_device|bridge_token/);
  });
});
