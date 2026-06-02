/**
 * Static safety scan — AI Doctor Context panel surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const TARGETS = [
  { name: "aiDoctorContextRules", path: "src/lib/aiDoctorContextRules.ts" },
  {
    name: "aiDoctorContextViewModel",
    path: "src/lib/aiDoctorContextViewModel.ts",
  },
  {
    name: "PlantDetailAiDoctorContextPanel",
    path: "src/components/PlantDetailAiDoctorContextPanel.tsx",
  },
  {
    name: "CoachAiDoctorContextPanel",
    path: "src/components/CoachAiDoctorContextPanel.tsx",
  },
  {
    name: "aiDoctorContextReadiness",
    path: "src/constants/aiDoctorContextReadiness.ts",
  },
  {
    name: "aiDoctorContextQuickActionsViewModel",
    path: "src/lib/aiDoctorContextQuickActionsViewModel.ts",
  },
  {
    name: "AiDoctorContextQuickActions",
    path: "src/components/AiDoctorContextQuickActions.tsx",
  },
  {
    name: "aiDoctorReadinessGateViewModel",
    path: "src/lib/aiDoctorReadinessGateViewModel.ts",
  },
  {
    name: "PlantDetailAiDoctorReadinessGate",
    path: "src/components/PlantDetailAiDoctorReadinessGate.tsx",
  },
];

describe("ai doctor context panel — static safety", () => {
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

    it(`${t.name}: no action_queue / alerts / ai_doctor_sessions / sensor_readings writes`, () => {
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });

    it(`${t.name}: no live/synced/connected/imported wording`, () => {
      expect(src).not.toMatch(/['"]live['"]/);
      expect(src).not.toMatch(/['"]synced['"]/);
      expect(src).not.toMatch(/['"]connected['"]/);
      expect(src).not.toMatch(/['"]imported['"]/);
    });

    it(`${t.name}: never claims a diagnosis`, () => {
      expect(src).not.toMatch(/has diagnosed/i);
      expect(src).not.toMatch(/AI diagnosed/i);
    });
  }

  it("UI does not duplicate readiness rules or tooltip table", () => {
    const panels = [
      read("src/components/PlantDetailAiDoctorContextPanel.tsx"),
      read("src/components/CoachAiDoctorContextPanel.tsx"),
      read("src/components/AiDoctorContextQuickActions.tsx"),
    ];
    for (const ui of panels) {
      expect(ui).not.toMatch(/AI_DOCTOR_RECENT_WINDOW_MS\s*=/);
      expect(ui).not.toMatch(/AI_DOCTOR_SNAPSHOT_FRESH_MS\s*=/);
      expect(ui).not.toMatch(/AI_DOCTOR_CONTEXT_TOOLTIPS\s*=/);
      expect(ui).not.toMatch(/AI_DOCTOR_CONTEXT_READINESS_CONFIG\s*=/);
    }
  });

  it("UI does not duplicate the missing-context → quick-action mapping table", () => {
    const panels = [
      read("src/components/PlantDetailAiDoctorContextPanel.tsx"),
      read("src/components/CoachAiDoctorContextPanel.tsx"),
      read("src/components/AiDoctorContextQuickActions.tsx"),
    ];
    for (const ui of panels) {
      expect(ui).not.toMatch(/MISSING_CODE_TO_ACTION\s*=/);
      // Quick-action labels live in the view-model, not in JSX.
      expect(ui).not.toMatch(/"Edit plant details"/);
      expect(ui).not.toMatch(/"Add note"/);
      expect(ui).not.toMatch(/"Add sensor snapshot"/);
      expect(ui).not.toMatch(/"Add photo"/);
    }
  });
});
