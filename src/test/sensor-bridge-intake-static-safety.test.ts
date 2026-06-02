/**
 * Static safety scan for the Sensor Bridge Intake Contract v1.
 *
 * Hard rules:
 *  - No DB writes / rpc.
 *  - No frontend exposure of service_role / API keys / bridge tokens.
 *  - No device-control language or automation/autopilot wording.
 *  - No raw payload logging.
 *  - No writes to alerts / action_queue / ai_doctor_sessions / sensor_readings.
 *  - No fake-live wording in source code (strings the user sees about
 *    "live"/"connected" must be source-honest — value comes from the
 *    resolver, not from string constants).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const FILES = [
  "src/lib/sensorBridgeIntakeRules.ts",
  "src/lib/sensorBridgeIntakeViewModel.ts",
];

describe("sensor bridge intake — static safety", () => {
  for (const path of FILES) {
    const src = read(path);

    it(`${path}: no DB writes / rpc`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/functions\.invoke/);
    });

    it(`${path}: no secrets / service_role / API keys / bridge tokens`, () => {
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(src).not.toMatch(/LOVABLE_API_KEY/);
      expect(src).not.toMatch(/sk-[a-z0-9-]+/i);
      expect(src).not.toMatch(/Bearer\s+/);
      expect(src).not.toMatch(/vbt_[a-z0-9]/i);
      expect(src).not.toMatch(/bridge_token_hash|token_hash/);
    });

    it(`${path}: no writes to alerts / action_queue / ai_doctor_sessions / sensor_readings`, () => {
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });

    it(`${path}: no device-control / automation / autopilot wording`, () => {
      expect(src).not.toMatch(/\bautopilot\b/i);
      expect(src).not.toMatch(/\bcontrol enabled\b/i);
      expect(src).not.toMatch(/\bdevice connected\b/i);
      expect(src).not.toMatch(/\b(turn on|switch off|power the|toggle the)\b/i);
      expect(src).not.toMatch(/\bautomation\b/i);
    });

    it(`${path}: no raw payload logging`, () => {
      const logCalls = src.match(/console\.(log|warn|info|debug|error)\([^)]*\)/g) ?? [];
      for (const call of logCalls) {
        expect(call).not.toMatch(/payload|raw|token|secret|JSON\.stringify/i);
      }
    });

    it(`${path}: does not import supabase client or fetch network`, () => {
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
    });
  }
});
