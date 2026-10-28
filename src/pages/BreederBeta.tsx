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
 * component). On 2026-10-26 the owner hid both URLs from search
 * (`noindex, follow`), and on 2026-10-28 made /breeder-beta self-canonical. The
 * build-time half lives in staticPublicSeoDocuments.ts; this hook runs after
 * hydration and must name the same canonical and robots as the pre-rendered head.
 */
import BetaLanding from "@/components/BetaLanding";
import { usePageSeo } from "@/hooks/usePageSeo";

export default function BreederBeta() {
  usePageSeo({
    title: "Verdant Breeder Beta | Verdant Grow Diary",
    description:
      "Controlled beta for breeders and pheno hunters. Lab evidence and sensory notes stay recorded. The breeder decides what advances.",
    path: "/breeder-beta",
    noindex: true,
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
