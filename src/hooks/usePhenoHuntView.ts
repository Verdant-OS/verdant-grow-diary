/**
 * usePhenoHuntView — composes the live pheno reads into the source-agnostic
 * bundle the showcase surfaces consume, with the labeled demo hunt as fallback.
 *
 * It reads the grower's OWN hunt (RLS owner-only) through the existing hooks —
 * usePhenoHuntWorkspace (candidate scores + keeper decisions) and usePhenoKeepers
 * (keepers, clones, crosses, reversals) — projects those rows onto the adapter's
 * source contract, and runs them through phenoHuntViewAdapter. No session / no
 * such hunt / still loading → the demo fixture, clearly flagged by `source`.
 *
 * Read-only: no writes, no AI, no automation. Security is the tables' RLS; this
 * hook is presentation only.
 *
 * SLICE 1 seams (honest, not fabricated):
 *  - Loud axes read exactly nose/resin/structure/yield/breeding — the CONFIRMED
 *    (James Loud) standing-plant shortlist. Flavor/potency are cure-decided at
 *    the smoke test and belong on that surface, never scored into the shortlist.
 *  - `cured` is inferred from the PRESENCE of a post-cure smoke test row; the
 *    per-round grow nodes (veg→flower) and aroma chips are follow-up enrichment
 *    (needs the on-demand round load + flavor coercion) — omitted, never faked.
 */
import { useMemo } from "react";
import { usePhenoHuntWorkspace } from "@/hooks/usePhenoHuntWorkspace";
import { usePhenoKeepers } from "@/hooks/usePhenoKeepers";
import {
  buildPhenoHuntView,
  type PhenoHuntViewData,
  type HuntCandidateSource,
  type HuntKeeperSource,
} from "@/lib/phenoHuntViewAdapter";
import type { PedigreeCrossInput } from "@/lib/phenoPedigreeViewModel";
import type { CloneInput, CloneTreeRow } from "@/lib/phenoCloneTreeViewModel";
import { buildCloneTreeRows } from "@/lib/phenoCloneTreeViewModel";
import {
  DEMO_PHENO_HUNT,
  DEMO_CANDIDATES,
  DEMO_KEEPERS,
  DEMO_CROSSES,
  DEMO_CLONES,
} from "@/lib/demo/phenoHuntDemoFixture";

export type PhenoHuntViewSource = "live" | "demo";

export interface PhenoHuntViewMeta {
  readonly name: string;
  readonly packLabel: string | null;
  readonly packSize: number | null;
}

export interface UsePhenoHuntViewResult {
  readonly status: "loading" | "ready";
  readonly source: PhenoHuntViewSource;
  readonly meta: PhenoHuntViewMeta;
  readonly data: PhenoHuntViewData;
  /** Clone lineage per keeper id, for the family tree's Detailed view. */
  readonly cloneRowsByKeeperId: Record<string, CloneTreeRow[]>;
}

const DEMO_META: PhenoHuntViewMeta = {
  name: DEMO_PHENO_HUNT.meta.name,
  packLabel: DEMO_PHENO_HUNT.meta.packLabel,
  packSize: DEMO_PHENO_HUNT.meta.packSize,
};

/** The labeled demo bundle, built once from the fixture (same as the /internal demo). */
function demoBundle(): {
  data: PhenoHuntViewData;
  cloneRowsByKeeperId: Record<string, CloneTreeRow[]>;
} {
  const data = buildPhenoHuntView({
    candidates: DEMO_CANDIDATES.map((c) => ({
      candidateNumber: c.candidateNumber,
      name: c.name,
      decision: c.verdict, // demo verdicts already read keep/maybe/cull
      traits: c.loud as unknown as Record<string, number>,
      aroma: c.aroma,
      tags: c.tags,
    })),
    keepers: DEMO_KEEPERS.map((k) => {
      const cand = DEMO_CANDIDATES.find((c) => c.name === k.name);
      return {
        id: k.id,
        name: k.name,
        sourceCandidateLabel: k.sourceCandidateLabel,
        reversed: k.reversed,
        reversalMethods: k.reversalMethods,
        cloneCount: k.cloneCount,
        stabilityRunCount: k.stabilityRunCount,
        rounds: cand?.rounds,
      };
    }),
    crosses: DEMO_CROSSES,
    clones: DEMO_CLONES,
  });
  return {
    data,
    cloneRowsByKeeperId: { [DEMO_PHENO_HUNT.keeperIds.gasRuntz]: buildCloneTreeRows(DEMO_CLONES) },
  };
}

const DEMO = demoBundle();

