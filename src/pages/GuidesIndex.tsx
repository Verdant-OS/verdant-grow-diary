/**
 * GuidesIndex — public /guides hub page (the grower guide).
 *
 * Presenter only. No Supabase, no AI calls, no Action Queue writes,
 * no device control. Content comes from shared SEO content constants
 * so visible copy and FAQPage JSON-LD cannot drift.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import DiaryFaqLinkStatsPanel from "@/components/DiaryFaqLinkStatsPanel";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  VERDANT_CUSTOMER_GUIDE_PATH,
  VERDANT_GROWER_GUIDE_FAQ,
  VERDANT_GUIDES_BREADCRUMB_ITEMS,
  VERDANT_SEO_GUIDES,
} from "@/constants/verdantSeoContent";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";

const PAGE_URL = "https://verdantgrowdiary.com/guides";

export default function GuidesIndex() {
  usePageSeo({
    title: "Verdant Grower Guides | Grow Diary, VPD Tracking, and Sensor Truth",
    description:
      "Practical grower guides for using plant timelines, source-labeled sensor data, VPD context, and cautious AI to make better cultivation decisions.",
    path: "/guides",
  });

  useEffect(() => {
    const faq = buildFaqPageJsonLd({
      pageUrl: PAGE_URL,
      questions: VERDANT_GROWER_GUIDE_FAQ,
    });
    const crumbs = buildBreadcrumbListJsonLd({
      items: VERDANT_GUIDES_BREADCRUMB_ITEMS,
    });
    const faqScript = document.createElement("script");
    faqScript.type = "application/ld+json";
    faqScript.setAttribute("data-page-ldjson", "guides-index-faq");
    faqScript.text = safeJsonLdStringify(faq);
    document.head.appendChild(faqScript);
    const crumbScript = document.createElement("script");
    crumbScript.type = "application/ld+json";
    crumbScript.setAttribute("data-page-ldjson", "guides-index-breadcrumb");
    crumbScript.text = safeJsonLdStringify(crumbs);
    document.head.appendChild(crumbScript);
    return () => {
      faqScript.remove();
      crumbScript.remove();
    };
  }, []);

  return (
    <main data-testid="guides-index-page" className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/welcome" className="text-muted-foreground hover:text-foreground">
            Home
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <section className="px-6 pt-8 pb-12 max-w-3xl mx-auto">
        <p className="text-sm uppercase tracking-[0.2em] text-primary/80 font-medium">
          Grower Guide
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-5xl font-bold tracking-tight">
          The Verdant grower guide
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Plant memory. Sensor truth. Grower-approved decisions. These guides explain how Verdant
          turns the gear you already own — AC Infinity, Spider Farmer, TrolMaster, EcoWitt, and more
          — into one plant timeline with source-labeled sensor snapshots and cautious AI support.
          Verdant suggests; the grower decides. Verdant cannot touch your equipment.
        </p>
      </section>

      <section className="px-6 pb-16 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl font-semibold mb-6">Start here</h2>
        <ul className="space-y-4">
          {VERDANT_SEO_GUIDES.map((g) => (
            <li
              key={g.slug}
              className="rounded-lg border border-border/60 p-4 hover:border-primary/40 transition-colors"
            >
              <Link to={`/guides/${g.slug}`} className="block">
                <h3 className="font-semibold text-lg">{g.h1}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{g.description}</p>
              </Link>
            </li>
          ))}
          <li className="rounded-lg border border-border/60 p-4 hover:border-primary/40 transition-colors">
            <Link to="/guides/grow-stage-care-guide" className="block">
              <h3 className="font-semibold text-lg">
                Grow-stage care guide: seedling, veg, and flower checklists
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                A searchable checklist for watering, nutrients, environment, and harvest tasks
                across each grow stage.
              </p>
            </Link>
          </li>
        </ul>
      </section>

      <section className="px-6 pb-20 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl font-semibold mb-6">Common grower questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {VERDANT_GROWER_GUIDE_FAQ.map((entry, i) => (
            <AccordionItem key={entry.question} value={`faq-${i}`}>
              <AccordionTrigger className="text-left">{entry.question}</AccordionTrigger>
              <AccordionContent>{entry.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <p className="mt-8 text-sm text-muted-foreground">
          Ready to start? See{" "}
          <Link to="/welcome" className="underline hover:text-foreground">
            what Verdant does
          </Link>
          ,{" "}
          <Link to={VERDANT_CUSTOMER_GUIDE_PATH} className="underline hover:text-foreground">
            start with the Customer Guide
          </Link>
          , or compare{" "}
          <Link to="/pricing" className="underline hover:text-foreground">
            Verdant plans
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
