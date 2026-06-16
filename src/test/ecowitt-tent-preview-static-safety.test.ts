// Static safety guard for the EcoWitt multi-tent preview + router slice.
// Fails if any of the new files import or call Supabase writes, Edge invokes,
// alert/Action Queue/AI/device-control helpers.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const FILES = [
  "src/lib/ecowittTentSnapshot.ts",
  "src/lib/ecowittSeedlingTentNormalizer.ts",
  "src/lib/ecowittVegetationTentNormalizer.ts",
  "src/lib/ecowittTentNormalizerRouter.ts",
  "src/lib/ecowittTentPreviewViewModel.ts",
  "src/pages/OperatorEcowittTentPreview.tsx",
];

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "supabase client import", re: /@\/integrations\/supabase\/client/ },
  { name: "functions.invoke", re: /functions\s*\.\s*invoke\s*\(/ },
  { name: ".insert(", re: /\.\s*insert\s*\(/ },
  { name: ".update(", re: /\.\s*update\s*\(/ },
  { name: ".upsert(", re: /\.\s*upsert\s*\(/ },
  { name: ".delete(", re: /\.\s*delete\s*\(/ },
  { name: "rpc(", re: /\.\s*rpc\s*\(/ },
  { name: "alert helper", re: /\b(createAlert|insertAlert|raiseAlert)\b/ },
  { name: "action queue write", re: /\b(createActionQueueItem|enqueueAction|insertActionQueue)\b/ },
  { name: "ai/model helper", re: /\b(callAiDoctor|invokeAi|openai|anthropic|lovable-ai)\b/i },
  { name: "device control", re: /\b(deviceControl|controlDevice|setRelay|fanOn|fanOff|lightOn|lightOff|pumpOn|pumpOff)\b/ },
];

describe("EcoWitt multi-tent preview/router static safety guard", () => {
  for (const rel of FILES) {
    it(`${rel} contains no forbidden write/automation references`, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      // Strip line comments and block comments so doc safety notes don't trip the scan.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, ""))
        .join("\n");
      const hits = FORBIDDEN_PATTERNS.filter((p) => p.re.test(stripped)).map((p) => p.name);
      expect(hits, `${rel} matched: ${hits.join(", ")}`).toEqual([]);
    });
  }
});
