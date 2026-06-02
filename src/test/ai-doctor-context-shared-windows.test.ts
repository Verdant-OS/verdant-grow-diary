/**
 * Confirms that the AI Doctor Context readiness rules, drilldown copy,
 * and tooltip help all consume the same recency-window constants from
 * `src/constants/aiDoctorContextReadiness.ts` — no panel may hard-code
 * its own window or duplicate the tooltip table.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS,
  AI_DOCTOR_SNAPSHOT_FRESH_HOURS,
  AI_DOCTOR_CONTEXT_READINESS_CONFIG,
  AI_DOCTOR_CONTEXT_TOOLTIPS,
} from "@/constants/aiDoctorContextReadiness";
import {
  AI_DOCTOR_RECENT_WINDOW_MS,
  AI_DOCTOR_SNAPSHOT_FRESH_MS,
} from "@/lib/aiDoctorContextRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("AI Doctor Context — shared recency-window constants", () => {
  it("rules re-export the shared window/freshness thresholds", () => {
    expect(AI_DOCTOR_RECENT_WINDOW_MS).toBe(
      AI_DOCTOR_CONTEXT_READINESS_CONFIG.recentEventWindowMs,
    );
    expect(AI_DOCTOR_SNAPSHOT_FRESH_MS).toBe(
      AI_DOCTOR_CONTEXT_READINESS_CONFIG.snapshotFreshMs,
    );
  });

  it("shared window matches documented 7 days / 48 hours", () => {
    expect(AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS).toBe(7);
    expect(AI_DOCTOR_SNAPSHOT_FRESH_HOURS).toBe(48);
    expect(AI_DOCTOR_CONTEXT_READINESS_CONFIG.recentEventWindowMs).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
    expect(AI_DOCTOR_CONTEXT_READINESS_CONFIG.snapshotFreshMs).toBe(
      48 * 60 * 60 * 1000,
    );
  });

  it("tooltip copy references the shared 7d / 48h windows", () => {
    expect(AI_DOCTOR_CONTEXT_TOOLTIPS["recent-timeline-activity"]).toMatch(/7 days/);
    expect(AI_DOCTOR_CONTEXT_TOOLTIPS["fresh-manual-sensor-snapshot"]).toMatch(/48 hours/);
  });

  it("no panel/component file hard-codes the window in ms", () => {
    const files = [
      "src/components/PlantDetailAiDoctorContextPanel.tsx",
      "src/components/CoachAiDoctorContextPanel.tsx",
      "src/components/AiDoctorContextQuickActions.tsx",
      "src/lib/aiDoctorContextQuickActionsViewModel.ts",
    ];
    for (const f of files) {
      const src = read(f);
      // 7d = 604800000 ms, 48h = 172800000 ms — must not be inlined.
      expect(src).not.toMatch(/604800000/);
      expect(src).not.toMatch(/172800000/);
    }
  });
});
