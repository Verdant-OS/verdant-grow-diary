import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resolvePricingPlanPreselect } from "@/lib/pricingPlanPreselect";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  Check,
  Minus,
  Sparkles,
  ShieldCheck,
  Database,
  Cpu,
  Leaf,
  Info,
  FileText,
  Printer,
  FileSpreadsheet,
  HandCoins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import PricingCard from "@/components/pricing/PricingCard";
import SubscriberInterestForm from "@/components/SubscriberInterestForm";
import {
  PRICING,
  AI_CREDIT_EXPLAINER,
  TRUST_STRIP,
  PRO_MONTHLY_PRICE_USD,
  PRO_ANNUAL_PRICE_USD,
  FOUNDER_LIFETIME_PRICE_USD,
  FOUNDER_LIFETIME_LIMIT,
} from "@/constants/pricing";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackPricingEvent, type PricingAnalyticsName } from "@/lib/pricingAnalytics";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import { VERDANT_PRICING_FAQ_ADDITIONS } from "@/constants/verdantSeoCopy";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import type { SubscriberInterestPlanId } from "@/lib/subscriberInterestRules";
import {
  resolvePaidAcquisitionSource,
  resolvePaidInterestLeadSource,
} from "@/lib/paidAcquisitionAttributionRules";
import { buildAttributedSignupPath } from "@/lib/signupAcquisitionRules";
import { buildCheckoutTrustCopy } from "@/lib/checkoutTrustCopyRules";
import { useFounderSlotsRemaining } from "@/hooks/useFounderSlotsRemaining";

type BillingPeriod = "monthly" | "annual";

type Cell = boolean | string;
type Row = { label: string; free: Cell; pro: Cell; founder: Cell };

const COMPARISON_ROWS: Row[] = [
  {
    label: "Best for",
    free: "Starting a grow diary",
    pro: "Active growers who want sync, history & exports",
    founder: "Early supporters who want lifetime Pro access",
  },
  { label: "Price", free: "$0", pro: "See toggle above", founder: "$129 one-time" },
  { label: "Plant profiles & grow diary", free: true, pro: true, founder: true },
  { label: "Photo logs", free: true, pro: true, founder: true },
  { label: "Manual sensor snapshots", free: true, pro: true, founder: true },
  { label: "Timeline history", free: "Basic", pro: "Extended", founder: "Extended" },
  { label: "Cultivation calendar (history-aware)", free: true, pro: true, founder: true },
  { label: "Date-range diary report (Print / Save PDF)", free: false, pro: true, founder: true },
  { label: "Multi-tent support", free: false, pro: true, founder: true },
  { label: "Exports", free: "Limited", pro: "Advanced", founder: "Advanced" },
  { label: "Post-Grow Learning Report (Print / Save PDF)", free: false, pro: true, founder: true },
  { label: "CSV sensor import (source-labeled)", free: true, pro: true, founder: true },
  { label: "Sensor snapshot history", free: false, pro: true, founder: true },
  { label: "Better timeline filtering", free: false, pro: true, founder: true },
  { label: "Priority support", free: false, pro: true, founder: true },
  { label: "Future Pro features as they stabilize", free: false, pro: true, founder: true },
  { label: "Founder badge / early-supporter access", free: false, pro: false, founder: true },
];

