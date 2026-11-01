/**
 * A missing plant must never resolve a legacy Quick Log write with plantId "".
 * Main FIX REQUEST #2643 item 1 (P2-2): the missing_plant block is restored.
 */
import { describe, expect, it } from "vitest";
import {
  resolveQuickLogWriteTarget,
  type QuickLogTargetTent,
} from "@/lib/quickLogTargetIntegrityRules";

const activeTent: QuickLogTargetTent = { id: "t1", grow_id: "g1" } as QuickLogTargetTent;
const archivedTent = { id: "t2", grow_id: "g1", is_archived: true } as QuickLogTargetTent;
const otherGrowTent = { id: "t3", grow_id: "g2" } as QuickLogTargetTent;

const missingPlants = [null, undefined, { id: "" }, { id: "   " }, { id: 42 }] as const;
const tentsToTry = [activeTent, archivedTent, otherGrowTent, null, undefined];

describe("resolveQuickLogWriteTarget — missing plant", () => {
  for (const selectedPlant of missingPlants) {
    for (const selectedTent of tentsToTry) {
      for (const requireTent of [true, false, undefined]) {
        it(`blocks plant=${JSON.stringify(selectedPlant)} tent=${selectedTent?.id ?? selectedTent} requireTent=${requireTent}`, () => {
          const result = resolveQuickLogWriteTarget({
            activeGrowId: "g1",
            selectedPlant: selectedPlant as any,
            selectedTent,
            requireTent,
          });
          expect(result).toEqual({ status: "blocked", reason: "missing_plant" });
        });
      }
    }
  }
});
