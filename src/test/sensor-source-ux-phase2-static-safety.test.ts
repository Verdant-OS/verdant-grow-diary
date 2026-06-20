/**
 * sensor-source-ux-phase2-static-safety — static guards that the new
 * source UX surfaces never introduce write paths, AI calls, alerts,
 * Action Queue writes, device control, or secret/raw_payload leaks,
 * and never reintroduce the operator XLSX/spreadsheet import surfaces.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "src/lib/sensorSourceSummaryRules.ts",
  "src/components/SensorSourceSummaryWidget.tsx",
  "src/components/SensorSourceLegendTooltip.tsx",
  "src/constants/sensorSourceLabels.ts",
];

function read(p: string) {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("Sensor Source UX Phase 2 — static safety", () => {
  const forbidden = [
    ".insert(",
    ".update(",
    ".delete(",
    ".upsert(",
    ".rpc(",
    "functions.invoke",
    "ai-doctor-review",
    "ai-coach",
    "action_queue",
    "alerts.insert",
    "sendDeviceCommand",
    "service_role",
    "PASSKEY",
    "Authorization:",
    "Bearer ",
    "vbt_",
    "raw_payload",
    "XLSX import",
    "Excel import",
    "Upload spreadsheet",
    "Import readings from XLSX",
    "Genetics XLSX",
  ];

  for (const f of FILES) {
    it(`${f} has no forbidden write paths, secrets, or import CTAs`, () => {
      const src = read(f);
      for (const p of forbidden) {
        expect(src, `${f}: contains forbidden "${p}"`).not.toContain(p);
      }
      expect(src).not.toMatch(/method:\s*["']POST["']/);
      expect(src).not.toMatch(/device[_-]?control/i);
    });
  }

  it("legend tooltip wires the exact canonical copy", () => {
    const labels = read("src/constants/sensorSourceLabels.ts");
    expect(labels).toMatch(/Connected sensor ingest received from an active source/);
    expect(labels).toMatch(/Grower-entered reading or snapshot/);
    expect(labels).toMatch(/Explicitly labeled historical CSV context/);
    expect(labels).toMatch(/Sample\/demo data shown only in demo mode/);
    expect(labels).toMatch(/Previously valid reading that is too old/);
    expect(labels).toMatch(/Missing, malformed, unknown, or suspicious telemetry/);
  });
});
