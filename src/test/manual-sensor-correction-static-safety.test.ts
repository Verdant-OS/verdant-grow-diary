/**
 * Static safety scan — Manual Sensor Correction wiring.
 *
 * Guards the correction save + deep-link surface from regressing into:
 *  - sensor_readings updates/deletes/upserts (originals must stay intact)
 *  - service_role in the client
 *  - action_queue / alerts / ai_doctor writes from the correction flow
 *  - any source_after other than "manual"
 *  - functions.invoke / device-control strings
 *
 * These scans are cheap and pin the invariants that make the manual
 * correction trail append-only and non-destructive.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const TARGETS: Array<{ name: string; path: string; scope: "lib" | "hook" | "ui" }> = [
  {
    name: "manualSensorCorrectionContext",
    path: "src/lib/manualSensorCorrectionContext.ts",
    scope: "lib",
  },
  {
    name: "insertManualSensorReadingReturningId",
    path: "src/lib/insertManualSensorReadingReturningId.ts",
    scope: "lib",
  },
  {
    name: "useInsertManualSnapshotEdit",
    path: "src/hooks/useInsertManualSnapshotEdit.ts",
    scope: "hook",
  },
  {
    name: "ManualSensorReadingCard",
    path: "src/components/ManualSensorReadingCard.tsx",
    scope: "ui",
  },
  {
    name: "ManualSnapshotTimelineCard",
    path: "src/components/ManualSnapshotTimelineCard.tsx",
    scope: "ui",
  },
  {
    name: "QuickLogSensorSnapshotStrip",
    path: "src/components/QuickLogSensorSnapshotStrip.tsx",
    scope: "ui",
  },
];

describe("manual sensor correction — static safety", () => {
  for (const t of TARGETS) {
    const src = read(t.path);

    it(`${t.name}: no sensor_readings.update/delete/upsert`, () => {
      // The correction flow only inserts new manual rows. It must never
      // mutate or delete an existing sensor_readings row.
      expect(src).not.toMatch(/sensor_readings[\s\S]{0,80}\.update\(/);
      expect(src).not.toMatch(/sensor_readings[\s\S]{0,80}\.delete\(/);
      expect(src).not.toMatch(/sensor_readings[\s\S]{0,80}\.upsert\(/);
      // Belt-and-suspenders: no bare .update/.delete/.upsert on any table
      // in the pure lib/hook layers.
      if (t.scope !== "ui") {
        expect(src).not.toMatch(/\.update\(/);
        expect(src).not.toMatch(/\.delete\(/);
        expect(src).not.toMatch(/\.upsert\(/);
      }
    });

    it(`${t.name}: no service_role / functions.invoke`, () => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/functions\.invoke/);
    });

    it(`${t.name}: no action_queue / alerts / ai_doctor writes`, () => {
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
    });

    it(`${t.name}: source_after never leaves "manual"`, () => {
      // Any explicit source_after must be the manual literal — nothing
      // else. (Absence of source_after is fine; it's set by the rules
      // helper which is separately guarded.)
      const matches = src.match(/source_after\s*:\s*["'][^"']+["']/g) ?? [];
      for (const m of matches) {
        expect(m).toMatch(/source_after\s*:\s*["']manual["']/);
      }
    });

    it(`${t.name}: no device-control / automation strings`, () => {
      expect(src).not.toMatch(
        /\b(?:executeDeviceCommand|deviceControl|fanOn|pumpOn|lightOn|relay|mqtt|home_assistant|pi_bridge|actuator)\b/i,
      );
    });
  }
});
