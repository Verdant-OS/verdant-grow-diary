import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/store/auth";
import BrandLogo from "@/components/BrandLogo";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import LandingAuthedOnboardingBridge from "@/components/LandingAuthedOnboardingBridge";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  VERDANT_HERO,
  VERDANT_VALUE_DRIVERS,
  VERDANT_TRUST,
  VERDANT_LOOP,
} from "@/constants/verdantPositioningCopy";
import { VERDANT_SEO_LANDING_SECTIONS, VERDANT_LANDING_FAQ } from "@/constants/verdantSeoCopy";
import { buildFaqPageJsonLd, safeJsonLdStringify } from "@/lib/seoStructuredData";
import { trackPricingEvent } from "@/lib/pricingAnalytics";
import { buildAttributedPricingPath } from "@/lib/paidAcquisitionAttributionRules";
import { buildAttributedSignupPath } from "@/lib/signupAcquisitionRules";

const LANDING_PRICING_PATH = buildAttributedPricingPath({ source: "landing_page" });
const LANDING_SIGNUP_PATH = buildAttributedSignupPath({ source: "landing_page" });

/**
 * Public landing page for https://verdantgrowdiary.com.
 *
 * This page is intentionally read-only marketing copy. It does NOT:
 *  - read or render any authenticated dashboard data (no grows, plants,
 *    tents, sensors, alerts, or action_queue queries),
 *  - call Supabase with user-scoped data queries,
 *  - expose private dashboard internals,
 *  - display any live metrics, sensor values, or AI Coach output,
 *  - introduce any write path.
 *
 * Copy lives in `src/constants/verdantPositioningCopy.ts`. This file is a
 * presenter only.
 */
