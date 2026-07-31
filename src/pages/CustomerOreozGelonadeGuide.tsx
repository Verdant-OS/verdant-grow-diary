/**
 * ID-free Customer Mode education page for the Oreoz/Gelonade comparison.
 *
 * This presenter imports static copy only. It has no auth, Supabase, fetch,
 * Operator data, share-token, Quick Log, or write dependency.
 */

import { Link } from "react-router-dom";
import LegalFooterLinks from "@/components/LegalFooterLinks";
import {
  NEXT_DOOR_CUSTOMER_BRAND,
  NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
  OREOZ_GELONADE_CUSTOMER_SEO,
  OREOZ_GELONADE_GUIDE_PATH,
  OREOZ_GELONADE_GUIDE_SLUG,
} from "@/constants/oreozGelonadeExperience";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { usePageSeo } from "@/hooks/usePageSeo";

const guide = findGuideBySlug(OREOZ_GELONADE_GUIDE_SLUG);

export default function CustomerOreozGelonadeGuide() {
  usePageSeo({
    title: OREOZ_GELONADE_CUSTOMER_SEO.title,
    description: OREOZ_GELONADE_CUSTOMER_SEO.description,
    path: NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
    noindex: true,
  });

  if (!guide) return null;

  return (
    <main
      data-testid="customer-oreoz-gelonade-guide"
      data-mode="customer"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="border-b border-border/60 bg-card/40">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
            Customer Mode
          </p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight">
            {NEXT_DOOR_CUSTOMER_BRAND}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Static cultivation education only. This page does not access Operator grow data,
            customer records, live sensors, or private diary entries.
          </p>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-8 pb-16">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Cultivar comparison
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight">
          Oreoz vs Gelonade: what may differ, and what to observe
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">{guide.intro}</p>

        <aside className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="font-semibold">Keep the label in perspective</h2>
          <p className="mt-2 text-sm leading-6 text-foreground/85">
            Public cultivar descriptions are directional, not predictive. Environment, provenance,
            phenotype, harvest, and cure can all change expression. Compare actual plants at matched
            stages before drawing a conclusion.
          </p>
        </aside>

        <div className="mt-10 space-y-9">
          {guide.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl font-semibold">{section.heading}</h2>
              <p className="mt-3 text-base leading-7 text-foreground/90">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="mt-12" aria-labelledby="customer-comparison-faq-heading">
          <h2 id="customer-comparison-faq-heading" className="font-display text-xl font-semibold">
            Common questions
          </h2>
          <dl className="mt-5 space-y-5">
            {guide.faq.map((item) => (
              <div key={item.question} className="rounded-lg border border-border/60 p-4">
                <dt className="font-medium">{item.question}</dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12 rounded-lg border border-border/60 bg-card/40 p-5">
          <h2 className="font-display text-lg font-semibold">Read the full comparison</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The canonical Verdant guide includes the same cautious comparison and public evidence
            scope. Operator logging tools remain outside this Customer Mode page.
          </p>
          <Link
            to={OREOZ_GELONADE_GUIDE_PATH}
            className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary underline underline-offset-4"
          >
            Open the full public guide
          </Link>
        </section>

        <footer className="mt-12 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          <p>Prepared for customers by {NEXT_DOOR_CUSTOMER_BRAND}.</p>
          <p className="mt-2">Education only. The grower decides what to do.</p>
          <LegalFooterLinks className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2" />
        </footer>
      </article>
    </main>
  );
}