function candidateDisplayName(c: {
  candidateLabel?: string | null;
  plantLabel?: string | null;
  strain?: string | null;
  candidateNumber?: number | null;
  candidateId: string;
}): string {
  return (
    c.candidateLabel?.trim() ||
    c.plantLabel?.trim() ||
    c.strain?.trim() ||
    (c.candidateNumber != null ? `Candidate ${c.candidateNumber}` : c.candidateId)
  );
}

export function usePhenoHuntView(huntId: string | null | undefined): UsePhenoHuntViewResult {
  const ws = usePhenoHuntWorkspace(huntId);
  const kp = usePhenoKeepers(huntId);

  const live = useMemo(() => {
    const candidates: HuntCandidateSource[] = ws.candidates.map((c) => ({
      candidateNumber: c.candidateNumber ?? null,
      name: candidateDisplayName(c),
      decision: ws.decisionsByPlant[c.candidateId]?.decision ?? null,
      traits: (ws.scoresByPlant[c.candidateId]?.traits ?? null) as Record<string, number> | null,
      // Aroma (flavor descriptors) is follow-up enrichment — omit, never fake.
      aroma: [],
    }));

    const labelBySourcePlant = new Map<string, string>();
    ws.candidates.forEach((c) => {
      const n = c.candidateNumber != null ? `#${c.candidateNumber} · ` : "";
      labelBySourcePlant.set(c.candidateId, `${n}${candidateDisplayName(c)}`);
    });
    const reversed = new Set(kp.reversedKeeperIds);

    const keepers: HuntKeeperSource[] = kp.keepers.map((k) => ({
      id: k.id,
      name: k.keeperName,
      sourceCandidateLabel: labelBySourcePlant.get(k.sourcePlantId) ?? null,
      reversed: reversed.has(k.id),
      reversalMethods: kp.reversals.filter((r) => r.keeperId === k.id).map((r) => r.method),
      cloneCount: kp.clonesByKeeper[k.id]?.length ?? 0,
      stabilityRunCount: k.stabilityRuns?.length ?? 0,
      // A post-cure smoke test means it reached the cure. Grow-round nodes are
      // follow-up enrichment (on-demand round load) — omitted, not invented.
      rounds: ws.smokeByPlant[k.sourcePlantId] ? ["post_cure"] : [],
    }));

    const crosses: PedigreeCrossInput[] = kp.crosses.map((x) => ({
      id: x.id,
      crossName: x.crossName,
      crossType: x.crossType,
      channel: x.channel,
      generation: x.generation,
      femaleKeeperId: x.femaleKeeperId,
      maleKeeperId: x.maleKeeperId,
      recurrentParentId: x.recurrentParentId,
      crossedAt: x.crossedAt,
    }));

    const clones: CloneInput[] = Object.values(kp.clonesByKeeper)
      .flat()
      .map((c) => ({
        id: c.id,
        parentCloneId: c.parentCloneId,
        cloneLabel: c.cloneLabel,
        takenAt: c.takenAt,
      }));

    const data = buildPhenoHuntView({ candidates, keepers, crosses, clones });
    const cloneRowsByKeeperId: Record<string, CloneTreeRow[]> = {};
    for (const [keeperId, rows] of Object.entries(kp.clonesByKeeper)) {
      cloneRowsByKeeperId[keeperId] = buildCloneTreeRows(
        rows.map((c) => ({
          id: c.id,
          parentCloneId: c.parentCloneId,
          cloneLabel: c.cloneLabel,
          takenAt: c.takenAt,
        })),
      );
    }
    return { data, cloneRowsByKeeperId };
  }, [
    ws.candidates,
    ws.decisionsByPlant,
    ws.scoresByPlant,
    ws.smokeByPlant,
    kp.keepers,
    kp.reversedKeeperIds,
    kp.reversals,
    kp.clonesByKeeper,
    kp.crosses,
  ]);

  const hasLive = (huntId?.trim().length ?? 0) > 0 && ws.candidates.length > 0;
  const loading = ws.status === "loading" || kp.status === "loading";

  if (hasLive) {
    return {
      status: "ready",
      source: "live",
      meta: {
        name: ws.hunt?.name ?? kp.hunt?.name ?? "Your hunt",
        packLabel: null,
        packSize: ws.totalCandidateCount ?? ws.candidates.length,
      },
      data: live.data,
      cloneRowsByKeeperId: live.cloneRowsByKeeperId,
    };
  }

  return {
    status: loading ? "loading" : "ready",
    source: "demo",
    meta: DEMO_META,
    data: DEMO.data,
    cloneRowsByKeeperId: DEMO.cloneRowsByKeeperId,
  };
}
