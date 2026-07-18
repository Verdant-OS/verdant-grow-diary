/**
 * PhenoComparison — read-only Pheno Comparison PREVIEW page (/pheno-comparison).
 *
 * Demo-fixture only. No fetch, no Supabase, no AI, no Action Queue, no writes.
 * Renders the shared presentational PhenoComparisonView in "demo" mode. The
 * live per-hunt comparison lives in PhenoHuntCompare (/pheno-hunts/:id/compare).
 */
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { PHENO_COMPARISON_DEMO_CANDIDATES } from "@/lib/phenoComparisonFixtures";
import { usePageSeo } from "@/hooks/usePageSeo";

export default function PhenoComparison() {
  usePageSeo({
    title: "Pheno Comparison Preview — Verdant Grow Diary",
    description:
      "Read-only preview of Verdant's pheno-hunt comparison view: structure, resin, aroma, vigor, and finish laid side by side. Demo fixtures only.",
    path: "/pheno-comparison",
  });
  return <PhenoComparisonView inputs={PHENO_COMPARISON_DEMO_CANDIDATES} mode="demo" />;
}
