import { useEffect } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import BrandLogo from "@/components/BrandLogo";
import FounderShareCard from "@/components/FounderShareCard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  FOUNDER_INCLUDED_FEATURES,
  FOUNDER_LAUNCH_COPY,
  FOUNDER_LAUNCH_FAQ,
  FOUNDER_LAUNCH_PATH,
  FOUNDER_LAUNCH_URL,
  FOUNDER_SAFETY_BOUNDARIES,
  FOUNDER_VALUE_PILLARS,
} from "@/constants/founderLaunchCopy";
import { FOUNDER_SOCIAL_META } from "@/constants/founderSocialMeta";
import { usePageSeo } from "@/hooks/usePageSeo";
import { trackPricingEvent } from "@/lib/pricingAnalytics";
import {
  buildFounderPricingPath,
  resolvePaidAcquisitionSource,
} from "@/lib/paidAcquisitionAttributionRules";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";

function FounderPricingLink({
  source,
  label,
  pricingPath,
}: {
  source: string;
  label: string;
  pricingPath: string;
}) {
  return (
    <Button asChild size="lg" className="font-semibold">
      <Link
        to={pricingPath}
        data-testid={`founder-pricing-cta-${source}`}
        onClick={() => trackPricingEvent("founder_checkout_cta_clicked", { source })}
      >
        {label}
      </Link>
    </Button>
  );
}

export default function Founder() {
  const [searchParams] = useSearchParams();
  const acquisitionSource = resolvePaidAcquisitionSource(searchParams);
  const pricingPath = buildFounderPricingPath(searchParams);
  usePageSeo({
    title: FOUNDER_SOCIAL_META.title,
    description: FOUNDER_SOCIAL_META.description,
    path: FOUNDER_LAUNCH_PATH,
    ogImage: FOUNDER_SOCIAL_META.image,
  });

  useEffect(() => {
    trackPricingEvent("founder_page_view", {
      source: acquisitionSource === "founder_share" ? "founder_share" : "founder_page",
    });

    const faqScript = document.createElement("script");
    faqScript.type = "application/ld+json";
    faqScript.setAttribute("data-page-ldjson", "founder-faq");
    faqScript.text = safeJsonLdStringify(
      buildFaqPageJsonLd({ pageUrl: FOUNDER_LAUNCH_URL, questions: FOUNDER_LAUNCH_FAQ }),
    );

    const breadcrumbScript = document.createElement("script");
    breadcrumbScript.type = "application/ld+json";
    breadcrumbScript.setAttribute("data-page-ldjson", "founder-breadcrumb");
    breadcrumbScript.text = safeJsonLdStringify(
      buildBreadcrumbListJsonLd({
        items: [
          { name: "Verdant", url: "https://verdantgrowdiary.com/welcome" },
          { name: "Founder Lifetime", url: FOUNDER_LAUNCH_URL },
        ],
      }),
    );

    document.head.append(faqScript, breadcrumbScript);
    return () => {
      faqScript.remove();
      breadcrumbScript.remove();
    };
  }, [acquisitionSource]);

  return (
    <main data-testid="founder-page" className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav aria-label="Founder page" className="flex items-center gap-3 text-sm">
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
          <Button asChild size="sm" variant="outline">
            <Link to="/auth">Sign in</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-16 pt-12 text-center md:pt-20">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          {FOUNDER_LAUNCH_COPY.eyebrow}
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-bold tracking-tight md:text-6xl">
          {FOUNDER_LAUNCH_COPY.heading}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          {FOUNDER_LAUNCH_COPY.intro}
        </p>
        <p className="mt-7 font-display text-3xl font-semibold text-primary">
          {FOUNDER_LAUNCH_COPY.price}
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
          {FOUNDER_LAUNCH_COPY.availability}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <FounderPricingLink
            source="hero"
            label={FOUNDER_LAUNCH_COPY.primaryCta}
            pricingPath={pricingPath}
          />
          <Button asChild size="lg" variant="outline">
            <Link
              to="/auth"
              data-testid="founder-start-free-hero"
              onClick={() => trackPricingEvent("founder_start_free_clicked", { source: "hero" })}
            >
              {FOUNDER_LAUNCH_COPY.secondaryCta}
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="founder-values" className="mx-auto max-w-6xl px-6 pb-16">
        <h2 id="founder-values" className="sr-only">
          What Verdant is built around
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {FOUNDER_VALUE_PILLARS.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-2xl border border-border/60 bg-card/35 p-6"
            >
              <h3 className="font-display text-xl font-semibold">{pillar.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <article className="rounded-2xl border border-primary/30 bg-card/45 p-6 md:p-8">
          <h2 className="font-display text-2xl font-semibold">What Founder includes</h2>
          <ul className="mt-5 space-y-3">
            {FOUNDER_INCLUDED_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-border/60 bg-card/30 p-6 md:p-8">
          <div className="flex items-center gap-3">
            <ShieldCheck aria-hidden="true" className="h-6 w-6 text-primary" />
            <h2 className="font-display text-2xl font-semibold">The safety boundaries stay</h2>
          </div>
          <ul className="mt-5 space-y-4">
            {FOUNDER_SAFETY_BOUNDARIES.map((boundary) => (
              <li key={boundary} className="text-sm leading-6 text-muted-foreground">
                {boundary}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-16">
        <h2 className="font-display text-3xl font-semibold">Founder questions</h2>
        <Accordion type="single" collapsible className="mt-5 w-full">
          {FOUNDER_LAUNCH_FAQ.map((entry, index) => (
            <AccordionItem key={entry.question} value={`founder-faq-${index}`}>
              <AccordionTrigger className="text-left">{entry.question}</AccordionTrigger>
              <AccordionContent>{entry.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-6 text-sm text-muted-foreground">
          Payment and refund terms remain governed by Verdant's published{" "}
          <Link to="/refund" className="underline hover:text-foreground">
            Refund Policy
          </Link>
          ,{" "}
          <Link to="/terms" className="underline hover:text-foreground">
            Terms
          </Link>
          , and{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      <div className="mx-auto max-w-3xl px-6 pb-16">
        <FounderShareCard />
      </div>

      <section className="border-t border-border/50 px-6 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-3xl font-semibold">
            {FOUNDER_LAUNCH_COPY.finalHeading}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            {FOUNDER_LAUNCH_COPY.finalBody}
          </p>
          <div className="mt-7">
            <FounderPricingLink
              source="final_cta"
              label={FOUNDER_LAUNCH_COPY.primaryCta}
              pricingPath={pricingPath}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
