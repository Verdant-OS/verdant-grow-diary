import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAiDoctorPromptMessages,
  AI_DOCTOR_BASE_SYSTEM_PROMPT,
} from "@/lib/aiDoctorPromptAssembly";
import {
  IMPORTED_HISTORY_PROMPT_STRINGS,
  AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS,
} from "@/lib/aiDoctorImportedHistoryPromptRules";

const baseImportedHistory = {
  hasCsvHistory: true,
  historicalLabel: "CSV history",
  notForLiveDiagnosis:
    "This is imported CSV history, not live telemetry. Do not diagnose from CSV history alone.",
  totalReadings: 12,
  dateRange: {
    earliest: "2026-05-01T00:00:00.000Z",
    latest: "2026-05-07T00:00:00.000Z",
  },
  vendors: [
    { sourceApp: "verdant_genetics_xlsx", vendorLabel: "Verdant Genetics XLSX", count: 12 },
  ],
  metrics: [{ metric: "temp", unit: "C", count: 12, min: 20, max: 26, avg: 23.5 }],
  excludedQualityCount: 0,
  suspiciousFlagCount: 0,
};

describe("buildAiDoctorPromptMessages — imported-history injection", () => {
  it("returns base system prompt and JSON packet user prompt when no history / live readings", () => {
    const growId = "11111111-1111-4111-8111-111111111111";
    const idempotencyKey = "request-key-123";
    const out = buildAiDoctorPromptMessages({
      grow_id: growId,
      idempotency_key: idempotencyKey,
    });
    expect(out.system).toContain(AI_DOCTOR_BASE_SYSTEM_PROMPT);
    expect(out.user).toContain("Grower context packet (JSON):");
    expect(out.user).not.toContain(growId);
    expect(out.user).not.toContain(idempotencyKey);
    expect(out.importedHistoryBlock).toBeNull();
    expect(out.missingLiveReadingsBlock).toBeNull();
    expect(out.guidance).toEqual([]);
    // Required output sections always present in system.
    for (const section of AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS) {
      expect(out.system).toContain(section);
    }
  });

  it("redacts operational scope fields even when a caller nests them in context", () => {
    const outerGrowId = "11111111-1111-4111-8111-111111111111";
    const injectedGrowId = "22222222-2222-4222-8222-222222222222";
    const idempotencyKey = "request-key-123";
    const out = buildAiDoctorPromptMessages({
      grow_id: outerGrowId,
      plant: {
        growId: injectedGrowId,
        sensorHistory: [{ idempotencyKey }],
      },
    });

    expect(out.user).not.toContain(outerGrowId);
    expect(out.user).not.toContain(injectedGrowId);
    expect(out.user).not.toContain(idempotencyKey);
  });

  it("injects imported-history guidance and block when packet has imported_sensor_history", () => {
    const out = buildAiDoctorPromptMessages({
      grow_id: "g1",
      imported_sensor_history: baseImportedHistory,
      missingLiveSensorReadings: false,
    });
    expect(out.importedHistoryBlock).not.toBeNull();
    expect(out.user).toContain("[Historical sensor context]");
    expect(out.user).toContain("Verdant Genetics XLSX");
    expect(out.user).toContain("Date range:");
    expect(out.user).toContain("Excluded quality rows: 0");
    expect(out.system).toContain(IMPORTED_HISTORY_PROMPT_STRINGS.notLiveCaveat);
    expect(out.system).toContain(IMPORTED_HISTORY_PROMPT_STRINGS.notProofOfCurrent);
    expect(out.system).toContain(IMPORTED_HISTORY_PROMPT_STRINGS.notHealthyFromHistoryAlone);
    expect(out.system).toContain(IMPORTED_HISTORY_PROMPT_STRINGS.noAlertsFromHistoryAlone);
    expect(out.system).toContain(IMPORTED_HISTORY_PROMPT_STRINGS.noActionQueueFromHistoryAlone);
  });

  it("injects missing-live-readings block when missingLiveSensorReadings is true", () => {
    const out = buildAiDoctorPromptMessages({
      missingLiveSensorReadings: true,
    });
    expect(out.missingLiveReadingsBlock).not.toBeNull();
    expect(out.user).toContain("[Missing current sensor readings]");
    expect(out.system).toContain(IMPORTED_HISTORY_PROMPT_STRINGS.missingLiveReadings);
    expect(out.system).toContain(IMPORTED_HISTORY_PROMPT_STRINGS.missingInfoIncludeLive);
  });

  it("caps confidence guidance when imported history is present AND live readings are missing", () => {
    const out = buildAiDoctorPromptMessages({
      imported_sensor_history: baseImportedHistory,
      missingLiveSensorReadings: true,
    });
    expect(out.system).toContain(IMPORTED_HISTORY_PROMPT_STRINGS.confidenceCap);
  });

  it("omits imported history block when packet has no imported_sensor_history", () => {
    const out = buildAiDoctorPromptMessages({ missingLiveSensorReadings: true });
    expect(out.importedHistoryBlock).toBeNull();
    expect(out.user).not.toContain("[Imported sensor history]");
  });

  it("preserves required AI Doctor output sections in system prompt", () => {
    const out = buildAiDoctorPromptMessages({
      imported_sensor_history: baseImportedHistory,
      missingLiveSensorReadings: true,
    });
    for (const section of AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS) {
      expect(out.system).toContain(section);
    }
  });

  it("excludes raw_payload internals and private identifiers from emitted prompt text", () => {
    // Sensitive fields must NOT leak even if present on the packet,
    // because the helper only formats whitelisted summary fields.
    const out = buildAiDoctorPromptMessages({
      imported_sensor_history: baseImportedHistory,
      missingLiveSensorReadings: false,
    });
    const banned = [
      "raw_payload",
      "raw_row",
      "device_serial",
      "bridge_token",
      "source_file",
      "import_batch_id",
      "internal_id",
      "service_role",
    ];
    // The imported-history block specifically must not contain any banned token.
    for (const tok of banned) {
      expect(out.importedHistoryBlock ?? "").not.toContain(tok);
    }
  });

  it("handles null/undefined packet without throwing", () => {
    expect(() => buildAiDoctorPromptMessages(null)).not.toThrow();
    expect(() => buildAiDoctorPromptMessages(undefined)).not.toThrow();
    const out = buildAiDoctorPromptMessages(null);
    expect(out.importedHistoryBlock).toBeNull();
    expect(out.missingLiveReadingsBlock).toBeNull();
  });

  it("fails safely inside prompt formatting when history arrays are malformed", () => {
    const malformedHistory = {
      ...baseImportedHistory,
      vendors: {},
      metrics: {},
    };

    expect(() =>
      buildAiDoctorPromptMessages({ imported_sensor_history: malformedHistory }),
    ).not.toThrow();
    const out = buildAiDoctorPromptMessages({ imported_sensor_history: malformedHistory });
    expect(out.importedHistoryBlock).toContain("Vendors: unknown vendor");
    expect(out.importedHistoryBlock).toContain("Metric summaries: no metric summaries");
  });

  it("static guard: edge function uses helper and contains no new Supabase write / schema / device-control calls", () => {
    const path = resolve(process.cwd(), "supabase/functions/ai-doctor-review/index.ts");
    const src = readFileSync(path, "utf8");
    expect(src).toContain("buildAiDoctorPromptMessages");
    // No new sensor_readings / alerts / action_queue writes added.
    expect(src).not.toMatch(/from\(['"]sensor_readings['"]\)/);
    expect(src).not.toMatch(/from\(['"]alerts['"]\)/);
    expect(src).not.toMatch(/from\(['"]action_queue['"]\)/);
    // No device-control verbs in the prompt assembly call site.
    expect(src).not.toMatch(/turn_on|turn_off|device_control/i);
    // Helper itself is pure: no Supabase, fetch, or device imports.
    const helperPath = resolve(process.cwd(), "src/lib/aiDoctorPromptAssembly.ts");
    const helperSrc = readFileSync(helperPath, "utf8");
    expect(helperSrc).not.toMatch(/from ["']@\/integrations\/supabase/);
    expect(helperSrc).not.toMatch(/createClient\(/);
    expect(helperSrc).not.toMatch(/\bfetch\(/);
    expect(helperSrc).not.toMatch(/action_queue/);
  });
});
