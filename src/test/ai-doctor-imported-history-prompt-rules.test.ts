import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS,
  IMPORTED_HISTORY_PROMPT_STRINGS,
  buildAiDoctorImportedHistoryPromptFragment,
} from "@/lib/aiDoctorImportedHistoryPromptRules";
import {
  compilePlantContextFromRows,
  type SensorReadingRowLike,
} from "@/lib/aiDoctorContextCompiler";

const NOW = new Date("2026-06-04T12:00:00Z");
const iso = (off: number) => new Date(NOW.getTime() - off).toISOString();

function csvRow(
  metric: string,
  value: number,
  source_app: string,
  off = 60_000,
): SensorReadingRowLike {
  return {
    metric,
    value,
    unit: metric === "temperature_c" ? "C" : null,
    captured_at: iso(off),
    source: "csv",
    raw_payload: {
      source_app,
      csv_import: true,
      device_serial: "SF-XYZ-001",
      bridge_token: "tok_secret",
      source_file: "/Users/me/export.csv",
      raw_row: { hidden: 1 },
      internal_id: "row-42",
      import_batch_id: "batch-deadbeef-internal",
    },
  };
}

const liveRow: SensorReadingRowLike = {
  metric: "temperature_c",
  value: 24,
  captured_at: iso(60_000),
  source: "ecowitt",
};

const plant = {
  id: "p1",
  tent_id: "t1",
  grow_id: "g1",
  name: "Plant",
  strain: "NL",
  stage: "veg",
};

describe("aiDoctorImportedHistoryPromptRules", () => {
  it("includes imported-history caveat when imported_sensor_history exists", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "spider_farmer")],
      now: NOW,
    });
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    expect(frag.importedHistoryBlock).toContain("Imported sensor history");
    expect(frag.importedHistoryBlock).toContain("CSV history");
    expect(frag.importedHistoryBlock).toContain(
      "This is imported CSV history, not live telemetry",
    );
    expect(frag.guidance.join("\n")).toContain(
      IMPORTED_HISTORY_PROMPT_STRINGS.notLiveCaveat,
    );
  });

  it("includes missing-live-readings warning when missingLiveSensorReadings is true", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "vivosun")],
      now: NOW,
    });
    expect(ctx.missingLiveSensorReadings).toBe(true);
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    expect(frag.missingLiveReadingsBlock).toContain(
      "Current/live sensor readings are missing",
    );
    expect(frag.guidance.join(" ")).toContain(
      "include 'live sensor readings'",
    );
  });

  it("does NOT include missing-live warning when live readings exist", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [liveRow, csvRow("humidity_pct", 50, "ac_infinity")],
      now: NOW,
    });
    expect(ctx.hasLiveSensorReadings).toBe(true);
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    expect(frag.missingLiveReadingsBlock).toBeNull();
  });

  it("distinguishes current evidence from imported historical context", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "spider_farmer")],
      now: NOW,
    });
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    expect(frag.guidance.join("\n")).toContain(
      "distinguish 'Current evidence' from 'Imported historical context'",
    );
  });

  it("tells model not to claim current environment is healthy from imported history alone", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "spider_farmer")],
      now: NOW,
    });
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    expect(frag.guidance.join(" ")).toContain(
      "Do not state that the current environment is healthy",
    );
  });

  it("tells model not to create alerts or Action Queue items solely from imported history", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "verdant_genetics_xlsx")],
      now: NOW,
    });
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    const joined = frag.guidance.join(" ");
    expect(joined).toContain(
      "Do not create or recommend alerts solely from imported history",
    );
    expect(joined).toContain(
      "Do not create or recommend Action Queue items solely from imported history",
    );
  });

  it("caps confidence when only imported history exists", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "spider_farmer")],
      now: NOW,
    });
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    expect(frag.guidance.join(" ")).toContain("cap Confidence at 'low' or 'moderate'");
  });

  it("preserves required AI Doctor output structure", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "spider_farmer")],
      now: NOW,
    });
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    const joined = frag.guidance.join("\n");
    for (const section of [
      "Summary",
      "Likely issue",
      "Confidence",
      "Evidence",
      "Missing information",
      "Possible causes",
      "Immediate action",
      "What not to do",
      "24-hour follow-up",
      "3-day recovery plan",
      "Risk level",
      "Action Queue suggestion, if appropriate",
    ]) {
      expect(joined).toContain(section);
    }
    expect(AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS).toContain("Summary");
  });

  it("returns empty fragment when context has neither imported history nor missing live readings", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [liveRow],
      now: NOW,
    });
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    expect(frag.guidance.length).toBe(0);
    expect(frag.importedHistoryBlock).toBeNull();
    expect(frag.missingLiveReadingsBlock).toBeNull();
  });

  it("excludes raw_payload, device serials, bridge tokens, raw rows, source files, batch IDs, and internal IDs", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [
        csvRow("temperature_c", 24, "spider_farmer"),
        csvRow("humidity_pct", 50, "vivosun"),
      ],
      now: NOW,
    });
    const frag = buildAiDoctorImportedHistoryPromptFragment(ctx);
    const blob = JSON.stringify(frag);
    for (const forbidden of [
      "SF-XYZ-001",
      "tok_secret",
      "export.csv",
      "raw_row",
      "row-42",
      "batch-deadbeef-internal",
      "device_serial",
      "bridge_token",
      "raw_payload",
      "source_file",
      "import_batch_id",
      "internal_id",
    ]) {
      expect(blob).not.toContain(forbidden);
    }
  });

  it("static safety: rules module makes no writes, alerts, or device-control calls", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/aiDoctorImportedHistoryPromptRules.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\.(insert|update|delete|upsert|rpc)\s*\(/);
    expect(src).not.toMatch(/\bfrom\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/createClient/);
    expect(src).not.toMatch(/fetch\s*\(/);
    expect(src).not.toMatch(/device[_-]?control/i);
  });
});
