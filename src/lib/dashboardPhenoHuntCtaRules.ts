/**
 * dashboardPhenoHuntCtaRules — when to surface "Start Pheno Hunt" on Dashboard.
 *
 * Pure: no React, no Supabase. Caller supplies candidate count for the
 * grow that owns the CTA (active grow or URL-scoped grow).
 */
import { phenoHuntNewPath } from "@/lib/routes";

export const PHENO_HUNT_MIN_CANDIDATES = 2;

export interface DashboardPhenoHuntCtaInput {
  growId: string | null | undefined;
  growName?: string | null;
  /** Eligible plant count (grow_id ∪ tent-in-grow). */
  candidateCount: number;
  /** Optional: hide while loader runs. */
  loading?: boolean;
  minCandidates?: number;
}

export interface DashboardPhenoHuntCtaView {
  visible: boolean;
  growId: string | null;
  growName: string | null;
  candidateCount: number;
  title: string;
  description: string;
  ctaLabel: string;
  href: string | null;
  reasonHidden: string | null;
}

export function buildDashboardPhenoHuntCtaView(
  input: DashboardPhenoHuntCtaInput,
): DashboardPhenoHuntCtaView {
  const min = input.minCandidates ?? PHENO_HUNT_MIN_CANDIDATES;
  const growId =
    typeof input.growId === "string" && input.growId.trim() ? input.growId.trim() : null;
  const growName =
    typeof input.growName === "string" && input.growName.trim() ? input.growName.trim() : null;
  const count =
    typeof input.candidateCount === "number" && Number.isFinite(input.candidateCount)
      ? Math.max(0, Math.floor(input.candidateCount))
      : 0;

  if (input.loading) {
    return {
      visible: false,
      growId,
      growName,
      candidateCount: count,
      title: "",
      description: "",
      ctaLabel: "Start Pheno Hunt",
      href: null,
      reasonHidden: "loading",
    };
  }

  if (!growId) {
    return {
      visible: false,
      growId: null,
      growName,
      candidateCount: count,
      title: "",
      description: "",
      ctaLabel: "Start Pheno Hunt",
      href: null,
      reasonHidden: "no_grow",
    };
  }

  if (count < min) {
    return {
      visible: false,
      growId,
      growName,
      candidateCount: count,
      title: "",
      description: "",
      ctaLabel: "Start Pheno Hunt",
      href: null,
      reasonHidden: "need_more_plants",
    };
  }

  const label = growName ?? "this grow";
  return {
    visible: true,
    growId,
    growName,
    candidateCount: count,
    title: "Ready for a Pheno Hunt",
    description: `${count} plants in ${label} can be tagged as candidates. Compare phenotypes side by side — no auto-ranking, no device control.`,
    ctaLabel: "Start Pheno Hunt",
    href: phenoHuntNewPath(growId),
    reasonHidden: null,
  };
}

/**
 * Prefer URL-scoped grow when valid; otherwise active grow.
 * Pure precedence helper for Dashboard wiring.
 */
export function resolvePhenoHuntCtaGrowId(input: {
  scopedGrowId?: string | null;
  activeGrowId?: string | null;
}): string | null {
  const scoped =
    typeof input.scopedGrowId === "string" && input.scopedGrowId.trim()
      ? input.scopedGrowId.trim()
      : null;
  if (scoped) return scoped;
  const active =
    typeof input.activeGrowId === "string" && input.activeGrowId.trim()
      ? input.activeGrowId.trim()
      : null;
  return active;
}
