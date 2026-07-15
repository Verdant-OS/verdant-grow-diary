/**
 * GuidePage — public /guides/:slug SEO content page.
 *
 * Presenter only. Reads shared content from src/constants/verdantSeoContent
 * so visible copy and FAQPage JSON-LD share a single source of truth.
 * No Supabase, no AI calls, no Action Queue writes, no device control.
 */
import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
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
  VERDANT_CUSTOMER_GUIDE_PATH,
  VERDANT_GUIDES_BREADCRUMB_ITEMS,
  VERDANT_SEO_GUIDES,
  VERDANT_SITE_ORIGIN,
} from "@/constants/verdantSeoContent";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";
import { buildGuideQuickLogStarterHref } from "@/lib/quickLogStarterLinks";

export default function GuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const guide = findGuideBySlug(slug);

  // Always call hooks before conditional returns.
  usePageSeo({
    title: guide?.title ?? "Grower Guide | Verdant Grow Diary",
    description:
      guide?.description ??
      "Verdant grower guides on grow diary logging, sensor truth, VPD, and AI Doctor.",
    path: guide ? `/guides/${guide.slug}` : "/guides",
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
    return () => {
      faqScript.remove();
      crumbScript.remove();
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

        <div className="mt-10 space-y-8">
          {guide.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl md:text-2xl font-semibold">{section.heading}</h2>
              <p className="mt-3 text-base text-foreground/90">{section.body}</p>
            </section>
          ))}
        </div>

        {guide.faq.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl md:text-2xl font-semibold mb-4">
              Common questions
            </h2>
            <Accordion type="single" collapsible className="w-full">
              {guide.faq.map((entry, i) => (
                <AccordionItem key={entry.question} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left">{entry.question}</AccordionTrigger>
                  <AccordionContent>{entry.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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
              <Link
                to={VERDANT_CUSTOMER_GUIDE_PATH}
                className="underline hover:text-foreground text-muted-foreground"
              >
                Start with the Customer Guide
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
