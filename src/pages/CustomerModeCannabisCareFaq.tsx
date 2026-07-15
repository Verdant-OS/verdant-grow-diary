/**
 * CustomerModeCannabisCareFaq — public, read-only Customer Mode page for
 * the 5-question cannabis plant care FAQ.
 *
 * Mounted at /customer/:shareId/cannabis-care OUTSIDE the AppShell.
 *
 * Hard constraints:
 *   - No Supabase imports. No fetch. No private grow data.
 *   - No AI/model calls. No Action Queue writes. No device control.
 *   - The :shareId path param is treated as opaque and never rendered.
 *   - Pure presenter page; content comes from shared constants.
 */
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import LegalFooterLinks from "@/components/LegalFooterLinks";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CANNABIS_PLANT_CARE_FAQ } from "@/constants/cannabisPlantCareFaq";
import {
  buildCustomerModeGuideViewModel,
  CUSTOMER_GUIDE_SHELL_DISCLAIMER,
} from "@/lib/customerModeGuideViewModel";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";

export default function CustomerModeCannabisCareFaq() {
  const params = useParams<{ shareId?: string }>();
  const shareId = params.shareId ?? null;

  // Use the same view-model for the brand label and disclaimer so this page
  // stays visually consistent with the main Customer Mode guide.
  const vm = buildCustomerModeGuideViewModel({ shareId });

  usePageSeo({
    title: "Cannabis Plant Care FAQ | Customer Mode | Verdant",
    description:
      "Answers to the five most common cannabis plant care questions for home growers, shared from a Verdant grower.",
    path: shareId ? `/customer/${shareId}/cannabis-care` : "/customer/cannabis-care",
  });

  useEffect(() => {
    const faq = buildFaqPageJsonLd({
      questions: CANNABIS_PLANT_CARE_FAQ,
    });
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-page-ldjson", "customer-mode-cannabis-care-faq");
    s.text = safeJsonLdStringify(faq);
    document.head.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  return (
    <main
      data-testid="customer-mode-cannabis-care-faq-page"
      data-mode="customer"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Customer Mode
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {vm.brandLabel}
          </h1>
          <p
            data-testid="customer-mode-shell-disclaimer"
            className="mt-3 text-xs text-amber-300/80"
          >
            {CUSTOMER_GUIDE_SHELL_DISCLAIMER}
          </p>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-6 space-y-4">
        <div className="rounded-xl border border-border/60 bg-card/60 p-5">
          <Link
            to={shareId ? `/customer/${shareId}` : "/customer/guide"}
            className="text-sm text-muted-foreground hover:text-foreground underline"
            data-testid="customer-mode-cannabis-care-back-link"
          >
            ← Back to customer guide
          </Link>
        </div>

        <section
          data-testid="customer-mode-cannabis-care-faq"
          aria-labelledby="customer-mode-cannabis-care-faq-heading"
          className="rounded-xl border border-border/60 bg-card/60 p-5"
        >
          <h2
            id="customer-mode-cannabis-care-faq-heading"
            className="text-base font-semibold tracking-tight"
          >
            Cannabis Plant Care FAQ
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Verdant suggests; the grower decides. Verdant cannot touch your
            equipment. These are general care principles; every cultivar and
            grow environment is different.
          </p>

          <Accordion type="single" collapsible className="mt-4">
            {CANNABIS_PLANT_CARE_FAQ.map((item, i) => (
              <AccordionItem
                key={item.question}
                value={`faq-${i}`}
                data-testid="customer-mode-cannabis-care-faq-item"
              >
                <AccordionTrigger className="text-left text-sm font-medium">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <footer
          data-testid="customer-mode-cannabis-care-faq-footer"
          className="pt-4 text-center text-xs text-muted-foreground"
        >
          Powered by Verdant — private grow data stays with the grower.
          <LegalFooterLinks className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" />
        </footer>
      </article>
    </main>
  );
}
