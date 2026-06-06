/**
 * Static regression: the ai-coach edge function must build its sensor
 * context through the shared source-aware helper, must pick the newest
 * snapshot by captured_at, must surface plant medium + pot_size, and
 * must never forward the raw sensor_snapshot blob to the model.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/ai-coach/index.ts"),
  "utf8",
);

describe("ai-coach edge function — wiring regression", () => {
  it("imports the shared source-aware annotator", () => {
    expect(SRC).toMatch(/buildAiSensorSnapshotContext/);
    expect(SRC).toMatch(/sensorSnapshotContextRules/);
  });

  it("selects the latest snapshot via the captured_at picker (not array order)", () => {
    expect(SRC).toMatch(/pickLatestSensorSnapshotByCapturedAt/);
    // No legacy "first row with a sensor_snapshot" loop.
    expect(SRC).not.toMatch(/for\s*\(\s*const\s+row\s+of\s+entries\s*\)\s*\{\s*const\s+snap\s*=/);
  });

  it("pushes annotationLine, safetyNotes, and missingInformationHints into model context", () => {
    expect(SRC).toMatch(/snapshotCtx\.annotationLine/);
    expect(SRC).toMatch(/snapshotCtx\.safetyNotes/);
    expect(SRC).toMatch(/snapshotCtx\.missingInformationHints/);
  });

  it("never JSON.stringifies the raw latestSnapshot into the context", () => {
    expect(SRC).not.toMatch(/JSON\.stringify\(\s*latestSnapshot/);
    // Context lines must not contain "sensor_snapshot" or "raw_payload"
    // literal keys forwarded into the model prompt.
    const ctxLineLiterals = SRC.match(/ctxLines\.push\([^)]*\)/g) ?? [];
    for (const lit of ctxLineLiterals) {
      expect(lit).not.toMatch(/sensor_snapshot/);
      expect(lit).not.toMatch(/raw_payload/);
    }
  });

  it("selects plant medium and pot_size from the plants query", () => {
    expect(SRC).toMatch(/\.select\(\s*["'][^"']*\bmedium\b[^"']*\bpot_size\b/);
  });

  it("renders medium and pot_size into the per-entry plant context string", () => {
    expect(SRC).toMatch(/medium=\$\{plant\.medium\}/);
    expect(SRC).toMatch(/pot_size=\$\{plant\.pot_size\}/);
  });

  it("contains no leaked secrets or imperative device-control wording", () => {
    // NOTE: the model system-prompt legitimately INSTRUCTS the model
    // not to "actuate fans/lights/..." — that defensive wording is
    // expected. We only forbid imperative device-control commands.
    const FORBIDDEN = [
      /\bservice_role\b/i,
      /\bvbt_/i,
      /\bbearer\s+[A-Za-z0-9]/i,
      /\bturn on the (fan|light|pump|heater|humidifier|dehumidifier)\b/i,
      /\bturn off the (fan|light|pump|heater|humidifier|dehumidifier)\b/i,
    ];
    for (const re of FORBIDDEN) expect(SRC).not.toMatch(re);
  });
});
