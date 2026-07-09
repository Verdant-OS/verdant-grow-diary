/**
 * /creator-beta — Verdant Creator & Breeder Beta landing page.
 *
 * Thin wrapper around <BetaLanding variant="creator" />. All rendering,
 * a11y, CTA, and UTM logic lives in that shared component so the breeder
 * variant stays a copy-only difference.
 */
import BetaLanding from "@/components/BetaLanding";
import { usePageSeo } from "@/hooks/usePageSeo";

// Re-export for existing tests that import from this file.
export { getCreatorBetaFormUrl } from "@/components/BetaLanding";

export default function CreatorBeta() {
  usePageSeo({
    title: "Verdant Creator & Breeder Beta | Verdant Grow Diary",
    description:
      "Controlled beta for serious growers, breeders, and grower-educators. See how Verdant turns plant logs, photos, sensor snapshots, phenotype notes, and lab evidence into one clear plant history.",
    path: "/creator-beta",
  });

  return (
    <BetaLanding
      variant="creator"
      copy={{
        kicker: "Verdant Creator & Breeder Beta",
        supportCopy:
          "Verdant helps growers connect plant logs, photos, sensor snapshots, phenotype notes, lab evidence, pathogen screening, sensory rubrics, and cautious AI context into one clear plant history.",
      }}
    />
  );
}
