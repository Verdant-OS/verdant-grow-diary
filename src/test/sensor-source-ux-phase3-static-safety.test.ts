/**
 * sensor-source-ux-phase3-static-safety — guards new Phase 3 surfaces
 * (URL helper, inline legend, clickable summary, plant breakdown) from
 * introducing write paths, AI calls, alerts, Action Queue writes,
 * device control, or secret/raw_payload leaks, and from reintroducing
 * the operator XLSX/spreadsheet import surfaces.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "src/lib/sensorSourceUrlRules.ts",
  "src/components/SensorSourceInlineLegend.tsx",
  "src/components/SensorSourceSummaryWidget.tsx",
  "src/components/PlantSensorSourceBreakdownCard.tsx",
];

function read(p: string) {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("Sensor Source UX Phase 3 — static safety", () => {
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

  it("PlantSensorSourceBreakdownCard only reads diary_entries (no writes)", () => {
    const src = read("src/components/PlantSensorSourceBreakdownCard.tsx");
    expect(src).toContain('.from("diary_entries")');
    expect(src).toContain(".select(");
    // Exactly one .from() call (the read).
    expect((src.match(/\.from\(/g) ?? []).length).toBe(1);
  });
});
