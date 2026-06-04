import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/csvImportPlanRules.ts",
  "src/lib/csvImportIdempotency.ts",
];

const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/from\(\s*["']alerts["']\s*\)/, "alerts table reference"],
  [/from\(\s*["']action_queue["']\s*\)/, "action_queue table reference"],
  [/functions\.invoke/, "edge function invocation"],
  [/\.rpc\(/, "rpc call"],
  [/\.insert\(/, "insert call"],
  [/\.update\(/, "update call"],
  [/\.upsert\(/, "upsert call"],
  [/\.delete\(/, "delete call"],
  [/service_role/i, "service_role reference"],
  [/\bfetch\(/, "fetch call"],
  [/XMLHttpRequest/, "XHR"],
  [/sendBeacon/, "sendBeacon"],
  // Device control / automation execution language. The rules module is
  // allowed to *name* these patterns in its block list, so we look for verbs
  // that imply execution rather than mere naming.
  [/turn(On|Off)Device|controlDevice|executeDeviceCommand|dispatchActuator|engageAutopilot|startAutomation/i, "device control execution"],
];

describe("csv import planning — static safety scanner", () => {
  for (const rel of FILES) {
    it(`${rel} contains no forbidden write/IO patterns`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const [pat, label] of FORBIDDEN_PATTERNS) {
        expect(
          pat.test(src),
          `${rel} unexpectedly matched ${label} via ${pat}`,
        ).toBe(false);
      }
    });
  }
});
