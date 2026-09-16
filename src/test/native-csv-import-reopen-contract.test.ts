/**
 * native-csv-import-reopen-contract
 *
 * Unit-level regression bridge for e2e-local/native-csv-import-reopen.spec.ts
 * (PR #1410). The browser proof exercises PostgREST + disposable Postgres;
 * these tests pin the same business contracts in Vitest so regressions surface
 * without the full native stack.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseEnvironmentCSVText } from "@/lib/csvParser";
import {
  buildSensorReadingInserts,
  persistCsvEnvironmentRows,
} from "@/lib/environmentCsvImportPersistence";
import { buildCsvImportFailureMessage } from "@/lib/environmentCsvPreviewCopyRules";
import { buildCsvImportDoneMessage } from "@/lib/environmentCsvImportViewModel";
import { buildCsvTimelineContext } from "@/lib/environmentCsvTimelineContextViewModel";
import {
  dedupeKeyOf,
  type ExistingKeysQueryScope,
} from "@/lib/csv-import/sensorReadingsBatchInsert";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";

const ROOT = resolve(__dirname, "../..");
const NATIVE_E2E_SPEC = readFileSync(
  resolve(ROOT, "e2e-local/native-csv-import-reopen.spec.ts"),
  "utf8",
);

const NATIVE_LOCAL_ENV_KEYS = [
  "NATIVE_LOCAL_BROWSER",
  "NATIVE_LOCAL_UI_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NATIVE_LOCAL_FIXTURE_PASSWORD",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

function nativeE2eCsvText(at1: string, at2: string) {
  return "Timestamp,Temp(°C),RH,VPD\n" + `${at1},24,52,1.11\n` + `${at2},25,57,1.23\n`;
}

function observationRows(csvText: string): ParsedEnvironmentRow[] {
  const parsed = parseEnvironmentCSVText(csvText);
  expect(parsed.errors).toEqual([]);
  expect(parsed.skippedRows).toEqual([]);
  expect(parsed.validRows).toHaveLength(2);
  return parsed.validRows;
}

async function loadNativePlaywrightConfig() {
  vi.resetModules();
  process.env.NATIVE_LOCAL_BROWSER = "1";
  process.env.NATIVE_LOCAL_UI_URL = "http://127.0.0.1:5173";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.VITE_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_ANON_KEY = "native-local-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "native-local-service-role-key";
  process.env.NATIVE_LOCAL_FIXTURE_PASSWORD = "native-local-fixture-password";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY;
  const mod = await import("../../playwright.native-local.config");
  return mod.default as { testMatch: string | string[] };
}

let savedEnv: Partial<Record<(typeof NATIVE_LOCAL_ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of NATIVE_LOCAL_ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of NATIVE_LOCAL_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("native CSV import reopen — parser contract", () => {
  it("parses the native e2e CSV template as two valid rows with CSV VPD provenance", () => {
    const rows = observationRows(
      nativeE2eCsvText("2026-06-09T10:00:00.000Z", "2026-06-09T11:00:00.000Z"),
    );
    expect(rows.map((r) => r.vpd_kpa)).toEqual([1.11, 1.23]);
    expect(rows.every((r) => r.vpd_source === "csv")).toBe(true);
    expect(rows.every((r) => r.source_tag === "csv")).toBe(true);
  });
});

describe("native CSV import reopen — tent-scoped persistence", () => {
  it("imports the same file into two tents without cross-tent dedupe", async () => {
    const saved = buildSensorReadingInserts([], {
      user_id: "u1",
      grow_id: "g1",
      tent_id: "unused",
    });
    type InsertRow = (typeof saved)[number];
    const persisted: InsertRow[] = [];
    const client = {
      insertSensorReadings: vi.fn(async (batch: InsertRow[]) => {
        persisted.push(...batch);
        return { error: null, insertedCount: batch.length };
      }),
      fetchExistingSensorReadingKeys: async (scope: ExistingKeysQueryScope) =>
        new Set(
          persisted
            .filter((r) => scope.tentIds.includes(r.tent_id))
            .map((r) => dedupeKeyOf(r))
            .filter((key): key is string => key != null),
        ),
    };

    const rows = observationRows(
      nativeE2eCsvText("2026-06-09T10:00:00.000Z", "2026-06-09T11:00:00.000Z"),
    );
    const primary = { user_id: "u1", grow_id: "g1", tent_id: "t-primary", plant_id: null };
    const secondary = { user_id: "u1", grow_id: "g1", tent_id: "t-secondary", plant_id: null };

    const first = await persistCsvEnvironmentRows(rows, primary, client);
    expect(first).toMatchObject({ error: null, insertedCount: 6, duplicateCount: 0 });

    const second = await persistCsvEnvironmentRows(rows, secondary, client);
    expect(second).toMatchObject({ error: null, insertedCount: 6, duplicateCount: 0 });
    expect(persisted).toHaveLength(12);
    expect(persisted.filter((r) => r.tent_id === "t-primary")).toHaveLength(6);
    expect(persisted.filter((r) => r.tent_id === "t-secondary")).toHaveLength(6);
    expect(client.insertSensorReadings).toHaveBeenCalledTimes(2);
  });

  it("retry after a committed import reports all duplicates for that tent only", async () => {
    const persisted: ReturnType<typeof buildSensorReadingInserts> = [];
    const client = {
      insertSensorReadings: vi.fn(async (batch: typeof persisted) => {
        persisted.push(...batch);
        return { error: null, insertedCount: batch.length };
      }),
      fetchExistingSensorReadingKeys: async (scope: ExistingKeysQueryScope) =>
        new Set(
          persisted
            .filter((r) => scope.tentIds.includes(r.tent_id))
            .map((r) => dedupeKeyOf(r))
            .filter((key): key is string => key != null),
        ),
    };

    const rows = observationRows(
      nativeE2eCsvText("2026-06-09T10:00:00.000Z", "2026-06-09T11:00:00.000Z"),
    );
    const scope = { user_id: "u1", grow_id: "g1", tent_id: "t-primary", plant_id: null };

    await persistCsvEnvironmentRows(rows, scope, client);
    const retry = await persistCsvEnvironmentRows(rows, scope, client);

    expect(retry).toMatchObject({ error: null, insertedCount: 0, duplicateCount: 6 });
    expect(client.insertSensorReadings).toHaveBeenCalledTimes(1);
    expect(buildCsvImportDoneMessage(retry.insertedCount, retry.duplicateCount)).toBe(
      "No new readings imported. These readings already exist in Verdant.",
    );
  });
});

describe("native CSV import reopen — lost-response copy", () => {
  it("uses unconfirmed copy that never claims zero saves after a lost acknowledgement", () => {
    const message = buildCsvImportFailureMessage(0, false, true);
    expect(message).toMatch(/couldn't confirm whether any CSV readings were saved/i);
    expect(message).not.toMatch(/No CSV readings were saved/i);
  });
});

describe("native CSV import reopen — timeline VPD provenance", () => {
  it("labels the nearest CSV VPD as CSV VPD on the matched diary entry", () => {
    const capturedAt = "2026-06-09T11:00:00.000Z";
    const context = buildCsvTimelineContext({
      growId: "g1",
      tentId: "t-primary",
      diaryEntries: [
        {
          id: "diary-1",
          grow_id: "g1",
          tent_id: "t-primary",
          occurred_at: capturedAt,
        },
      ],
      sensorReadings: [
        {
          tent_id: "t-primary",
          source: "csv",
          metric: "vpd_kpa",
          value: 1.23,
          captured_at: capturedAt,
          raw_payload: { grow_id: "g1", vpd_source: "csv" },
        },
        {
          tent_id: "t-primary",
          source: "csv",
          metric: "temperature_c",
          value: 25,
          captured_at: capturedAt,
          raw_payload: { grow_id: "g1" },
        },
        {
          tent_id: "t-primary",
          source: "csv",
          metric: "humidity_pct",
          value: 57,
          captured_at: capturedAt,
          raw_payload: { grow_id: "g1" },
        },
      ],
    });

    expect(context).toHaveLength(1);
    expect(context[0]?.snapshot?.derivedVpdLabel).toBe("CSV VPD");
    expect(context[0]?.snapshot?.derivedVpdKpa).toBe(1.23);
  });
});

describe("native CSV import reopen — browser proof wiring", () => {
  it("registers the native CSV reopen spec in the opt-in Playwright config", async () => {
    const config = await loadNativePlaywrightConfig();
    const matches = Array.isArray(config.testMatch) ? config.testMatch : [config.testMatch];
    expect(matches).toEqual(
      expect.arrayContaining(["native-save-retrieve.spec.ts", "native-csv-import-reopen.spec.ts"]),
    );
  });

  it("keeps the two native browser scenarios pinned in the e2e spec", () => {
    expect(NATIVE_E2E_SPEC).toMatch(/CSV preview is read-only/i);
    expect(NATIVE_E2E_SPEC).toMatch(/lost reply remains unconfirmed/i);
    expect(NATIVE_E2E_SPEC).toMatch(/csv-import-retry/);
    expect(NATIVE_E2E_SPEC).toMatch(/csv-timeline-chip-/);
    expect(NATIVE_E2E_SPEC).toMatch(/imported-history-empty/);
  });
});
