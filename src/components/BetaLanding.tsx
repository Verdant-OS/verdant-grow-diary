/**
 * BetaLanding — shared presenter for Creator and Breeder beta pages.
 *
 * Data-free. No Supabase, no AI, no Action Queue, no analytics.
 * Only side effect: reads window.location.search (via prop) to forward
 * safe UTM params on the external CTA. No writes anywhere.
 *
 * A11y notes:
 *  - Exactly one <h1> (the hero); every section has its own <h2>.
 *  - Primary CTA is a shadcn Button (`asChild`) wrapping the <a>, so we get
 *    a single semantic element (not <a><button>), keyboard-focusable, with
 *    an sr-only "(opens in new tab)" hint for external targets.
 *  - Disabled fallback CTA is a real `disabled` <button>, not a link stub.
 *  - Secondary CTA is an in-page <a href="#watch-demo"> — no focus-trap
 *    modal to manage.
 *  - Card list items use semantic <ul>/<li>; the "•" bullet is
 *    aria-hidden so screen readers don't read it.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import BrandLogo from "@/components/BrandLogo";
import { preserveUtmOnUrl } from "@/lib/utm/preserveUtm";

export type BetaVariant = "creator" | "breeder";

export interface BetaLandingCopy {
  kicker: string;
  supportCopy: string;
}

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

const WALKTHROUGH_STEPS = [
  "See a real grow's timeline: photos, sensor snapshots, and notes on one page.",
  "Open the Evidence Overview to see what was recorded and what is still missing.",
  "Read a cautious AI Doctor summary that names its evidence and its unknowns.",
  "Watch the Action Queue: every suggestion waits for the grower to approve.",
];

/**
 * Read the external beta intake URL from Vite env. Kept as a small helper so
 * the page and its tests share one source of truth. Only absolute http(s)
 * URLs are honored; anything else is treated as unset.
 */
export function getCreatorBetaFormUrl(): string | null {
  const raw = (import.meta.env.VITE_CREATOR_BETA_FORM_URL ?? "") as string;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Post-demo feedback form URL. Same safety contract as the intake URL:
 * only absolute http(s) targets are honored; anything else is treated as
 * unset and renders a disabled placeholder (never a broken/unsafe link).
 */
export function getBetaFeedbackFormUrl(): string | null {
  const raw = (import.meta.env.VITE_BETA_FEEDBACK_FORM_URL ?? "") as string;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export interface BetaLandingProps {
  variant: BetaVariant;
  copy: BetaLandingCopy;
  /** Injected for tests; defaults to window.location.search at runtime. */
  currentSearch?: string;
}

export default function BetaLanding({ variant, copy, currentSearch }: BetaLandingProps) {
  const rawUrl = getCreatorBetaFormUrl();
  const search = currentSearch ?? (typeof window !== "undefined" ? window.location.search : "");
  const formUrl = rawUrl ? preserveUtmOnUrl(rawUrl, search) : null;
  const primaryLabel = formUrl ? "Request beta access" : "Beta form coming soon";
  const rawFeedbackUrl = getBetaFeedbackFormUrl();
  const feedbackUrl = rawFeedbackUrl ? preserveUtmOnUrl(rawFeedbackUrl, search) : null;
  const feedbackLabel = feedbackUrl ? "Share post-demo feedback" : "Feedback form coming soon";
  const testIdRoot = `${variant}-beta`;

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-testid={`${testIdRoot}-page`}
      data-variant={variant}
    >
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link
          to="/welcome"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Verdant home"
        >
          <BrandLogo size="md" showText />
        </Link>
        <Link to="/welcome" aria-label="Back to Verdant home">
          <Button variant="outline" size="sm">
            Back to home
          </Button>
        </Link>
      </header>

      <section
        className="px-6 pt-10 pb-10 max-w-4xl mx-auto text-center"
        aria-labelledby="beta-hero-heading"
      >
        <p className="text-xs uppercase tracking-widest text-primary font-medium">
          {copy.kicker}
        </p>
        <h1
          id="beta-hero-heading"
          className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight"
          data-testid={`${testIdRoot}-hero`}
        >
          Show the evidence behind the grow.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
          {copy.supportCopy}
        </p>

        <ul
          className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs"
          data-testid={`${testIdRoot}-positioning`}
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
            <Button asChild size="lg" className="min-h-11">
              <a
                href={formUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`${testIdRoot}-cta-primary`}
              >
                <span>{primaryLabel}</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          ) : (
            <Button
              size="lg"
              disabled
              aria-disabled="true"
              className="min-h-11"
              data-testid={`${testIdRoot}-cta-primary-disabled`}
            >
              {primaryLabel}
            </Button>
          )}
          <Button asChild size="lg" variant="outline" className="min-h-11">
            <a
              href="#watch-demo"
              data-testid={`${testIdRoot}-cta-secondary`}
              aria-label="Jump to the demo walkthrough section"
            >
              Watch demo walkthrough
            </a>
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground max-w-xl mx-auto">
          Controlled beta. Access is granted after a short walkthrough so we can
          keep the loop honest and the feedback grounded in real grows.
        </p>
      </section>

      <section
        className="px-6 py-8 max-w-5xl mx-auto grid gap-6 md:grid-cols-2"
        aria-label="Verdant beta overview"
        data-testid={`${testIdRoot}-sections`}
      >
        <BetaCard
          testId={`${testIdRoot}-helps-show`}
          title="What Verdant helps show"
          items={HELPS_SHOW}
        />
        <BetaCard
          testId={`${testIdRoot}-review-surfaces`}
          title="What beta testers can review"
          items={BETA_REVIEW_SURFACES}
        />
        <BetaCard
          testId={`${testIdRoot}-does-not`}
          title="What Verdant does not do"
          items={DOES_NOT}
        />
        <BetaCard
          testId={`${testIdRoot}-best-fit`}
          title="Best-fit testers"
          items={BEST_FIT_TESTERS}
        />
      </section>

      <section
        id="watch-demo"
        className="px-6 py-10 max-w-4xl mx-auto"
        aria-labelledby="watch-demo-heading"
        data-testid={`${testIdRoot}-walkthrough`}
      >
        <Card>
          <CardHeader>
            <h2 id="watch-demo-heading" className="text-xl font-semibold leading-none tracking-tight">
              Watch demo walkthrough
            </h2>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              The walkthrough is a short guided tour of a real grow — no
              staged data, no auto-suggestions posing as decisions. It shows
              how Verdant records evidence and how the grower stays in
              control of every action.
            </p>
            <ol
              className="space-y-2 text-muted-foreground list-decimal pl-5"
              data-testid={`${testIdRoot}-walkthrough-steps`}
            >
              {WALKTHROUGH_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              After the walkthrough, testers share feedback through the
              intake form linked above. Everything stays grower-approved.
            </p>
          </CardContent>
        </Card>
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
        <h2 className="text-base font-semibold leading-none tracking-tight">{title}</h2>
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
