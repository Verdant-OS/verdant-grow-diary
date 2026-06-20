/**
 * Static safety scan for sensor snapshot / manual sensor presenter
 * components. Verdant snapshot surfaces must never:
 *   - render raw payload internals, secrets, or bridge tokens
 *   - introduce client-side writes / device-control / automation
 *   - label manual / csv / demo / stale / invalid data as Live
 *
 * This file is intentionally static — it reads source as text and asserts
 * forbidden patterns are absent. It does not import or execute presenters.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const PRESENTERS = [
  "src/components/SensorSnapshotTruthStrip.tsx",
  "src/components/PlantManualSensorFreshnessCard.tsx",
  "src/components/ManualSnapshotTimelineSection.tsx",
  "src/components/ManualSnapshotTimelineCard.tsx",
  // ManualSensorReadingCard is intentionally excluded: it is the Quick Log
  // *input* form (writes a manual reading via the audited save hook), not a
  // read-only snapshot presenter.

  "src/components/ManualSensorSnapshotQualityBadge.tsx",
  "src/components/QuickLogSensorSnapshotStrip.tsx",
  "src/components/SensorSnapshotPreview.tsx",
  "src/components/EcowittLatestSnapshotCard.tsx",
  "src/components/EcowittTimelineSnapshotChip.tsx",
  "src/components/PlantStatusStrip.tsx",
  "src/components/PlantQuickStatusStrip.tsx",
  "src/components/PlantTentEnvironmentPanel.tsx",
] as const;

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

// Strip line/block comments so test docstrings ("Never renders raw_payload")
// don't trip the static scan.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("sensor snapshot presenter safety — static scan", () => {
  describe.each(PRESENTERS)("%s", (file) => {
    const raw = read(file);
    const code = stripComments(raw);

    it("does not render raw payload or private telemetry internals", () => {
      // Allow narrow, audited reads of `rawPayload` for metadata extraction
      // (e.g. EcowittLatestSnapshotCard surfaces only transport + test_sender
      // booleans). The forbidden pattern is rendering the payload itself.
      expect(code).not.toMatch(/JSON\.stringify\s*\(\s*[a-zA-Z_.]*raw_?[Pp]ayload/);
      expect(code).not.toMatch(/\{[^}]*raw_payload[^}]*\}\s*<\//);
    });

    it("does not reference secrets / tokens / service role", () => {
      for (const needle of [
        "service_role",
        "SUPABASE_SERVICE_ROLE",
        "bridge_token",
        "BRIDGE_TOKEN",
        "api_key",
        "API_KEY",
        "access_token",
        "refresh_token",
      ]) {
        expect(code, `${file} should not reference ${needle}`).not.toContain(
          needle,
        );
      }
    });

    it("does not introduce writes, device control, or automation", () => {
      for (const needle of [
        "insertSensorReading",
        "useInsertSensorReading(",
        ".insert(",
        ".upsert(",
        ".update(",
        ".delete(",
        ".upload(",
        "functions.invoke",
        'from("sensor_readings").insert',
        'from("action_queue")',
        'from("alerts")',
        "device control",
        "deviceControl",
        "automation",
      ]) {
        expect(code, `${file} should not contain ${needle}`).not.toContain(
          needle,
        );
      }
    });

    it("does not label non-live data as Live via a default fallback", () => {
      // Catches `?? "Live"` / `|| "Live"` patterns that quietly promote
      // unknown / manual / csv data to a Live label.
      expect(code).not.toMatch(/\?\?\s*"Live"/);
      expect(code).not.toMatch(/\|\|\s*"Live"/);
    });
  });
});

describe("sensor snapshot read model — truth vocabulary", () => {
  const readModel = read("src/lib/sensors/sensorSnapshotReadModel.ts");

  it("never classifies invalid / unknown telemetry as healthy", () => {
    expect(readModel).not.toMatch(/"healthy"/i);
  });

  it("preserves preview-only / read-only language", () => {
    expect(readModel).toMatch(/Read-only/);
  });
});
