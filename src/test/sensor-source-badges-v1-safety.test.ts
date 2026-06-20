import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/sensorSnapshotFreshnessRules.ts",
  "src/components/SensorSnapshotCard.tsx",
];

const FORBIDDEN = [
  /\.from\(["'`]/, // supabase writes
  /\binsert\(/,
  /\bupdate\(/,
  /\bupsert\(/,
  /\bdelete\(/,
  /\.rpc\(/,
  /supabase\.functions/,
  /service_role/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /raw_payload/,
  /action_queue/,
  /execute_device|setpoint_write|irrigation_control|light_control|fan_control/,
  /openai|gemini|anthropic|lovable-ai/i,
  /fetch\(/,
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("sensor source badges v1 — safety boundary", () => {
  for (const rel of FILES) {
    it(`${rel} contains no forbidden patterns`, () => {
      const src = stripComments(
        readFileSync(resolve(process.cwd(), rel), "utf8"),
      );
      for (const pattern of FORBIDDEN) {
        expect(
          pattern.test(src),
          `Forbidden pattern ${pattern} found in ${rel}`,
        ).toBe(false);
      }
    });
  }
});
