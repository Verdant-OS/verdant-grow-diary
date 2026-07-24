/**
 * CustomerModeGuide — public, read-only Customer Mode shell page.
 *
 * Mounted at /customer/:shareId OUTSIDE the AppShell so:
 *   - AppShell chrome (header, Quick Log / Fast Add) is NOT rendered.
 *   - No auth-gated providers run.
 *
 * Hard constraints (presenter-only shell):
 *   - No Supabase imports. No fetch. No private diary, sensor, or
 *     raw_payload access. No AI/model calls. No Action Queue writes.
 *   - The :shareId path param is treated as opaque. It is NEVER rendered
 *     as a private grow/plant/tent id.
 *   - All content is customer-facing placeholder copy until a
 *     share-token publishing backend exists.
 */
import { useEffect, useMemo } from "react";
import LegalFooterLinks from "@/components/LegalFooterLinks";
import { Link, useParams } from "react-router-dom";
import CustomerGuideSectionView from "@/components/customer/CustomerGuideSection";
import CustomerGuideTimeline from "@/components/customer/CustomerGuideTimeline";
import CustomerGuideQrBlock from "@/components/customer/CustomerGuideQrBlock";
import CustomerGuideTrustFooter from "@/components/customer/CustomerGuideTrustFooter";
import { buildCustomerModeGuideViewModel } from "@/lib/customerModeGuideViewModel";
import { VERDANT_CUSTOMER_MODE_GROWER_FAQ } from "@/constants/verdantSeoContent";
import { buildFaqPageJsonLd, safeJsonLdStringify } from "@/lib/seoStructuredData";
import { usePageSeo } from "@/hooks/usePageSeo";

export default function CustomerModeGuide() {
  const params = useParams<{ shareId?: string }>();
  const shareId = params.shareId ?? null;
  usePageSeo({
    title: "Customer guide — Verdant Grow Diary",
    description:
      "A shared, customer-facing view of a Verdant grower's cultivation notes. Private share link — not indexed.",
    path: shareId ? `/customer/${shareId}` : "/customer",
    // Share links are opaque per-customer surfaces; keep them out of search.
    noindex: true,
  });
  const vm = useMemo(() => buildCustomerModeGuideViewModel({ shareId }), [shareId]);

  useEffect(() => {
    const faq = buildFaqPageJsonLd({
      questions: VERDANT_CUSTOMER_MODE_GROWER_FAQ,
    });
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-page-ldjson", "customer-mode-grower-faq");
    s.text = safeJsonLdStringify(faq);
    document.head.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  return (
    <main
      data-testid="customer-mode-guide-page"
      data-mode="customer"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Customer Mode
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{vm.brandLabel}</h1>
          <p
            data-testid="customer-mode-shell-disclaimer"
            className="mt-3 text-xs text-amber-300/80"
          >
            {vm.shellDisclaimer}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-6 space-y-4">
        {vm.sections.map((section) => (
          <CustomerGuideSectionView key={section.id} section={section} />
        ))}

        <CustomerGuideQrBlock shareId={shareId} />

        <CustomerGuideTimeline
          label={vm.timeline.label}
          events={vm.timeline.events}
          emptyCopy={vm.timeline.emptyCopy}
          publishedOnlyCopy={vm.timeline.publishedOnlyCopy}
        />

        <section
          data-testid="customer-mode-grower-faq"
          aria-labelledby="customer-mode-grower-faq-heading"
          className="rounded-xl border border-border/60 bg-card/60 p-5"
        >
          <h2
            id="customer-mode-grower-faq-heading"
            className="text-base font-semibold tracking-tight"
          >
            Grower questions
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Verdant suggests; the grower decides. Verdant cannot touch your equipment. Sensor
            readings are labeled by source — live, manual, csv, demo, stale, or invalid.
          </p>
          <dl className="mt-4 space-y-4">
            {VERDANT_CUSTOMER_MODE_GROWER_FAQ.map((item) => (
              <div key={item.question} data-testid={`customer-mode-grower-faq-item`}>
                <dt className="text-sm font-medium">{item.question}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          data-testid="customer-mode-cannabis-care-link"
          className="rounded-xl border border-border/60 bg-card/60 p-5"
        >
          <h2 className="text-base font-semibold tracking-tight">Cannabis plant care FAQ</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Quick answers to the five most common home-grower questions: watering, nutrients, yellow
            leaves, environment, and harvest timing.
          </p>
          <Link
            to={shareId ? `/customer/${shareId}/cannabis-care` : "/customer/guide/cannabis-care"}
            className="mt-3 inline-block text-sm text-primary hover:underline"
            data-testid="customer-mode-cannabis-care-link-anchor"
          >
            Open the FAQ →
          </Link>
        </section>

        <CustomerGuideTrustFooter />

        <footer
          data-testid="customer-mode-guide-footer"
          className="pt-4 text-center text-xs text-muted-foreground"
        >
          Powered by Verdant — private grow data stays with the grower.
          <LegalFooterLinks className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" />
        </footer>
      </div>
    </main>
  );
}
