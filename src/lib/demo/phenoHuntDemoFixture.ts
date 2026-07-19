/**
 * phenoHuntDemoFixture — a full, start-to-finish demonstration pheno hunt.
 *
 * A realistic hunt of a seed pack from pop → triage → keepers → clones →
 * crosses, built to exercise every pheno surface (candidate board, scoring
 * across rounds, keeper lineage, and the family tree). Pure data — no I/O, no
 * writes; it seeds nothing on its own.
 *
 * It reflects the build ethos deliberately:
 *  - reproducibility, not hype: keepers carry stability-run counts and a
 *    post-cure round; the "winner" score is a shortlist number, not a verdict;
 *  - honest provenance: some crosses intentionally have gaps (unknown pollen
 *    parent, a parent from another hunt, an unrecorded generation) so the
 *    family tree's honesty flags are demonstrably visible, not hidden.
 */
import type { PedigreeKeeperInput, PedigreeCrossInput } from "@/lib/phenoPedigreeViewModel";
import type { CloneInput } from "@/lib/phenoCloneTreeViewModel";

export type DemoVerdict = "keep" | "maybe" | "cull";

export interface DemoCandidate {
  readonly candidateNumber: number;
  readonly name: string;
  readonly strain: string;
  readonly aroma: readonly string[];
  readonly verdict: DemoVerdict;
  /** 0–100 shortlist composite (top-tier only). Never a verdict on its own. */
  readonly winnerScore: number;
  /** Loud axes captured at the plant (nose 0–10; others 0–10 pre-rescale). */
  readonly loud: { nose: number; resin: number; structure: number; yield: number; breeding: number };
  readonly tags: readonly string[];
  /** Rounds scored across the grow — the cure round is where it's decided. */
  readonly rounds: readonly ("veg" | "early_flower" | "mid_flower" | "late_flower" | "post_cure")[];
  readonly mother: boolean;
  readonly note: string;
}

export const DEMO_HUNT = {
  name: "Sunset Runtz F2 — pack hunt",
  grow: "Room A",
  tent: "Tent 2",
  packLabel: "Sunset Sherbert × Runtz F2",
  packSize: 8,
} as const;

/** Keeper ids (stable, referenced by clones + crosses below). */
const K_GAS = "keeper-gas-runtz";
const K_CAKE = "keeper-sherb-cake";

export const DEMO_CANDIDATES: readonly DemoCandidate[] = [
  { candidateNumber: 1, name: "Runtz #1", strain: "Sunset Runtz F2", aroma: ["candy", "fuel"],
    verdict: "cull", winnerScore: 41, loud: { nose: 5, resin: 4, structure: 4, yield: 6, breeding: 3 },
    tags: [], rounds: ["veg", "mid_flower"], mother: false, note: "Thin, faded early." },
  { candidateNumber: 2, name: "Runtz #2", strain: "Sunset Runtz F2", aroma: ["gas", "cookie"],
    verdict: "maybe", winnerScore: 62, loud: { nose: 7, resin: 6, structure: 6, yield: 6, breeding: 5 },
    tags: [], rounds: ["veg", "mid_flower", "late_flower"], mother: false, note: "Watch — decent nose, run again." },
  { candidateNumber: 3, name: "Gas Runtz", strain: "Sunset Runtz F2", aroma: ["diesel", "gas", "candy"],
    verdict: "keep", winnerScore: 88, loud: { nose: 9, resin: 8, structure: 7, yield: 7, breeding: 8 },
    tags: ["Resin bomb"], rounds: ["veg", "early_flower", "mid_flower", "late_flower", "post_cure"],
    mother: true, note: "Loud gas; held up post-cure across two runs." },
  { candidateNumber: 4, name: "Runtz #4", strain: "Sunset Runtz F2", aroma: ["sweet"],
    verdict: "cull", winnerScore: 30, loud: { nose: 4, resin: 3, structure: 5, yield: 4, breeding: 2 },
    tags: ["Herm"], rounds: ["veg", "mid_flower"], mother: false, note: "Nanners at week 6 — culled." },
  { candidateNumber: 5, name: "Runtz #5", strain: "Sunset Runtz F2", aroma: ["fruit", "cream"],
    verdict: "maybe", winnerScore: 58, loud: { nose: 6, resin: 6, structure: 6, yield: 7, breeding: 5 },
    tags: [], rounds: ["veg", "mid_flower", "late_flower"], mother: false, note: "Creamy; unremarkable nose." },
  { candidateNumber: 6, name: "Runtz #6", strain: "Sunset Runtz F2", aroma: ["earth"],
    verdict: "cull", winnerScore: 34, loud: { nose: 4, resin: 4, structure: 5, yield: 5, breeding: 3 },
    tags: ["Foxtail"], rounds: ["veg", "late_flower"], mother: false, note: "Foxtailed; weak." },
  { candidateNumber: 7, name: "Sherb Cake", strain: "Sunset Runtz F2", aroma: ["sherbet", "vanilla", "gas"],
    verdict: "keep", winnerScore: 84, loud: { nose: 8, resin: 9, structure: 7, yield: 6, breeding: 8 },
    tags: ["Resin bomb"], rounds: ["veg", "early_flower", "mid_flower", "late_flower", "post_cure"],
    mother: true, note: "Frostiest of the pack; reversed for feminized pollen." },
  { candidateNumber: 8, name: "Runtz #8", strain: "Sunset Runtz F2", aroma: ["candy", "berry"],
    verdict: "maybe", winnerScore: 60, loud: { nose: 7, resin: 5, structure: 6, yield: 7, breeding: 5 },
    tags: [], rounds: ["veg", "mid_flower", "late_flower"], mother: false, note: "Nice berry; average frost." },
];

