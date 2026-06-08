import { describe, it, expect } from "vitest";
import {
  buildAiDoctorEnvironmentCheckContext,
  isEcowittEnvironmentCheckNote,
  parseEnvironmentCheckNote,
  selectLatestEnvironmentCheckEvent,
  AI_DOCTOR_ENV_CHECK_SOURCE_LABEL,
} from "@/lib/aiDoctorEnvironmentCheckRules";
import { compileAiDoctorContext } from "@/lib/aiDoctorContextCompiler";
import { buildAiDoctorViewModel } from "@/lib/aiDoctorViewModel";
import type { AiDoctorSensorContext } from "@/lib/aiDoctorSensorContextRules";

const ACCEPTED_NOTE = [
  "EcoWitt Environment Check",
  "Source: local EcoWitt validation (test/local data, not live device control).",
  "Captured at: 2026-06-08T12:00:00.000Z",
  "Validation status: accepted",
  "Accepted metrics: 3 · Rejected metrics: 0",
  "",
  "Per-metric results:",
  "  • temp_f: accepted (value=72.4)",
  "  • humidity_pct: accepted (value=55)",
  "  • vpd_kpa: accepted (value=1.1) — derived from temp + RH",
].join("\n");

const REJECTED_NOTE = [
  "EcoWitt Environment Check",
  "Source: local EcoWitt validation (test/local data, not live device control).",
  "Captured at: 2026-06-08T12:00:00.000Z",
  "Validation status: rejected",
  "Accepted metrics: 1 · Rejected metrics: 1",
  "",
  "Per-metric results:",
  "  • temp_f: accepted (value=72.4)",
  "  • humidity_pct: rejected (value=120) — out of range",
  "  • soil_moisture_pct: not_checked (value=—)",
].join("\n");

describe("aiDoctorEnvironmentCheckRules", () => {
  it("detects EcoWitt environment check notes", () => {
    expect(isEcowittEnvironmentCheckNote(ACCEPTED_NOTE)).toBe(true);
    expect(isEcowittEnvironmentCheckNote("random note")).toBe(false);
    expect(isEcowittEnvironmentCheckNote(null)).toBe(false);
  });

  it("parses per-metric statuses, values, and reasons", () => {
    const parsed = parseEnvironmentCheckNote(REJECTED_NOTE);
    expect(parsed.status).toBe("rejected");
    expect(parsed.metrics).toHaveLength(3);
    const humidity = parsed.metrics.find((m) => m.key === "humidity_pct");
    expect(humidity?.status).toBe("rejected");
    expect(humidity?.value).toBe(120);
    expect(humidity?.reason).toBe("out of range");
    const soil = parsed.metrics.find((m) => m.key === "soil_moisture_pct");
    expect(soil?.status).toBe("not_checked");
    expect(soil?.value).toBeNull();
  });

  it("builds context with honest source label and preserves captured_at", () => {
    const ctx = buildAiDoctorEnvironmentCheckContext({
      occurredAt: "2026-06-08T12:00:00.000Z",
      noteBody: ACCEPTED_NOTE,
    });
    expect(ctx.present).toBe(true);
    if (ctx.kind !== "present") return;
    expect(ctx.capturedAt).toBe("2026-06-08T12:00:00.000Z");
    expect(ctx.sourceLabel).toBe(AI_DOCTOR_ENV_CHECK_SOURCE_LABEL);
    expect(ctx.isLive).toBe(false);
    expect(ctx.acceptedCount).toBe(3);
    expect(ctx.contextSummary).toContain("Recent Environment Check from");
    expect(ctx.contextSummary).toContain("not live telemetry");
  });

  it("never labels local/test evidence as live", () => {
    const ctx = buildAiDoctorEnvironmentCheckContext({
      occurredAt: "2026-06-08T12:00:00.000Z",
      noteBody: ACCEPTED_NOTE,
    });
    if (ctx.kind !== "present") throw new Error("expected present");
    const blob = JSON.stringify(ctx).toLowerCase();
    expect(blob).not.toMatch(/"islive":\s*true/);
    expect(ctx.sourceLabel.toLowerCase()).not.toContain("live");
  });

  it("does not treat rejected or not_checked metrics as healthy", () => {
    const ctx = buildAiDoctorEnvironmentCheckContext({
      occurredAt: "2026-06-08T12:00:00.000Z",
      noteBody: REJECTED_NOTE,
    });
    if (ctx.kind !== "present") throw new Error("expected present");
    expect(ctx.confidenceImpact === "severely-reduced" || ctx.confidenceImpact === "untrusted").toBe(true);
    expect(ctx.safetyNotes.some((n) => /reject/i.test(n))).toBe(true);
    expect(ctx.safetyNotes.some((n) => /not_checked/i.test(n))).toBe(true);
  });

  it("surfaces derived VPD as context only, not raw sensor reading", () => {
    const ctx = buildAiDoctorEnvironmentCheckContext({
      occurredAt: "2026-06-08T12:00:00.000Z",
      noteBody: ACCEPTED_NOTE,
    });
    if (ctx.kind !== "present") throw new Error("expected present");
    const vpd = ctx.metrics.find((m) => m.key === "vpd_kpa");
    expect(vpd?.derived).toBe(true);
    expect(ctx.derivedNotes.some((n) => /derived/i.test(n))).toBe(true);
    expect(ctx.safetyNotes.some((n) => /derived vpd is included as context only/i.test(n))).toBe(true);
  });

  it("returns absent + cautious copy for missing/unparseable evidence", () => {
    const a = buildAiDoctorEnvironmentCheckContext(null);
    expect(a.present).toBe(false);
    if (a.kind !== "absent") return;
    expect(a.cautionCopy.toLowerCase()).toContain("more data is needed");

    const b = buildAiDoctorEnvironmentCheckContext({
      occurredAt: "2026-06-08T12:00:00.000Z",
      noteBody: "EcoWitt Environment Check\nSource: local EcoWitt validation\nPer-metric results:\n",
    });
    expect(b.present).toBe(false);
  });

  it("selects the latest matching event deterministically", () => {
    const e = selectLatestEnvironmentCheckEvent([
      { occurredAt: "2026-06-07T00:00:00Z", noteBody: ACCEPTED_NOTE },
      { occurredAt: "2026-06-08T00:00:00Z", noteBody: ACCEPTED_NOTE },
      { occurredAt: "2026-06-06T00:00:00Z", noteBody: "unrelated" },
    ]);
    expect(e?.occurredAt).toBe("2026-06-08T00:00:00Z");
  });
});