export default function Landing() {
  const { user } = useAuth();

  usePageSeo({
    title: "Grow Diary & Grow Room Tracking App | Verdant Grow Diary",
    description:
      "See what changed in your grow and decide what to do next. Verdant turns logs, photos, and sensor readings from the gear you already own into one plant timeline.",
    path: "/welcome",
  });

  // FAQPage JSON-LD — must mirror the visible FAQ below (same source constant).
  useEffect(() => {
    const faq = buildFaqPageJsonLd({
      pageUrl: "https://verdantgrowdiary.com/welcome",
      questions: VERDANT_LANDING_FAQ,
    });
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-page-ldjson", "landing-faq");
    s.text = safeJsonLdStringify(faq);
    document.head.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <BrandLogo size="md" showText />
        <div className="flex items-center gap-2">
          <Link
            to={LANDING_PRICING_PATH}
            data-testid="landing-pricing-cta-header"
            onClick={() => trackPricingEvent("landing_pricing_cta_clicked", { source: "header" })}
          >
            <Button variant="ghost" size="sm">
              Pricing
            </Button>
          </Link>
          {user ? (
            <Link to="/">
              <Button variant="outline" size="sm">
                Open dashboard
              </Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-10 pb-16 max-w-5xl mx-auto text-center">
        <div className="flex justify-center mb-6">
          <BrandLogo size="hero" />
        </div>
        <p className="text-sm uppercase tracking-[0.2em] text-primary/80 font-medium">
          {VERDANT_HERO.eyebrow}
        </p>
        <h1 className="mt-4 font-display text-4xl md:text-6xl font-bold tracking-tight leading-tight">
          See what changed.
          <span className="block text-primary">Decide what to do next.</span>
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {VERDANT_HERO.subheadline}
        </p>
        <p className="mt-3 text-sm md:text-base text-foreground/80 font-medium">
          {VERDANT_HERO.tagline}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Link to="/">
              <Button size="lg" className="font-semibold">
                Open dashboard
              </Button>
            </Link>
          ) : (
            <Link
              to={LANDING_SIGNUP_PATH}
              data-testid="landing-signup-cta-hero"
              onClick={() => trackPricingEvent("landing_signup_cta_clicked", { source: "hero" })}
            >
              <Button size="lg" className="font-semibold">
                {VERDANT_HERO.primaryCtaLabel}
              </Button>
            </Link>
          )}
          <Link
            to={LANDING_PRICING_PATH}
            data-testid="landing-pricing-cta-hero"
            onClick={() => trackPricingEvent("landing_pricing_cta_clicked", { source: "hero" })}
          >
            <Button size="lg" variant="outline" className="font-semibold">
              {VERDANT_HERO.pricingCtaLabel}
            </Button>
          </Link>
          <a href="#loop">
            <Button size="lg" variant="ghost">
              {VERDANT_HERO.secondaryCtaLabel}
            </Button>
          </a>
          <Link to="/auth">
            <Button size="lg" variant="ghost">
              Sign in
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">{VERDANT_HERO.safetyLine}</p>
        {user && <LandingAuthedOnboardingBridge />}
      </section>

      {/* Value drivers */}
      <section id="features" className="px-6 py-14 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center mb-3">
          Why growers use Verdant
        </h2>
        <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-10">
          A Grow OS for serious growers who already own hardware and do not want another controller.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {VERDANT_VALUE_DRIVERS.map((card) => (
            <FeatureCard key={card.title} title={card.title} body={card.body} />
          ))}
        </div>
      </section>

      {/* One-Tent Loop */}
      <section id="loop" className="px-6 py-14 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          {VERDANT_LOOP.heading}
        </h2>
        <p className="mt-3 text-center text-muted-foreground max-w-2xl mx-auto">
          {VERDANT_LOOP.body}
        </p>
        <ol className="mt-8 flex flex-wrap items-stretch justify-center gap-2">
          {VERDANT_LOOP.steps.map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-sm"
            >
              <span className="text-xs text-muted-foreground tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-medium">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* SEO landing sections — grower-intent keyword clusters. */}
      <section
        id="seo-sections"
        aria-label="What Verdant does for growers"
        className="px-6 py-14 max-w-5xl mx-auto space-y-10"
      >
        {VERDANT_SEO_LANDING_SECTIONS.map((section) => (
          <article
            key={section.id}
            id={section.id}
            className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6"
          >
            <h2 className="font-display text-2xl md:text-3xl font-semibold">{section.heading}</h2>
            <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
              {section.body}
            </p>
          </article>
        ))}
      </section>

      {/* Visible FAQ — mirrored 1:1 into FAQPage JSON-LD above. */}
      <section
        id="faq"
        aria-label="Frequently asked questions about Verdant"
        className="px-6 py-14 max-w-3xl mx-auto"
      >
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center mb-6">
          Grow diary & sensor FAQ
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {VERDANT_LANDING_FAQ.map((entry, i) => (
            <AccordionItem key={entry.question} value={`landing-faq-${i}`}>
              <AccordionTrigger>{entry.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{entry.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Legacy anchor tokens preserved for downstream tests/consumers.
          These are the human-facing categories the loop delivers on. */}
      <section className="sr-only" aria-hidden="true">
        <ul>
          <li>Grow logs</li>
          <li>Plant and tent tracking</li>
          <li>Sensor-aware dashboard — for safer insight, never blind automation</li>
          <li>Environment alerts</li>
          <li>AI Coach — cautious, evidence-based</li>
          <li>Approval-required Action Queue</li>
        </ul>
      </section>

      {/* Trust / safety */}
      <section className="px-6 py-14 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">
            {VERDANT_TRUST.heading}
          </h2>
          <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed">
            {VERDANT_TRUST.body}
          </p>
          <ul className="mt-5 space-y-2 text-sm md:text-base text-muted-foreground">
            {VERDANT_TRUST.bullets.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted-foreground">
            No blind automation. The grower stays in control. Verdant cannot touch your equipment.
          </p>
        </div>
      </section>

      {/* Public first-value utility */}
      <section className="px-6 py-14 max-w-3xl mx-auto" data-testid="landing-context-check">
        <div className="rounded-2xl border border-border/70 bg-card p-6 text-center md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary/80">
            Free 60-second check
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold md:text-3xl">
            Is your grow context ready for AI Doctor?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Check plant stage, medium, pot size, recent care, photos, sensors, grow targets, and
            plant history. Nothing is uploaded, and the result never pretends to diagnose a plant.
          </p>
          <Link to="/ai-doctor-readiness-check" data-testid="landing-context-check-cta">
            <Button size="lg" variant="outline" className="mt-6">
              Check my context
            </Button>
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-16 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Start with your real grow
        </h2>
        <p className="mt-3 text-muted-foreground">
          Create a free account to begin logging your tents, plants, and sensor readings. Verdant
          tracks real grow data — there is no synthetic preview mode.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Link to="/">
              <Button size="lg">Open dashboard</Button>
            </Link>
          ) : (
            <Link
              to={LANDING_SIGNUP_PATH}
              data-testid="landing-signup-cta-final"
              onClick={() =>
                trackPricingEvent("landing_signup_cta_clicked", { source: "final_cta" })
              }
            >
              <Button size="lg">{VERDANT_HERO.primaryCtaLabel}</Button>
            </Link>
          )}
          <Link
            to={LANDING_PRICING_PATH}
            data-testid="landing-pricing-cta-final"
            onClick={() =>
              trackPricingEvent("landing_pricing_cta_clicked", { source: "final_cta" })
            }
          >
            <Button size="lg" variant="outline">
              {VERDANT_HERO.pricingCtaLabel}
            </Button>
          </Link>
          <Link to="/auth">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/hardware-integrations">
            <Button size="sm" variant="ghost">
              Hardware integrations
            </Button>
          </Link>
          <a href="#features">
            <Button size="sm" variant="ghost">
              Explore Verdant features
            </Button>
          </a>
        </div>
      </section>

      {/* Beta */}
      <section id="beta" className="px-6 py-16 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">Join the Verdant beta</h2>
          <p className="mt-3 text-muted-foreground">
            Hardware partner? Contact Verdant about read-only integrations.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Verdant Grow Diary is currently in early build. Join the beta list or reach out about
            read-only hardware integrations. Grower stays in control. No blind automation.
          </p>
        </div>
        <LeadCaptureForm />
      </section>

      <footer className="px-6 py-10 border-t border-border/40 text-sm text-muted-foreground text-center space-y-2">
        <p>
          Verdant Grow Diary ·{" "}
          <a className="hover:text-foreground" href="https://verdantgrowdiary.com">
            verdantgrowdiary.com
          </a>
        </p>
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link to="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link to="/refund" className="hover:text-foreground">
            Refund Policy
          </Link>
        </nav>
        <p className="text-xs">
          Operated by Matthew Tyler Cheek. Payments processed by Paddle.com as Merchant of Record.
        </p>
      </footer>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
