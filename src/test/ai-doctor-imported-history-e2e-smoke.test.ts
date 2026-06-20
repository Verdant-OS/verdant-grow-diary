/**
 * End-to-end smoke test: imported CSV/XLSX sensor history must flow
 * safely from compiled plant context into AI Doctor prompt messages,
 * without being treated as live telemetry and without leaking raw
 * payload internals.
 *
 * Deterministic, no network, no model calls, no Supabase writes.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compilePlantContextFromRows } from "@/lib/aiDoctorContextCompiler";
import { buildAiDoctorPromptMessages } from "@/lib/aiDoctorPromptAssembly";

const NOW = new Date("2026-06-13T12:00:00.000Z");

function captured(hoursAgo: number): string {
  return new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
}

describe("AI Doctor imported history e2e smoke", () => {
  // Representative imported rows: one Verdant Genetics XLSX, one Spider
  // Farmer CSV. No live rows. raw_payload carries private fields that
  // MUST never appear in the assembled prompt text.
  const sensorReadings = [
    {
      metric: "temperature_c",
      value: 24.5,
      unit: "C",
      captured_at: captured(48),
      source: "csv",
      raw_payload: {
        source_app: "verdant_genetics_xlsx",
        csv_import: true,
        raw_row: { A: "secret-cell" },
        device_serial: "VG-SERIAL-XYZ",
        bridge_token: "tok_secret_abc",
        source_file_name: "verdant-export.xlsx",
        import_batch_id: "batch-internal-001",
        internal_id: "int_999",
      },
    },
    {
      metric: "humidity_pct",
      value: 58,
      unit: "%",
      captured_at: captured(36),
      source: "csv",
      raw_payload: {
        source_app: "spider_farmer",
        csv_import: true,
        raw_row: { col: "private" },
        device_serial: "SF-SERIAL-123",
        bridge_token: "tok_secret_def",
        source_file_name: "spider-farmer.csv",
        import_batch_id: "batch-internal-002",
        internal_id: "int_1000",
      },
    },
    {
      metric: "vpd_kpa",
      value: 1.1,
      unit: "kPa",
      captured_at: captured(30),
      source: "csv",
      raw_payload: {
        source_app: "verdant_genetics_xlsx",
        csv_import: true,
      },
    },
  ];

  const ctx = compilePlantContextFromRows({
    plant: {
      id: "plant-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      name: "Test Plant",
      strain: "Test Strain",
      stage: "veg",
    },
    growEvents: [],
    sensorReadings,
    now: NOW,
  });

  const messages = buildAiDoctorPromptMessages(ctx);
  const combined = `${messages.system}\n${messages.user}`;

  it("compiled context carries imported_sensor_history and no live readings", () => {
    expect(ctx.imported_sensor_history).not.toBeNull();
    expect(ctx.imported_sensor_history!.hasCsvHistory).toBe(true);
    expect(ctx.hasLiveSensorReadings).toBe(false);
    expect(ctx.missingLiveSensorReadings).toBe(true);
  });

  it("prompt includes imported history section + caveats + vendor labels", () => {
    expect(combined).toContain("Imported sensor history");
    expect(combined).toContain(
      "This is imported CSV history, not live telemetry.",
    );
    expect(combined).toContain(
      "Imported history may show trends but is not proof of current conditions.",
    );
    expect(combined).toContain("Verdant Genetics XLSX");
    expect(combined).toContain("Spider Farmer");
  });

  it("prompt includes missing-live-readings warning", () => {
    expect(messages.missingLiveReadingsBlock).not.toBeNull();
    expect(combined).toMatch(/missing|unavailable/i);
    expect(combined).toContain("live sensor readings");
  });

  it("prompt never leaks raw_payload internals or private identifiers", () => {
    const forbidden = [
      "raw_payload",
      "raw_row",
      "device_serial",
      "VG-SERIAL-XYZ",
      "SF-SERIAL-123",
      "bridge_token",
      "tok_secret_abc",
      "tok_secret_def",
      "source_file_name",
      "verdant-export.xlsx",
      "spider-farmer.csv",
      "import_batch_id",
      "batch-internal-001",
      "batch-internal-002",
      "internal_id",
      "int_999",
      "int_1000",
      "secret-cell",
    ];
    for (const term of forbidden) {
      expect(
        combined.includes(term),
        `prompt must not include "${term}"`,
      ).toBe(false);
    }
  });

  it("smoke path emits no alerts and no Action Queue writes", () => {
    // The assembly path is text-only. Statically guard against any
    // alert/Action Queue write helpers sneaking into this surface.
    const assemblySrc = readFileSync(
      resolve(__dirname, "../lib/aiDoctorPromptAssembly.ts"),
      "utf8",
    );
    const rulesSrc = readFileSync(
      resolve(__dirname, "../lib/aiDoctorImportedHistoryPromptRules.ts"),
      "utf8",
    );
    for (const src of [assemblySrc, rulesSrc]) {
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/\.from\(["']alerts["']\)/);
      expect(src).not.toMatch(/\.from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/fetch\(/);
    }
    // The assembled prompt itself must not instruct creation of alerts
    // or Action Queue items from imported history alone.
    expect(combined).toContain(
      "Do not create or recommend alerts solely from imported history.",
    );
    expect(combined).toContain(
      "Do not create or recommend Action Queue items solely from imported history.",
    );
  });
});
