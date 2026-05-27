/**
 * Static safety scan for the Sensor Source Health presenter. Forbids any
 * write paths (inserts/updates/deletes), alert/action_queue/device-control
 * strings, and service_role usage from leaking into client code.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/sensorSourceHealthRules.ts",
  "src/components/TentSensorSourceHealthCard.tsx",
];

const BANNED = [
  ".insert(",
  ".update(",
  ".upsert(",
  ".delete(",
  "service_role",
  "SERVICE_ROLE",
  "from(\"alerts\")",
  "from('alerts')",
  "from(\"action_queue\")",
  "from('action_queue')",
  "device_control",
  "automation",
  "/lights/",
  "/fans/",
  "/pumps/",
];

describe("sensor-source-health: static safety", () => {
  for (const file of FILES) {
    it(`${file} contains no forbidden write/alert/device-control strings`, () => {
      const body = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const needle of BANNED) {
        expect(body, `${file} must not contain "${needle}"`).not.toContain(needle);
      }
    });
  }
});
