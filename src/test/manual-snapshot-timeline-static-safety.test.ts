/**
 * Static safety scan — manual snapshot timeline rendering surface.
 *
 * UI/adapter/hook/merge files must not duplicate metric validation tables,
 * must not write to the DB, and must not introduce live/synced/connected/
 * imported labeling for manual snapshots.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const TARGETS = [
  { name: "ManualSnapshotTimelineCard", path: "src/components/ManualSnapshotTimelineCard.tsx" },
  { name: "ManualSnapshotTimelineSection", path: "src/components/ManualSnapshotTimelineSection.tsx" },
  { name: "useManualSnapshotTimelineCards", path: "src/hooks/useManualSnapshotTimelineCards.ts" },
  { name: "manualSnapshotDiaryAdapter", path: "src/lib/manualSnapshotDiaryAdapter.ts" },
  { name: "manualSnapshotTimelineMerge", path: "src/lib/manualSnapshotTimelineMerge.ts" },
];

describe("manual snapshot timeline — static safety", () => {
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

    it(`${t.name}: no action_queue / alerts / ai_doctor writes`, () => {
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/ai_doctor_sessions/);
    });

    it(`${t.name}: no live/synced/connected/imported labeling`, () => {
      expect(src).not.toMatch(/=\s*['"]live['"]/);
      expect(src).not.toMatch(/source:\s*['"]live['"]/);
      expect(src).not.toMatch(/['"]synced['"]/);
      expect(src).not.toMatch(/['"]connected['"]/);
      expect(src).not.toMatch(/['"]imported['"]/);
    });
  }

  it("UI files do not duplicate metric-to-unit mapping tables", () => {
    const uiFiles = [
      "src/components/ManualSnapshotTimelineCard.tsx",
      "src/components/ManualSnapshotTimelineSection.tsx",
    ];
    for (const f of uiFiles) {
      const src = read(f);
      // The validator owns these unit/field strings. UI files should never
      // re-spell them as inline maps.
      expect(src).not.toMatch(/['"]air_temp_c['"]\s*:\s*['"]°C['"]/);
      expect(src).not.toMatch(/['"]humidity_pct['"]\s*:\s*['"]%['"]/);
      expect(src).not.toMatch(/PH_REALISTIC_RANGE/);
      expect(src).not.toMatch(/EC_SUSPICIOUS_MSCM_MAX/);
    }
  });
});
