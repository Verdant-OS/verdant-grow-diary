/**
 * /breeder-beta — breeder-focused variant of the Verdant beta landing page.
 *
 * Copy is oriented around pheno hunts, keeper decisions, lab evidence, and
 * breeder-facing evidence packets. Same safety invariants as the creator
 * variant: data-free, no Supabase writes, no AI calls, no auto-keeper
 * selection, no auto-disqualification, no equipment control, no guaranteed
 * yield claims, no medical claims.
 *
 * SEO: this route is a copy-only variant of /creator-beta (same <BetaLanding>
 * component), so per the owner adjudication of 2026-08-20 it stays indexable
 * for direct and paid traffic but canonicalises to /creator-beta rather than
 * competing with it. The build-time half lives in staticPublicSeoDocuments.ts;
 * this hook runs after hydration and would overwrite the pre-rendered canonical
 * if it did not name the same target.
 */
import BetaLanding from "@/components/BetaLanding";
import { usePageSeo } from "@/hooks/usePageSeo";

export default function BreederBeta() {
  usePageSeo({
    title: "Verdant Breeder Beta | Verdant Grow Diary",
    description:
      "Controlled beta for breeders and pheno hunters. See how Verdant records lab evidence, pathogen screening, sensory rubrics, and pheno decisions — while the breeder always decides which plants advance.",
    path: "/breeder-beta",
    canonicalPath: "/creator-beta",
  });

  return (
    <BetaLanding
      variant="breeder"
      copy={{
        kicker: "Verdant Breeder Beta",
        supportCopy:
          "Verdant helps breeders connect plant logs, photos, sensor snapshots, phenotype notes, lab evidence, pathogen screening, sensory rubrics, and cautious AI context into one clear pheno history — so keeper decisions stay grounded in evidence the breeder can defend.",
      }}
    />
  );
}
