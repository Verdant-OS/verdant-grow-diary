/**
 * quick-log-sensor-snapshot-view-model-safety — static guard ensuring
 * the additive Quick Log snapshot view-model never reintroduces unsafe
 * patterns (Supabase writes, RPCs, AI calls, Action Queue writes,
 * device control, secrets, raw_payload).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = "src/lib/quickLogSensorSnapshotViewModel.ts";

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\.from\(["'`]/, "supabase .from() call"],
  [/\binsert\(/, "insert()"],
  [/\bupdate\(/, "update()"],
  [/\bupsert\(/, "upsert()"],
  [/\bdelete\(/, "delete()"],
  [/\.rpc\(/, "rpc()"],
  [/supabase\.functions/, "edge function invoke"],
  [/service_role/i, "service_role reference"],
  [/SUPABASE_SERVICE_ROLE_KEY/, "service role key"],
  [/action_queue/, "action_queue reference"],
  [
    /execute_device|setpoint_write|irrigation_control|light_control|fan_control/,
    "device control term",
  ],
  [/openai|gemini|anthropic|lovable-ai/i, "AI call"],
  [/fetch\(/, "network fetch"],
  [/Date\.now\(/, "Date.now() inside pure view-model"],
];

function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("quickLogSensorSnapshotViewModel — safety boundary", () => {
  const src = strip(readFileSync(resolve(process.cwd(), FILE), "utf8"));

  for (const [pattern, label] of FORBIDDEN) {
    it(`does not contain ${label}`, () => {
      expect(pattern.test(src)).toBe(false);
    });
  }
});
