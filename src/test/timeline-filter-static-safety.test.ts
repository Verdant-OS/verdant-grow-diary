/**
 * Static safety scan — timeline filter surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const TARGETS = [
  { name: "timelineFilterRules", path: "src/lib/timelineFilterRules.ts" },
  { name: "timelineFilterViewModel", path: "src/lib/timelineFilterViewModel.ts" },
  { name: "useTimelineMemory", path: "src/hooks/useTimelineMemory.ts" },
  { name: "TimelineFilterBar", path: "src/components/TimelineFilterBar.tsx" },
  { name: "TimelineMemorySection", path: "src/components/TimelineMemorySection.tsx" },
];

describe("timeline filter — static safety", () => {
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

    it(`${t.name}: no action_queue / alerts / ai_doctor_sessions writes (reads to ai_doctor_sessions allowed for frozen timeline audit projection)`, () => {
      // action_queue and alerts: any reference / write forbidden in timeline surface.
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);

      // ai_doctor_sessions: writes forbidden, reads (select/eq/not/order/limit) allowed.
      // Block every write-shape that could target ai_doctor_sessions.
      const aiDoctorWriteShapes = [
        /ai_doctor_sessions[^)]*\)\s*\.\s*insert\(/,
        /ai_doctor_sessions[^)]*\)\s*\.\s*upsert\(/,
        /ai_doctor_sessions[^)]*\)\s*\.\s*update\(/,
        /ai_doctor_sessions[^)]*\)\s*\.\s*delete\(/,
        /\.rpc\([^)]*ai_doctor_sessions/,
        /functions\.invoke\([^)]*ai_doctor_sessions/,
      ];
      for (const re of aiDoctorWriteShapes) {
        expect(src).not.toMatch(re);
      }
    });

    it(`${t.name}: no live/synced/connected/imported labeling`, () => {
      expect(src).not.toMatch(/=\s*['"]live['"]/);
      expect(src).not.toMatch(/source:\s*['"]live['"]/);
      expect(src).not.toMatch(/['"]synced['"]/);
      expect(src).not.toMatch(/['"]connected['"]/);
      expect(src).not.toMatch(/['"]imported['"]/);
    });
  }

  it("UI files do not duplicate manual snapshot metric/validation tables", () => {
    const uiFiles = [
      "src/components/TimelineFilterBar.tsx",
      "src/components/TimelineMemorySection.tsx",
    ];
    for (const f of uiFiles) {
      const src = read(f);
      expect(src).not.toMatch(/['"]air_temp_c['"]\s*:\s*['"]°C['"]/);
      expect(src).not.toMatch(/['"]humidity_pct['"]\s*:\s*['"]%['"]/);
      expect(src).not.toMatch(/PH_REALISTIC_RANGE/);
      expect(src).not.toMatch(/EC_SUSPICIOUS_MSCM_MAX/);
    }
  });
});