/** Two keepers (mothers), with stability + reversal reflecting the ethos. */
export const DEMO_KEEPERS: readonly PedigreeKeeperInput[] = [
  { id: K_GAS, name: "Gas Runtz", sourceCandidateLabel: "#3 · Gas Runtz",
    reversed: true, reversalMethods: ["colloidal_silver"], cloneCount: 4, stabilityRunCount: 2 },
  { id: K_CAKE, name: "Sherb Cake", sourceCandidateLabel: "#7 · Sherb Cake",
    reversed: true, reversalMethods: ["sts"], cloneCount: 1, stabilityRunCount: 1 },
];

/** Clone lineage off Gas Runtz: mother → two cuts → one cut-of-cut. */
export const DEMO_CLONES: readonly CloneInput[] = [
  { id: "clone-gas-a", parentCloneId: null, cloneLabel: "Gas Runtz — mother cut", takenAt: "2026-04-01" },
  { id: "clone-gas-b", parentCloneId: "clone-gas-a", cloneLabel: "Gas Runtz — cut B", takenAt: "2026-05-10" },
  { id: "clone-gas-c", parentCloneId: "clone-gas-a", cloneLabel: "Gas Runtz — cut C", takenAt: "2026-05-12" },
  { id: "clone-gas-d", parentCloneId: "clone-gas-b", cloneLabel: "Gas Runtz — cut B.1", takenAt: "2026-06-20" },
];

/**
 * Crosses — a mix of fully-backed lineage and deliberate provenance GAPS so the
 * family tree's honesty flags are visible:
 *  - F1 + BX1: both parents are keepers → verified, edges drawn.
 *  - S1 + open pollination: a null pollen parent is HONEST → no flag.
 *  - "Cake × ?" (standard_f1, no male): unknown pollen parent → flagged.
 *  - "Outcross" (male from another hunt): parent_not_in_hunt → flagged.
 *  - "Gas BX?" (backcross, no generation): generation_unrecorded → flagged.
 */
export const DEMO_CROSSES: readonly PedigreeCrossInput[] = [
  { id: "cross-f1", crossName: "Gas Cake F1", crossType: "standard_f1",
    femaleKeeperId: K_GAS, maleKeeperId: K_CAKE, crossedAt: "2026-06-01" },
  { id: "cross-bx1", crossName: "Gas Cake BX1", crossType: "backcross", generation: 1,
    femaleKeeperId: K_CAKE, maleKeeperId: K_GAS, recurrentParentId: K_GAS, crossedAt: "2026-07-01" },
  { id: "cross-s1", crossName: "Gas Runtz S1", crossType: "selfing_s1",
    femaleKeeperId: K_GAS, maleKeeperId: null, channel: "colloidal_silver", crossedAt: "2026-06-15" },
  { id: "cross-op", crossName: "Sherb Cake OP", crossType: "open_pollination",
    femaleKeeperId: K_CAKE, maleKeeperId: null, crossedAt: "2026-06-20" },
  { id: "cross-unknown", crossName: "Cake × ?", crossType: "standard_f1",
    femaleKeeperId: K_CAKE, maleKeeperId: null, crossedAt: "2026-06-25" },
  { id: "cross-outcross", crossName: "Gas × outside male", crossType: "standard_f1",
    femaleKeeperId: K_GAS, maleKeeperId: "keeper-from-another-hunt", crossedAt: "2026-06-28" },
  { id: "cross-bx-nogen", crossName: "Gas BX?", crossType: "backcross", generation: null,
    femaleKeeperId: K_GAS, maleKeeperId: K_CAKE, recurrentParentId: K_GAS, crossedAt: "2026-07-05" },
];

/** The whole demo hunt in one object, for demo surfaces + tests. */
export const DEMO_PHENO_HUNT = {
  meta: DEMO_HUNT,
  candidates: DEMO_CANDIDATES,
  keepers: DEMO_KEEPERS,
  clones: DEMO_CLONES,
  crosses: DEMO_CROSSES,
  keeperIds: { gasRuntz: K_GAS, sherbCake: K_CAKE },
} as const;
