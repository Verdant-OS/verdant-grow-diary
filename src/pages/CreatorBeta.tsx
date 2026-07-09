/**
 * Verdant Creator & Breeder Beta — public landing surface.
 *
 * Controlled validation loop, not a broad public launch. Communicates what
 * Verdant helps growers/breeders show, what beta testers can review, what
 * Verdant explicitly does NOT do, best-fit testers, and CTAs to request beta
 * access + watch the demo walkthrough.
 *
 * Safety invariants (do not remove without an explicit product decision):
 *  - Data-free page. No Supabase reads, no Supabase writes.
 *  - No AI calls, no Action Queue writes, no device control.
 *  - No cannabis sales language, no medical claims, no guaranteed-yield claims.
 *  - No auto-keeper selection language, no auto-disqualification language.
 *  - CTA opens an externally-hosted intake form when VITE_CREATOR_BETA_FORM_URL
 *    is set. When unset, the primary CTA is a disabled placeholder that reads
 *    "Beta form coming soon" — never a live write path.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";

const HELPS_SHOW = [
  "What changed",
  "How the plant responded",
  "What evidence was recorded",
  "What evidence is missing",
  "What needs follow-up",
  "What should be repeated or avoided next run",
];

const BETA_REVIEW_SURFACES = [
  "30-second Quick Log",
  "Timeline",
  "Evidence Overview",
  "Sensor source labels",
  "AI Doctor cautious output",
  "Approval-required Action Queue",
  "Breeder Evidence packet",
];

const DOES_NOT = [
  "Does not select keepers automatically",
  "Does not disqualify candidates automatically",
  "Does not control equipment",
  "Does not run blind automation",
  "Does not claim guaranteed yield",
  "Does not diagnose from one photo with certainty",
];

const BEST_FIT_TESTERS = [
  "grower-educators",
  "pheno hunters",
  "autoflower growers",
  "craft cultivators",
  "sensor-driven DIY growers",
  "breeders who care about evidence quality",
];

const POSITIONING = [
  "Plant memory",
  "Sensor truth",
  "Evidence overview",
  "Better decisions",
  "Breeder / grower decides",
];

/**
 * Read the external beta intake URL from Vite env. Kept as a small helper so
 * the page and its tests share one source of truth.
 */
export function getCreatorBetaFormUrl(): string | null {
  const raw = (import.meta.env.VITE_CREATOR_BETA_FORM_URL ?? "") as string;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  // Defence: only allow absolute http(s) URLs; never allow javascript: or data:.
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export default function CreatorBeta() {
  usePageSeo({
    title: "Verdant Creator & Breeder Beta | Verdant Grow Diary",
    description:
      "Controlled beta for serious growers, breeders, and grower-educators. See how Verdant turns plant logs, photos, sensor snapshots, phenotype notes, and lab evidence into one clear plant history.",
    path: "/creator-beta",
  });

  const formUrl = getCreatorBetaFormUrl();
  const primaryLabel = formUrl ? "Request beta access" : "Beta form coming soon";

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-testid="creator-beta-page"
    >
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
        <Link to="/welcome">
          <Button variant="outline" size="sm">
            Back to home
          </Button>
        </Link>
      </header>

      <section className="px-6 pt-10 pb-10 max-w-4xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-primary font-medium">
          Verdant Creator &amp; Breeder Beta
        </p>
        <h1
          className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight"
          data-testid="creator-beta-hero"
        >
          Show the evidence behind the grow.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
          Verdant helps growers connect plant logs, photos, sensor snapshots,
          phenotype notes, lab evidence, pathogen screening, sensory rubrics,
          and cautious AI context into one clear plant history.
        </p>

        <ul
          className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs"
          data-testid="creator-beta-positioning"
          aria-label="Verdant positioning"
        >
          {POSITIONING.map((p) => (
            <li
              key={p}
              className="rounded-full border border-border px-3 py-1 text-muted-foreground"
            >
              {p}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {formUrl ? (
            <a
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="creator-beta-cta-primary"
            >
              <Button size="lg">{primaryLabel}</Button>
            </a>
          ) : (
            <Button
              size="lg"
              disabled
              data-testid="creator-beta-cta-primary-disabled"
              aria-disabled="true"
              title="Beta intake form is not configured yet."
            >
              {primaryLabel}
            </Button>
          )}
          <Link to="/welcome" data-testid="creator-beta-cta-secondary">
            <Button size="lg" variant="outline">
              Watch demo walkthrough
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-xs text-muted-foreground max-w-xl mx-auto">
          Controlled beta. Access is granted after a short walkthrough so we can
          keep the loop honest and the feedback grounded in real grows.
        </p>
      </section>

      <section
        className="px-6 py-8 max-w-5xl mx-auto grid gap-6 md:grid-cols-2"
        data-testid="creator-beta-sections"
      >
        <BetaCard
          testId="creator-beta-helps-show"
          title="What Verdant helps show"
          items={HELPS_SHOW}
        />
        <BetaCard
          testId="creator-beta-review-surfaces"
          title="What beta testers can review"
          items={BETA_REVIEW_SURFACES}
        />
        <BetaCard
          testId="creator-beta-does-not"
          title="What Verdant does not do"
          items={DOES_NOT}
        />
        <BetaCard
          testId="creator-beta-best-fit"
          title="Best-fit testers"
          items={BEST_FIT_TESTERS}
        />
      </section>

      <footer className="px-6 py-10 max-w-4xl mx-auto text-center text-xs text-muted-foreground">
        <p>
          Verdant is plant memory, sensor truth, cautious AI, and
          grower-approved action. The breeder or grower always decides.
        </p>
      </footer>
    </main>
  );
}

interface BetaCardProps {
  title: string;
  items: string[];
  testId: string;
}

function BetaCard({ title, items, testId }: BetaCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-primary">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