describe("compileAiDoctorContext + view model", () => {
  it("keeps Environment Check context separate from live sensor context", () => {
    const sensor: AiDoctorSensorContext = {
      sourceState: "live",
      sourceLabel: "Live",
      capturedAt: "2026-06-08T12:00:00.000Z",
      recordedAt: "2026-06-08T12:00:00.000Z",
      isStale: false,
      isInvalid: false,
      usableMetrics: ["temperature_c"],
      missingMetrics: [],
      invalidMetrics: [],
      confidenceImpact: "none",
      contextSummary: "Live sensor reading with 1 usable metric(s).",
      safetyNotes: ["Sensor telemetry alone cannot confirm or deny plant health with certainty."],
    };
    const compiled = compileAiDoctorContext({
      sensorContext: sensor,
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: ACCEPTED_NOTE },
      ],
    });
    expect(compiled.sensor).toBe(sensor);
    expect(compiled.environmentCheck.present).toBe(true);
    // Two distinct slots — no merging of evidence into one bag.
    expect(JSON.stringify(compiled.sensor)).not.toContain("EcoWitt Environment Check");
  });

  it("preserves existing AI Doctor behavior when no Environment Check events exist", () => {
    const vm = buildAiDoctorViewModel({
      sensorContext: null,
      environmentCheckEvents: [],
    });
    expect(vm.environmentCheck.show).toBe(false);
    expect(vm.missingContextCaution.toLowerCase()).toContain("more data is needed");
  });

  it("surfaces missing/weak context cautiously when env check is rejected", () => {
    const vm = buildAiDoctorViewModel({
      sensorContext: null,
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: REJECTED_NOTE },
      ],
    });
    expect(vm.environmentCheck.show).toBe(true);
    expect(vm.environmentCheck.evidenceBadge).toBe("Test/Local validation");
    expect(vm.environmentCheck.isLive).toBe(false);
    expect(vm.missingContextCaution.toLowerCase()).toMatch(/rejected|weak|more data/);
  });

  it("does not introduce sensor_readings writes, functions.invoke, action_queue, or device-control strings", async () => {
    const fs = await import("node:fs/promises");
    const files = [
      "src/lib/aiDoctorEnvironmentCheckRules.ts",
      "src/lib/aiDoctorContextCompiler.ts",
      "src/lib/aiDoctorViewModel.ts",
    ];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      expect(src).not.toMatch(/sensor_readings/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/turn[_ ]?on|turn[_ ]?off|device[_ ]?control/i);
    }
  });
});
