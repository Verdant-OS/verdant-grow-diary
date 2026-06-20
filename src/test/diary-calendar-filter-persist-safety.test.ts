/**
 * Static safety: persistence helper + DiaryCalendarSection must not
 * import Supabase clients, AI helpers, write helpers, or device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FORBIDDEN = [
  "@/integrations/supabase",
  "supabase-js",
  "openai",
  "ai-doctor",
  "actionQueue",
  "alerts/write",
  "deviceControl",
  "sensor_readings",
];

const FILES = [
  "src/lib/diaryCalendarFilterPersistence.ts",
  "src/lib/diaryCalendarViewModel.ts",
  "src/components/DiaryCalendarSection.tsx",
];

describe("Diary Calendar persistence + expansion — static safety", () => {
  for (const f of FILES) {
    it(`${f} contains no forbidden imports`, () => {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      for (const needle of FORBIDDEN) {
        expect(src, `${f} must not reference ${needle}`).not.toContain(needle);
      }
    });
  }
});
