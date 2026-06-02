/**
 * Static safety scan — Manual Sensor Snapshot rules + view model.
 *
 * Asserts these pure files never introduce live labeling, device-control
 * calls, automated action_queue/alerts writes, or Supabase writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const TARGETS = [
  { name: "manualSensorSnapshotRules", path: "src/lib/manualSensorSnapshotRules.ts" },
  { name: "manualSensorSnapshotViewModel", path: "src/lib/manualSensorSnapshotViewModel.ts" },
];

describe("manual sensor snapshot — static safety", () => {
  for (const t of TARGETS) {
    const src = read(t.path);

    it(`${t.name}: no DB writes`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    });

    it(`${t.name}: no functions.invoke / service_role`, () => {
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/service_role/);
    });

    it(`${t.name}: no live source labeling`, () => {
      // No code path should classify a snapshot as "live".
      expect(src).not.toMatch(/=\s*['"]live['"]/);
      expect(src).not.toMatch(/source:\s*['"]live['"]/);
    });

    it(`${t.name}: no automated action_queue / alerts / ai_doctor writes`, () => {
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/ai_doctor_sessions/);
    });

    it(`${t.name}: no device-control / automation calls`, () => {
      expect(src).not.toMatch(/\b(?:executeDeviceCommand|deviceControl|fanOn|pumpOn|lightOn|relay)\b/);
    });
  }
});
