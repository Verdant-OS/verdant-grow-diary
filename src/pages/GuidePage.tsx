/**
 * GuidePage — public /guides/:slug SEO content page.
 *
 * Presenter only. Reads shared content from src/constants/verdantSeoContent
 * so visible copy and FAQPage JSON-LD share a single source of truth.
 * No Supabase, no AI calls, no Action Queue writes, no device control.
 */
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  findGuideBySlug,
  VERDANT_GUIDES_BREADCRUMB_ITEMS,
  VERDANT_SEO_GUIDES,
  VERDANT_SITE_ORIGIN,
} from "@/constants/verdantSeoContent";
import {
  buildArticleJsonLd,
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";
import { buildGuideQuickLogStarterHref } from "@/lib/quickLogStarterLinks";
import { resolveGuideFaqFromHash } from "@/lib/guideFaqHashResolver";

export default function GuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const guide = findGuideBySlug(slug);
  const initialResolved = resolveGuideFaqFromHash(guide, location.hash);
  const initialFaqValue = initialResolved?.value;
  const [openFaq, setOpenFaq] = useState<string>(initialFaqValue ?? "");
  const [highlightedFaq, setHighlightedFaq] = useState<string | undefined>(initialFaqValue);
  const faqItemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const resolved = resolveGuideFaqFromHash(guide, location.hash);
    if (!resolved) return;
    const target = resolved.value;
    setOpenFaq(target);
    setHighlightedFaq(target);

    // Defer scroll until after the accordion item opens, then move focus
    // to the highlighted item so keyboard users land on the answer they
    // deep-linked into.
    const scrollT = window.setTimeout(() => {
      const el = faqItemRefs.current[target] ?? document.getElementById(target);
      if (el) {
        // jsdom does not implement scrollIntoView; guard so focus still runs.
        try {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          /* ignore */
        }
        // Focus is safe to call after scrolling; the item has tabIndex=-1.
        el.focus({ preventScroll: true });
      }
    }, 100);
    return () => {
      window.clearTimeout(scrollT);
    };
  }, [location.hash, guide]);
  // Always call hooks before conditional returns.
  usePageSeo({
    title: guide?.title ?? "Grower Guide | Verdant Grow Diary",
    description:
      guide?.description ??
      "Verdant grower guides on grow diary logging, sensor truth, VPD, and AI Doctor.",
    path: guide ? `/guides/${guide.slug}` : "/guides",
    ogType: guide ? "article" : "website",
  });

  useEffect(() => {
    if (!guide) return;
    const guideUrl = `${VERDANT_SITE_ORIGIN}/guides/${guide.slug}`;
    const faq = buildFaqPageJsonLd({
      pageUrl: guideUrl,
      questions: guide.faq,
    });
    const crumbs = buildBreadcrumbListJsonLd({
      items: [...VERDANT_GUIDES_BREADCRUMB_ITEMS, { name: guide.h1, url: guideUrl }],
    });
    // Evergreen guides — use the site's stable publish date so Article
    // schema validates without inventing per-guide edit timestamps.
    const article = buildArticleJsonLd({
      headline: guide.h1,
      description: guide.description,
      url: guideUrl,
      datePublished: "2025-01-01",
      authorName: "Verdant Grow Diary",
      publisherName: "Verdant Grow Diary",
      siteUrl: VERDANT_SITE_ORIGIN,
    });
    const faqScript = document.createElement("script");
    faqScript.type = "application/ld+json";
    faqScript.setAttribute("data-page-ldjson", `guide-${guide.slug}-faq`);
    faqScript.text = safeJsonLdStringify(faq);
    document.head.appendChild(faqScript);
    const crumbScript = document.createElement("script");
    crumbScript.type = "application/ld+json";
    crumbScript.setAttribute("data-page-ldjson", `guide-${guide.slug}-breadcrumb`);
    crumbScript.text = safeJsonLdStringify(crumbs);
    document.head.appendChild(crumbScript);
    const articleScript = document.createElement("script");
    articleScript.type = "application/ld+json";
    articleScript.setAttribute("data-page-ldjson", `guide-${guide.slug}-article`);
    articleScript.text = safeJsonLdStringify(article);
    document.head.appendChild(articleScript);
    return () => {
      faqScript.remove();
      crumbScript.remove();
      articleScript.remove();
    };
  }, [guide]);

  if (!guide) {
    return <Navigate to="/guides" replace />;
  }

  const related = guide.related
    .map((s) => VERDANT_SEO_GUIDES.find((g) => g.slug === s))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <main
      data-testid="guide-page"
      data-guide-slug={guide.slug}
      className="min-h-screen bg-background text-foreground"
    >
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            All guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article className="px-6 pt-6 pb-16 max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/80 font-medium">
          Grower Guide
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
          {guide.h1}
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">{guide.intro}</p>

        {guide.cta && (
          <aside
            aria-label={guide.cta.heading}
            className="mt-8 rounded-lg border border-primary/40 bg-primary/5 p-5 md:p-6 shadow-sm"
          >
            <h2 className="font-display text-xl md:text-2xl font-semibold text-foreground">
              {guide.cta.heading}
            </h2>
            <p className="mt-2 text-sm md:text-base text-foreground/85">
              {guide.cta.description}
            </p>
            {guide.cta.prompts && guide.cta.prompts.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-foreground/80 list-disc pl-5">
                {guide.cta.prompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
            )}
            <div className="mt-5">
              <Link
                to={guide.cta.to}
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm md:text-base font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-h-[44px]"
              >
                {guide.cta.label}
              </Link>
            </div>
          </aside>
        )}



        <div className="mt-10 space-y-8">
          {guide.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl md:text-2xl font-semibold">{section.heading}</h2>
              <p className="mt-3 text-base text-foreground/90">{section.body}</p>
              {section.links && section.links.length > 0 && (
                <nav
                  aria-label={`In Verdant: ${section.heading}`}
                  className="mt-4 rounded-md border border-border/60 bg-muted/30 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    In Verdant
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {section.links.map((link) => (
                      <li key={link.to}>
                        <Link
                          to={link.to}
                          className="text-primary underline underline-offset-4 hover:text-primary/80"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </section>
          ))}

        </div>

        {guide.faq.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl md:text-2xl font-semibold mb-4">
              Common questions
            </h2>
            <Accordion
              type="single"
              collapsible
              className="w-full"
              value={openFaq}
              onValueChange={(v) => {
                // Keep the accordion controlled by using an empty string
                // for the collapsed state rather than undefined.
                setOpenFaq(v ?? "");
                // Clear the deep-link highlight when the user manually
                // collapses the accordion; otherwise keep it visible.
                if (!v) setHighlightedFaq(undefined);
              }}
            >
              {guide.faq.map((entry, i) => {
                const value = `faq-${i}`;
                const isHighlighted = highlightedFaq === value;
                return (
                  <AccordionItem
                    key={entry.question}
                    value={value}
                    id={value}
                    ref={(el) => (faqItemRefs.current[value] = el)}
                    tabIndex={-1}
                    data-highlighted={isHighlighted ? "true" : undefined}
                    className={
                      isHighlighted
                        ? "rounded-md ring-2 ring-primary/70 bg-primary/5 motion-safe:transition-colors motion-safe:duration-500 scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        : "motion-safe:transition-colors motion-safe:duration-500 scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    }
                  >
                    <AccordionTrigger className="text-left px-2">{entry.question}</AccordionTrigger>
                    <AccordionContent className="px-2">{entry.answer}</AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </section>
        )}

        {guide.slug === "grow-room-vpd-tracker" && (
          <section className="mt-12 rounded-xl border border-primary/30 bg-primary/5 p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
              Put the guide into practice
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              Calculate air VPD from a manual reading
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Verdant's free calculator keeps the source honest: manual inputs, derived air VPD, no
              upload, no diagnosis, and no device control.
            </p>
            <Link
              to="/tools/vpd-calculator"
              className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
            >
              Open the stage-aware VPD calculator
            </Link>
          </section>
        )}

        {guide.slug === "bud-rot-prevention-identification" && (
          <section
            className="mt-12 rounded-xl border border-primary/30 bg-primary/5 p-5"
            data-testid="guide-bud-rot-checklist-download"
          >
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
              Printable resource
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              Download the Bud Rot prevention checklist (PDF)
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A one-page, grower-approved checklist for late flower: environment
              targets, a daily walk-through, a weekly Environment Check audit,
              and what to do if you find rot. Print it and pin it next to the
              tent, or keep it on your phone.
            </p>
            <a
              href="/verdant-bud-rot-prevention-checklist.pdf"
              download
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              data-testid="guide-bud-rot-checklist-download-link"
            >
              Download checklist (PDF)
            </a>
            <p className="mt-3 text-xs text-muted-foreground">
              Verdant suggests; the grower decides. Nothing on this checklist
              triggers automation.
            </p>
          </section>
        )}

        <section className="mt-12 rounded-lg border border-border/60 p-5">
          <h2 className="font-display text-lg font-semibold">Keep reading</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  to={`/guides/${r.slug}`}
                  className="underline hover:text-foreground text-muted-foreground"
                >
                  {r.h1}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/guides" className="underline hover:text-foreground text-muted-foreground">
                All grower guides
              </Link>
            </li>
            <li>
              <Link to="/welcome" className="underline hover:text-foreground text-muted-foreground">
                See how Verdant works
              </Link>
            </li>
            <li>
              <Link to="/pricing" className="underline hover:text-foreground text-muted-foreground">
                Compare Free and Pro pricing
              </Link>
            </li>
          </ul>
        </section>

        <section
          data-testid="guide-starter-cta"
          className="mt-10 rounded-lg border border-primary/40 p-6 bg-card/40"
        >
          <h2 className="font-display text-lg md:text-xl font-semibold">
            Log your first grow note in 30 seconds — no account needed
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            Try the public Quick Log starter: nickname a plant, jot one note, and the draft stays on
            your device until you decide to keep it.
          </p>
          <div className="mt-4">
            <Link
              to={buildGuideQuickLogStarterHref(guide.slug)}
              data-testid="guide-starter-cta-link"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Try the 30-second Quick Log
            </Link>
          </div>
        </section>

        <section
          data-testid="guide-demo-cta"
          className="mt-10 rounded-lg border border-border/60 p-6 bg-card/40"
        >
          <h2 className="font-display text-lg md:text-xl font-semibold">
            See a real One-Tent Loop before signing up
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            Walk through how Verdant connects a grow, tent, plant, Quick Log, timeline, sensor
            snapshot, cautious AI review, and grower-approved action queue.
          </p>
          <div className="mt-4">
            <Link
              to="/welcome"
              data-testid="guide-demo-cta-link"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Explore the public demo
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
