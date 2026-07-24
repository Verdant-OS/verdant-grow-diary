/**
 * PhenoComparabilityBanner — the non-dismissible, high-contrast notice shown
 * on every ranked pheno surface whose contenders cannot be fairly compared
 * (mixed plant types, unknown types, or stages beyond the locked tolerance).
 *
 * Contract (autoflower/photoperiod plan, 2026-07-21): while this banner is
 * visible the presenter must hide/strike rank numbers, composite score bars,
 * and per-trait leads markers. Trait values may stay visible — they organize
 * notes; they don't rank. Deliberately no dismiss control.
 */
import { AlertTriangle } from "lucide-react";

import {
  COMPARABILITY_REASON_MESSAGES,
} from "@/lib/phenoContendersViewModel";
import type { ComparabilityReason } from "@/lib/plantTypeRules";

export default function PhenoComparabilityBanner({
  reasons,
}: {
  reasons: readonly ComparabilityReason[];
}) {
  if (reasons.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="pheno-comparability-banner"
      className="mb-3 rounded-lg border-2 border-amber-500/70 bg-amber-500/15 p-3 text-sm text-amber-900 dark:text-amber-200"
    >
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
        Not comparable — ranking hidden
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-6">
        {reasons.map((r) => (
          <li key={r}>{COMPARABILITY_REASON_MESSAGES[r]}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs opacity-90">
        Trait notes stay visible to organize the pack. Ranks, score bars, and
        leads markers are hidden — sorting these against each other wouldn&rsquo;t
        be honest.
      </p>
    </div>
  );
}