export default function Pricing() {
  const [searchParams] = useSearchParams();
  // Canonical `?plan=` preselect (see resolvePricingPlanPreselect).
  // Legacy `/billing/:plan` redirects here with this exact contract.
  // NEVER auto-opens Paddle — the grower must click a Pricing CTA.
  const preselect = resolvePricingPlanPreselect(searchParams.get("plan"));
  const paidInterestLeadSource = resolvePaidInterestLeadSource(searchParams);
  const freeSignupPath = buildAttributedSignupPath({
    source: resolvePaidAcquisitionSource(searchParams) ?? "pricing_page",
  });
  const [billing, setBilling] = useState<BillingPeriod>(preselect.billing ?? "annual");
  const [interestPlan, setInterestPlan] = useState<SubscriberInterestPlanId>(
    preselect.plan ?? (preselect.billing === "monthly" ? "pro_monthly" : "pro_annual"),
  );
  const lastCheckoutPlanRef = useRef<SubscriberInterestPlanId>(interestPlan);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const recoveryRef = useRef<HTMLElement>(null);
  const {
    openCheckout,
    loading: checkoutLoading,
    environment: checkoutEnvironment,
    unavailableMessage,
    blockedReason,
  } = usePaddleCheckout();
  const checkoutRecoveryReason = blockedReason ?? unavailableMessage;
  const checkoutTrustCopy = buildCheckoutTrustCopy({
    environment: checkoutEnvironment,
    blocked: Boolean(checkoutRecoveryReason),
  });
  const founderSlots = useFounderSlotsRemaining();
  const founderSoldOut = founderSlots.status === "ready" && founderSlots.soldOut;

  function handlePaidIntent(
    planId: SubscriberInterestPlanId,
    eventName: PricingAnalyticsName,
    source: string,
  ) {
    lastCheckoutPlanRef.current = planId;
    setInterestPlan(planId);
    setRecoveryRequested(true);
    trackPricingEvent(eventName, { source });
    if (checkoutRecoveryReason) {
      trackPricingEvent("pricing_checkout_blocked", {
        plan: planId,
        source,
        reason: blockedReason ? "runtime_failure" : "environment_unavailable",
      });
      return;
    }
    void openCheckout({ priceId: planId });
  }
  usePageSeo({
    title: "Pricing — Free, Pro & Founder Lifetime | Verdant Grow Diary",
    description:
      "Free grow diary forever. Pro adds multi-tent support, sensor history and advanced exports. Founder Lifetime is a one-time plan for early supporters.",
    path: "/pricing",
  });

  useEffect(() => {
    trackPricingEvent("pricing_page_view");
    trackFunnelEvent("paywall_viewed", { surface: "pricing" });
  }, []);

  useEffect(() => {
    if (!blockedReason) return;
    trackPricingEvent("pricing_checkout_blocked", {
      plan: lastCheckoutPlanRef.current,
      reason: "runtime_failure",
    });
  }, [blockedReason]);

  useEffect(() => {
    if (!checkoutRecoveryReason || !recoveryRequested) return;
    recoveryRef.current?.focus();
    recoveryRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [checkoutRecoveryReason, recoveryRequested]);

  useEffect(() => {
    const faqEntries: Array<[string, string]> = [
      [
        "Who owns the grow data I put into Verdant?",
        "You do. Your grow logs, photos, and sensor snapshots are yours. Verdant does not sell your data and does not share it with advertisers. Pro includes advanced exports so you can take your full grow history with you whenever you want.",
      ],
      [
        "Is the Free tier really free?",
        "Yes. Plant profiles, the basic grow diary, photo logs, manual notes, the basic timeline, and manual sensor entries are all included on Free. You can run a real grow on Free without paying.",
      ],
      [
        "What do I actually get with Pro?",
        "Multi-tent support, advanced exports including date-range diary reports, sensor snapshot history, longer grow history, advanced timeline filtering, priority support, and early access to advanced grow reports.",
      ],
      [
        "How does the Founder Lifetime Offer work?",
        `$${FOUNDER_LIFETIME_PRICE_USD} once. You get full Pro access for the life of the product. This is a limited early-supporter offer, limited to the first ${FOUNDER_LIFETIME_LIMIT} buyers.`,
      ],
      [
        "Do I need specific hardware?",
        "No. Verdant is hardware-neutral. You can log everything manually, import CSVs, or connect sensors over webhook, MQTT, ESP32, or a Raspberry Pi bridge.",
      ],
      [
        "Does Verdant control my equipment or grow for me?",
        "No. Verdant does not control fans, lights, pumps, heaters, or other equipment. AI insights are suggestions only, and every Action Queue item is grower-approved.",
      ],
      [
        "Can I cancel anytime?",
        "Yes. Pro Monthly and Pro Annual can be canceled at any time. Your grow history stays on your account with read-only access to your logs.",
      ],
      [checkoutTrustCopy.faqQuestion, checkoutTrustCopy.faqAnswer],
      ...VERDANT_PRICING_FAQ_ADDITIONS.map(
        (entry) => [entry.question, entry.answer] as [string, string],
      ),
    ];
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqEntries.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    };
    const products = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Product",
          name: "Verdant Pro",
          description:
            "Multi-tent grow memory, 100 AI Doctor credits/month, advanced exports, and sensor snapshot history.",
          brand: { "@type": "Brand", name: "Verdant Grow Diary" },
          offers: [
            {
              "@type": "Offer",
              price: String(PRO_MONTHLY_PRICE_USD),
              priceCurrency: "USD",
              url: "https://verdantgrowdiary.com/pricing",
              availability: "https://schema.org/InStock",
              category: "Monthly subscription",
            },
            {
              "@type": "Offer",
              price: String(PRO_ANNUAL_PRICE_USD),
              priceCurrency: "USD",
              url: "https://verdantgrowdiary.com/pricing",
              availability: "https://schema.org/InStock",
              category: "Annual subscription",
            },
          ],
        },
        {
          "@type": "Product",
          name: "Verdant Founder Lifetime",
          description: `One-time purchase for lifetime Pro access. Limited to the first ${FOUNDER_LIFETIME_LIMIT} early supporters.`,
          brand: { "@type": "Brand", name: "Verdant Grow Diary" },
          offers: {
            "@type": "Offer",
            price: String(FOUNDER_LIFETIME_PRICE_USD),
            priceCurrency: "USD",
            url: "https://verdantgrowdiary.com/pricing",
            availability: "https://schema.org/LimitedAvailability",
            category: "One-time",
          },
        },
      ],
    };
    const nodes: HTMLScriptElement[] = [];
    for (const payload of [faq, products]) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute("data-page-ldjson", "pricing");
      s.text = JSON.stringify(payload);
      document.head.appendChild(s);
      nodes.push(s);
    }
    return () => {
      for (const n of nodes) n.remove();
    };
  }, [checkoutTrustCopy.faqAnswer, checkoutTrustCopy.faqQuestion]);

  const proPrice = billing === "annual" ? `$${PRO_ANNUAL_PRICE_USD}` : `$${PRO_MONTHLY_PRICE_USD}`;
  const proCadence = billing === "annual" ? "/ year" : "/ month";
  const proFootnote =
    billing === "annual"
      ? `~${PRICING.pro.annualSavingsPercent}% savings vs. monthly`
      : `Or $${PRO_ANNUAL_PRICE_USD}/year — save ~${PRICING.pro.annualSavingsPercent}%`;

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-preselected-plan={preselect.plan ?? ""}
      data-preselected-billing={preselect.billing ?? ""}
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

      {/* Hero */}
      <section className="px-6 pt-10 pb-14 max-w-4xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-primary font-medium">
          Verdant Pro · Pricing
        </p>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight">
          Protect your grow history. Understand what changed. Make better decisions next run.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
          Verdant is a grow room operating system for serious growers who want more than a notebook.
          Track plants, logs, photos, sensor snapshots, alerts, and AI-assisted grow history in one
          clean timeline — without locking yourself into one hardware brand.
        </p>
        <p className="mt-4 text-sm md:text-base text-primary font-medium">
          Plant memory. Sensor truth. Better decisions.
        </p>
      </section>

      {/* Billing toggle */}
      <section className="px-6 pb-8 max-w-6xl mx-auto flex items-center justify-center gap-3">
        <span
          className={[
            "text-sm font-medium",
            billing === "monthly" ? "text-foreground" : "text-muted-foreground",
          ].join(" ")}
        >
          Monthly
        </span>
        <button
          data-testid="billing-toggle"
          type="button"
          role="switch"
          aria-checked={billing === "annual"}
          aria-label="Toggle annual billing"
          onClick={() => {
            const next = billing === "annual" ? "monthly" : "annual";
            setBilling(next);
            setInterestPlan(next === "annual" ? "pro_annual" : "pro_monthly");
            trackPricingEvent("pricing_billing_toggle", { period: next });
          }}
          className="relative inline-flex h-7 w-12 items-center rounded-full border border-border/60 bg-secondary transition-colors"
        >
          <span
            className={[
              "inline-block h-5 w-5 rounded-full bg-primary transition-transform",
              billing === "annual" ? "translate-x-6" : "translate-x-1",
            ].join(" ")}
          />
        </button>
        <span
          className={[
            "text-sm font-medium",
            billing === "annual" ? "text-foreground" : "text-muted-foreground",
          ].join(" ")}
        >
          Annual
        </span>
      </section>

      <section className="px-6 pb-8 max-w-3xl mx-auto" aria-label="Checkout status">
        <div
          data-testid="pricing-checkout-trust"
          data-checkout-state={checkoutTrustCopy.state}
          className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/35 px-4 py-3"
          aria-live="polite"
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">{checkoutTrustCopy.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {checkoutTrustCopy.summary}
            </p>
          </div>
        </div>
      </section>

      {/* Pricing tier cards */}
      <section className="px-6 pb-10 max-w-6xl mx-auto grid gap-8 md:gap-6 md:grid-cols-3">
        {/* Free */}
        <PricingCard
          testId="pricing-card-free"
          name={PRICING.free.name}
          subtitle={PRICING.free.subtitle}
          price={`$${PRICING.free.price}`}
          cadence={` / ${PRICING.free.cadence}`}
          description={PRICING.free.description}
          features={PRICING.free.features}
          cta={
            <Link to={freeSignupPath} className="block">
              <Button
                size="lg"
                variant="outline"
                className="w-full h-auto min-h-11 whitespace-normal"
                onClick={() => trackPricingEvent("pricing_cta_free_clicked")}
              >
                Start Free
              </Button>
            </Link>
          }
        />

        {/* Pro */}
        <PricingCard
          testId="pricing-card-pro"
          name={PRICING.pro.name}
          subtitle={PRICING.pro.subtitle}
          price={proPrice}
          cadence={proCadence}
          description={PRICING.pro.description}
          features={PRICING.pro.features}
          highlighted
          badge={PRICING.pro.badge}
          footnote={proFootnote}
          cta={
            <Button
              size="lg"
              // h-auto + whitespace-normal: the priced label ("Upgrade to
              // Pro — $99/ year") must wrap instead of forcing the card
              // wider than a ≤390px viewport (Button defaults to nowrap).
              className="w-full h-auto min-h-11 whitespace-normal"
              disabled={checkoutLoading}
              data-testid={
                billing === "annual" ? "pricing-cta-pro-annual" : "pricing-cta-pro-monthly"
              }
              onClick={() => {
                const priceId = billing === "annual" ? "pro_annual" : "pro_monthly";
                handlePaidIntent(
                  priceId,
                  billing === "annual"
                    ? "pricing_cta_pro_annual_clicked"
                    : "pricing_cta_pro_monthly_clicked",
                  "plan_card",
                );
              }}
            >
              {checkoutRecoveryReason ? (
                "Join the Pro launch list"
              ) : (
                <>
                  Upgrade to Pro — {proPrice}
                  {proCadence}
                </>
              )}
            </Button>
          }
        />

        {/* Founder Lifetime Offer */}
        <PricingCard
          testId="pricing-card-founder"
          name={PRICING.founder.name}
          subtitle={PRICING.founder.subtitle}
          price={`$${PRICING.founder.price}`}
          cadence={` ${PRICING.founder.cadence}`}
          description={PRICING.founder.description}
          features={PRICING.founder.features}
          badge={
            founderSlots.status === "ready" && founderSlots.claimed !== null
              ? `${founderSlots.claimed} of ${founderSlots.total} claimed`
              : PRICING.founder.badge
          }
          footnote={
            founderSoldOut
              ? "Founder Lifetime is currently sold out. Additional slots may open if a purchase is refunded."
              : `Founder Lifetime is limited; availability may close manually when the first ${PRICING.founder.limit} are claimed.`
          }
          cta={
            <Button
              size="lg"
              className="w-full h-auto min-h-11 whitespace-normal"
              disabled={checkoutLoading || founderSoldOut}
              data-testid="pricing-cta-founder-lifetime"
              data-founder-remaining={founderSlots.remaining ?? ""}
              onClick={() => {
                handlePaidIntent(
                  "founder_lifetime",
                  "pricing_cta_founder_lifetime_clicked",
                  "plan_card",
                );
              }}
            >
              {founderSoldOut
                ? "Founder Lifetime sold out"
                : checkoutRecoveryReason
                  ? "Join the Founder launch list"
                  : `Claim Founder Lifetime — $${PRICING.founder.price}`}
            </Button>
          }
        />
      </section>

      {checkoutRecoveryReason && (
        <section
          ref={recoveryRef}
          id="subscriber-interest"
          tabIndex={-1}
          aria-label="Paid plan launch list"
          data-testid="pricing-checkout-recovery"
          className="px-6 pb-12 max-w-3xl mx-auto"
        >
          <div className="rounded-2xl border border-primary/35 bg-card/40 p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Paid plan update
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              Checkout isn't ready here yet. Get one launch email.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{checkoutRecoveryReason}</p>
            <div className="mt-5">
              <SubscriberInterestForm planId={interestPlan} leadSource={paidInterestLeadSource} />
            </div>
          </div>
        </section>
      )}

      {/* AI Credit explainer */}
      <section className="px-6 pb-12 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-border/60 bg-card/30 backdrop-blur p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">{AI_CREDIT_EXPLAINER.title}</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {AI_CREDIT_EXPLAINER.points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Leaf className="h-3.5 w-3.5 mt-0.5 text-primary/70 shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground italic">{AI_CREDIT_EXPLAINER.note}</p>
        </div>
      </section>

      {/* Trust strip */}
      <section className="px-6 pb-10 max-w-5xl mx-auto">
        <div
          data-testid="pricing-trust-strip"
          className="rounded-xl border border-border/50 bg-card/30 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
        >
          <span className="font-semibold text-foreground uppercase tracking-wider">
            {TRUST_STRIP.label}
          </span>
          <span className="hidden sm:inline text-border">|</span>
          {TRUST_STRIP.items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1">
              <Check className="h-3 w-3 text-primary" />
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Proof callouts — what Pro actually delivers today */}
      <section className="px-6 pb-2 max-w-5xl mx-auto" data-testid="pricing-proof-callouts">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          What Pro actually delivers today
        </h2>
        <p className="mt-3 text-sm text-muted-foreground text-center max-w-2xl mx-auto">
          Real, shipped surfaces — not promises. Pro upgrades the value of the grow history you are
          already building on Free.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <ProofCallout
            icon={<FileText className="h-5 w-5" />}
            title="Post-Grow Learning Report"
            body="Turn a completed run into a learning report: what changed, what was logged, which alerts appeared, what actions were reviewed, and what to repeat or avoid next run."
          />
          <ProofCallout
            icon={<Printer className="h-5 w-5" />}
            title="Print / Save PDF export"
            body="Export your Post-Grow Learning Report through your browser print dialog and save it as PDF. No server-side PDF service. No paywalled download — your browser is the printer."
          />
          <ProofCallout
            icon={<FileSpreadsheet className="h-5 w-5" />}
            title="Sensor truth · CSV import"
            body="CSV imports stay labeled as CSV. Manual, demo, stale, and invalid readings stay clearly labeled so Verdant does not pretend weak data is live data."
          />
          <ProofCallout
            icon={<HandCoins className="h-5 w-5" />}
            title="Approval-required actions"
            body="Verdant can suggest next steps, but the grower decides. No blind automation. No device commands. The Action Queue stays grower-approved by design."
          />
        </div>
      </section>

      {/* Founder Lifetime highlight band */}
      <section className="px-6 py-10 max-w-5xl mx-auto">
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center">
          <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl md:text-2xl font-semibold">
              Founder Lifetime Offer — ${FOUNDER_LIFETIME_PRICE_USD} once, full Pro forever
            </h2>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              Verdant is founder-built. This is a limited early-supporter offer for the first{" "}
              {FOUNDER_LIFETIME_LIMIT} growers who back the product early. Pay once, get full Pro
              access for the life of the product, and help shape what ships next. No hype, no
              countdown gimmicks — when the first {FOUNDER_LIFETIME_LIMIT} are claimed, the offer
              ends.
            </p>
            <Link
              to="/founder"
              className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-4"
              onClick={() =>
                trackPricingEvent("pricing_founder_details_clicked", {
                  source: "highlight_band",
                })
              }
            >
              See exactly what Founder includes
            </Link>
          </div>
          <Button
            size="lg"
            className="shrink-0"
            disabled={checkoutLoading || founderSoldOut}
            data-testid="pricing-cta-founder-highlight"
            onClick={() => {
              handlePaidIntent(
                "founder_lifetime",
                "pricing_cta_founder_lifetime_clicked",
                "highlight_band",
              );
            }}
          >
            {founderSoldOut
              ? "Founder Lifetime sold out"
              : checkoutRecoveryReason
                ? "Join the Founder launch list"
                : "Claim Founder Lifetime"}
          </Button>
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          Compare Free, Pro, and Founder Lifetime
        </h2>
        <p className="mt-3 text-sm text-muted-foreground text-center max-w-2xl mx-auto">
          Free is genuinely useful for starting a grow diary. Pro adds deeper history, advanced
          exports, and multi-tent support. Founder Lifetime is a limited early-supporter offer that
          includes full Pro access.
        </p>

        <div className="mt-8 overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[640px] text-sm" data-testid="pricing-comparison-table">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Feature</th>
                <th className="text-center font-medium px-4 py-3">Free</th>
                <th className="text-center font-medium px-4 py-3 text-primary">Pro</th>
                <th className="text-center font-medium px-4 py-3 text-primary">Founder Lifetime</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-border/40">
                  <td className="px-4 py-3 font-medium">{row.label}</td>
                  <td className="px-4 py-3 text-center">
                    <CellValue value={row.free} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CellValue value={row.pro} accent />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CellValue value={row.founder} accent />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground text-center sm:hidden">
          Swipe to compare all three plans →
        </p>
      </section>

      {/* Trust / data ownership */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          Your grow. Your data. Your call.
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <TrustCard
            icon={<Database className="h-5 w-5" />}
            title="You own your grow history"
            body="Your logs, photos, and sensor snapshots belong to you. Pro includes advanced exports so you can take your full grow history with you anytime. Verdant does not sell your data."
          />
          <TrustCard
            icon={<Cpu className="h-5 w-5" />}
            title="Hardware-neutral"
            body="Verdant works with the gear you already own. Bring sensors over webhook, MQTT, Raspberry Pi bridge, or manual entry. No vendor lock-in. No forced ecosystem."
          />
          <TrustCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Grower stays in control"
            body="Verdant suggests, you decide. AI-assisted insights are cautious by design. Verdant does not control your equipment and never makes decisions for you."
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-12 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">Pricing FAQ</h2>
        <Accordion
          type="single"
          collapsible
          className="mt-6"
          onValueChange={(value) => {
            if (value) trackPricingEvent("pricing_faq_opened", { item: value });
          }}
        >
          <AccordionItem value="data-ownership">
            <AccordionTrigger>Who owns the grow data I put into Verdant?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              You do. Your grow logs, photos, and sensor snapshots are yours. Verdant does not sell
              your data and does not share it with advertisers. Pro includes advanced exports so you
              can take your full grow history with you whenever you want.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="free-forever">
            <AccordionTrigger>Is the Free tier really free?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Yes. Plant profiles, the basic grow diary, photo logs, manual notes, the basic
              timeline, and manual sensor entries are all included on Free. You can run a real grow
              on Free without paying.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pro-what">
            <AccordionTrigger>What do I actually get with Pro?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Multi-tent support, advanced exports including date-range diary reports, sensor
              snapshot history, longer grow history, advanced timeline filtering, priority support,
              and early access to advanced grow reports. Pro features ship over time, only as they
              stabilize.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="founder-lifetime">
            <AccordionTrigger>How does the Founder Lifetime Offer work?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              ${FOUNDER_LIFETIME_PRICE_USD} once. You get full Pro access for the life of the
              product. This is a limited early-supporter offer, not a separate recurring plan.
              Limited to the first {FOUNDER_LIFETIME_LIMIT} buyers. When the first{" "}
              {FOUNDER_LIFETIME_LIMIT} are claimed, the offer ends. No fake countdowns and no
              expiring timers beyond that real limit.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="hardware">
            <AccordionTrigger>Do I need specific hardware?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              No. Verdant is hardware-neutral. You can log everything manually, import CSVs, or
              connect sensors over webhook, MQTT, ESP32, or a Raspberry Pi bridge. Bring the gear
              you already own — Verdant does not sell or require any specific gear.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ai-safety">
            <AccordionTrigger>Does Verdant control my equipment or grow for me?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              No. Verdant does not control fans, lights, pumps, heaters, dehumidifiers, or any other
              equipment. AI-assisted insights are suggestions only, and every action in the Action
              Queue is grower-approved before anything happens. The grower stays in control.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="cancel">
            <AccordionTrigger>Can I cancel anytime?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Yes. Pro Monthly and Pro Annual can be canceled at any time. If you cancel, your grow
              history stays on your account and you keep read-only access to your logs.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="what-paying-for" data-testid="pricing-faq-what-paying-for">
            <AccordionTrigger>What am I really paying for?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              You are paying for Verdant to become your grow memory system: protected grow history,
              multi-tent organization, source-labeled sensor data, reports, exports, and safer
              decision context across runs.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="device-control" data-testid="pricing-faq-device-control">
            <AccordionTrigger>Does Verdant control my grow equipment?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              No. Verdant does not send device commands or blindly automate your grow. It can
              organize evidence and suggest next steps, but the grower decides.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="csv-imports" data-testid="pricing-faq-csv-imports">
            <AccordionTrigger>How does Verdant handle CSV sensor imports?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              CSV imports stay labeled as CSV. Verdant keeps manual, demo, stale, invalid, and CSV
              readings clearly labeled so weak or imported data is not mistaken for direct
              telemetry.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="post-grow-report" data-testid="pricing-faq-post-grow-report">
            <AccordionTrigger>What does the Post-Grow Learning Report do?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              It turns a completed run into a reviewable report: what changed, what was logged,
              which alerts appeared, which actions were reviewed, and what to repeat or avoid next
              run.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="checkout-status" data-testid="pricing-faq-checkout-status">
            <AccordionTrigger>{checkoutTrustCopy.faqQuestion}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {checkoutTrustCopy.faqAnswer}
            </AccordionContent>
          </AccordionItem>

          {VERDANT_PRICING_FAQ_ADDITIONS.map((entry, i) => (
            <AccordionItem
              key={entry.question}
              value={`pricing-faq-grower-${i}`}
              data-testid={`pricing-faq-grower-${i}`}
            >
              <AccordionTrigger>{entry.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{entry.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-14 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Start free. Upgrade when Verdant becomes your real grow memory system.
        </h2>
        <p className="mt-3 text-muted-foreground">
          The free tier is built to be genuinely useful. Pro is for growers who want their full grow
          history backed up, synced, and easy to revisit.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to={freeSignupPath}>
            <Button
              size="lg"
              variant="outline"
              onClick={() => trackPricingEvent("pricing_cta_free_clicked", { source: "footer" })}
            >
              Start Free
            </Button>
          </Link>
          <Button
            size="lg"
            disabled={checkoutLoading}
            onClick={() => {
              handlePaidIntent("pro_monthly", "pricing_cta_pro_monthly_clicked", "footer");
            }}
          >
            {checkoutRecoveryReason ? "Join the Pro launch list" : "Upgrade to Pro"}
          </Button>
        </div>
      </section>

      <footer className="px-6 py-10 border-t border-border/40 text-sm text-muted-foreground text-center space-y-2">
        <p>
          Verdant Grow Diary ·{" "}
          <a className="hover:text-foreground" href="https://verdantgrowdiary.com">
            verdantgrowdiary.com
          </a>
        </p>
        <p>Software only. We do not sell cannabis, seeds, or cultivation equipment.</p>
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
          30-day money-back guarantee.
        </p>
      </footer>
    </main>
  );
}

function CellValue({ value, accent }: { value: boolean | string; accent?: boolean }) {
  if (value === true) {
    return (
      <Check
        className={["h-4 w-4 mx-auto", accent ? "text-primary" : "text-foreground"].join(" ")}
        aria-label="Included"
      />
    );
  }
  if (value === false) {
    return <Minus className="h-4 w-4 mx-auto text-muted-foreground/60" aria-label="Not included" />;
  }
  return <span className={accent ? "text-primary font-medium" : ""}>{value}</span>;
}

function TrustCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6">
      <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function ProofCallout({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6"
      data-testid="pricing-proof-callout"
    >
      <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
