/**
 * ContextualPhenoComparisonDemo — internal/demo route for the v0.1
 * Contextual Pheno Comparison UI.
 *
 * Hard constraints:
 *  - Read-only. No fetch, no Supabase, no AI, no writes.
 *  - Uses only fixture data, clearly labeled as demo.
 *  - Renders the pure view-model from
 *    `@/lib/contextualPhenoComparisonViewModel`.
 */
import { useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import { buildContextualPhenoComparisonView } from "@/lib/contextualPhenoComparisonViewModel";
import {
  CONTEXTUAL_PHENO_COMPARISON_DEMO_BANNER,
  CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
} from "@/test/fixtures/contextualPhenoComparisonFixtures";

export default function ContextualPhenoComparisonDemo() {
  const view = useMemo(
    () =>
      buildContextualPhenoComparisonView(
        CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
      ),
    [],
  );

  return (
    <div
      data-testid="contextual-pheno-comparison-demo-page"
      className="container mx-auto max-w-5xl px-4 py-6"
    >
      <PageHeader
        title="Contextual Pheno Comparison (Demo)"
        description="Read-only preview using labeled demo fixture data. No live data, no AI, no save, no share."
      />
      <ContextualPhenoComparisonPanel
        view={view}
        demoBannerText={CONTEXTUAL_PHENO_COMPARISON_DEMO_BANNER}
      />
    </div>
  );
}
