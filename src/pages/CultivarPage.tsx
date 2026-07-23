/**
 * Public source-backed cultivar detail page.
 *
 * The profile is reference context only. It does not read private plant data,
 * write rows, diagnose a plant, create alerts, or generate Action Queue items.
 */
import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import CultivarFollowButton from "@/components/CultivarFollowButton";
import CultivarPhenoSampleModule from "@/components/CultivarPhenoSampleModule";
import CultivarQaPanel from "@/components/CultivarQaPanel";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  findCultivarBySlug,
  formatVerificationStatus,
  getCultivarGuideSections,
  getCultivarSources,
  type CultivarGuideSectionKey,
} from "@/constants/verdantCultivars";
import { VERDANT_SITE_ORIGIN } from "@/constants/verdantSeoContent";
import {
  buildArticleJsonLd,
  buildBreadcrumbListJsonLd,
  buildCultivarCollectionJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";
import { buildCultivarSummaryRows } from "@/lib/cultivarReferenceViewModel";
import {
  buildCultivarBreadcrumbItems,
  buildCultivarFaqItems,
} from "@/lib/cultivarDetailSeo";

function sectionId(key: CultivarGuideSectionKey): string {
  return `guide-${key.replace(/_/g, "-")}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date)
    : "Not recorded";
}

export default function CultivarPage() {
  const { slug } = useParams<{ slug: string }>();
  const cultivar = findCultivarBySlug(slug);
  const sections = cultivar ? getCultivarGuideSections(cultivar) : [];
  const sources = cultivar ? getCultivarSources(cultivar) : [];
  const summaryRows = cultivar
    ? buildCultivarSummaryRows(cultivar, formatDate(cultivar.lastVerifiedAt))
    : [];
  const faqItems = cultivar ? buildCultivarFaqItems(cultivar) : [];

  usePageSeo({
    title: cultivar
      ? `${cultivar.name} Cultivator Guide (${cultivar.searchAlias} info) | Verdant`
      : "Strain Reference Library | Verdant",
    description: cultivar
      ? `${cultivar.name} grow guide: lineage (${cultivar.lineage}), ${cultivar.flowerWeeks} flower, environment ranges by stage, and common issues home growers report.`
      : "Source-backed cultivar references with reported tendencies, confidence, and missing information.",
    path: cultivar ? `/cultivars/${cultivar.slug}` : "/cultivars",
  });

  useEffect(() => {
    if (!cultivar) return;
    const url = `${VERDANT_SITE_ORIGIN}/cultivars/${cultivar.slug}`;
    const jsonLd = buildCultivarCollectionJsonLd({
      name: `${cultivar.name} source-backed grow reference`,
      alternateName: [cultivar.searchAlias, ...cultivar.aliases].join(", "),
      description: `${cultivar.name} reference profile with reported lineage (${cultivar.lineage}), ${cultivar.flowerWeeks}, sources, confidence, and missing-information notes.`,
      url,
      properties: [
        { name: "Lineage", value: cultivar.lineage },
        { name: "Life cycle", value: cultivar.lifeCycle },
        { name: "Reported flower window", value: cultivar.flowerWeeks },
        { name: "Difficulty", value: cultivar.difficulty },
        { name: "Evidence state", value: formatVerificationStatus(cultivar.verificationStatus) },
      ],
    });
    // Editorial FAQ + Article + Breadcrumb enrich discovery. The FAQ JSON-LD is
    // built from the SAME faqItems rendered visibly below (single source of
    // truth). No Product/Offer schema: these are reference profiles, not
    // products, and carry no fixed chemistry or guaranteed outcome.
    const verifiedDate = cultivar.lastVerifiedAt.slice(0, 10);
    const faq = buildFaqPageJsonLd({ pageUrl: url, questions: faqItems });
    const crumbs = buildBreadcrumbListJsonLd({
      items: buildCultivarBreadcrumbItems(cultivar, VERDANT_SITE_ORIGIN),
    });
    const article = buildArticleJsonLd({
      headline: `${cultivar.name} Cultivar Guide`,
      description: `${cultivar.name} source-backed grow reference: reported lineage (${cultivar.lineage}), ${cultivar.flowerWeeks}, environment context by stage, and common issues home growers report.`,
      url,
      datePublished: verifiedDate,
      dateModified: verifiedDate,
      siteUrl: VERDANT_SITE_ORIGIN,
    });

    const docs: Array<[string, unknown]> = [
      [`cultivar-${cultivar.slug}-collection`, jsonLd],
      [`cultivar-${cultivar.slug}-faq`, faq],
      [`cultivar-${cultivar.slug}-breadcrumb`, crumbs],
      [`cultivar-${cultivar.slug}-article`, article],
    ];
    const scripts = docs.map(([id, data]) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-page-ldjson", id);
      script.text = safeJsonLdStringify(data);
      document.head.appendChild(script);
      return script;
    });
    return () => scripts.forEach((script) => script.remove());
  }, [cultivar, faqItems]);

  if (!cultivar) return <Navigate to="/cultivars" replace />;

  return (
    <main
      data-testid="cultivar-page"
      data-cultivar-slug={cultivar.slug}
      className="min-h-screen bg-background text-foreground"
    >
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-5 sm:px-6">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex w-full items-center justify-between gap-4 text-sm sm:w-auto sm:justify-start">
          <Link to="/cultivars" className="text-muted-foreground hover:text-foreground">
            All references
          </Link>
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <div className="max-w-4xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary/80">
            Strain Reference Library
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl">
            {cultivar.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aliases: {cultivar.aliases.length > 0 ? cultivar.aliases.join(", ") : "None recorded"}
          </p>

          <div className="mt-4">
            <CultivarFollowButton cultivar={cultivar} />
          </div>

          <div
            data-testid="cultivar-reference-banner"
            className="mt-6 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4"
          >
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              {formatVerificationStatus(cultivar.verificationStatus)} — not plant-specific advice
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This profile supplies a starting hypothesis. Your plant&apos;s logs, stage, medium,
              source-labeled sensors, and observed response remain authoritative.
            </p>
          </div>
        </div>

        <dl className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryRows.map((row) => (
            <div key={row.label} className="rounded-lg border border-border/60 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
              <dd className="mt-1 font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 max-w-4xl">
          <p className="text-lg text-muted-foreground">{cultivar.intro}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Reported lineage:</span>{" "}
            {cultivar.lineage}
          </p>
        </div>

        <nav
          aria-label={`${cultivar.name} guide sections`}
          data-testid="cultivar-sticky-section-nav"
          className="sticky top-14 z-20 -mx-4 mt-8 overflow-x-auto border-y border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border"
        >
          <ul className="flex min-w-max gap-2 text-sm">
            {sections.map((section) => (
              <li key={section.key}>
                <a
                  href={`#${sectionId(section.key)}`}
                  className="inline-flex min-h-[40px] items-center rounded-full border border-border/70 px-3 py-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {section.title}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#sources"
                className="inline-flex min-h-[40px] items-center rounded-full border border-border/70 px-3 py-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                Sources
              </a>
            </li>
          </ul>
        </nav>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            {sections.map((section) => (
              <section
                key={section.key}
                id={sectionId(section.key)}
                data-guide-section={section.key}
                className="scroll-mt-32 rounded-xl border border-border/60 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-semibold">{section.title}</h2>
                  <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs capitalize text-muted-foreground">
                    {section.confidence} confidence
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{section.summary}</p>

                {section.reportedTendencies.length > 0 ? (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold">Reported tendencies</h3>
                    <ul className="mt-2 space-y-3">
                      {section.reportedTendencies.map((item) => (
                        <li key={`${item.text}-${item.confidence}`} className="rounded-lg bg-muted/35 p-3 text-sm">
                          <p>{item.text}</p>
                          <p className="mt-1 text-xs capitalize text-muted-foreground">
                            {item.confidence} confidence · {item.evidenceKeys.length} evidence reference
                            {item.evidenceKeys.length === 1 ? "" : "s"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold">Cautious guidance</h3>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      {section.guidance.map((item) => (
                        <li key={item.text} className="rounded-lg border border-border/50 p-3">
                          {item.text}
                          <span className="ml-2 text-xs uppercase tracking-wide">Risk: {item.risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Cautions</h3>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                      {section.cautions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {section.missingInformation.length > 0 ? (
                  <div className="mt-5 rounded-lg border border-dashed border-border/70 p-3">
                    <h3 className="text-sm font-semibold">Information limited</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {section.missingInformation.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ))}

            <CultivarPhenoSampleModule cultivar={cultivar} />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
            <section className="rounded-xl border border-border/60 p-4">
              <h2 className="font-display text-lg font-semibold">Profile summary</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Difficulty</dt>
                  <dd className="mt-1">{cultivar.difficulty}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Height tendency</dt>
                  <dd className="mt-1 capitalize">{cultivar.heightCategory}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Market classification</dt>
                  <dd className="mt-1 capitalize">{cultivar.marketClassification}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Data origin</dt>
                  <dd className="mt-1 capitalize">{cultivar.dataOrigin}</dd>
                </div>
              </dl>
            </section>

            <section id="sources" className="scroll-mt-32 rounded-xl border border-border/60 p-4">
              <h2 className="font-display text-lg font-semibold">Sources</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                References support individual claims. Verdant does not copy source marketing text.
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {sources.map((source) => (
                  <li key={source.key} className="rounded-lg bg-muted/30 p-3">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {source.title}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {source.publisher} · {source.sourceType.replace(/_/g, " ")} · retrieved {formatDate(source.retrievedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>

        <section
          data-testid="cultivar-faq"
          aria-labelledby="cultivar-faq-heading"
          className="mt-10"
        >
          <h2 id="cultivar-faq-heading" className="font-display text-2xl font-semibold">
            Common questions about {cultivar.name}
          </h2>
          <dl className="mt-4 space-y-4">
            {faqItems.map((item) => (
              <div
                key={item.question}
                data-testid="cultivar-faq-item"
                className="rounded-xl border border-border/70 p-4"
              >
                <dt className="font-semibold text-foreground">{item.question}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <CultivarQaPanel cultivar={cultivar} />

        <section className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-display text-xl font-semibold">
            Track {cultivar.name} in your own grow
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            A linked reference may provide context later, but Verdant will keep the plant&apos;s actual
            logs and sensors in charge. Reference pages never create alerts, nutrient actions,
            irrigation actions, or equipment commands.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              to="/auth"
              data-testid="cultivar-signup-cta"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
            >
              Start a free grow diary
            </Link>
            <Link
              to="/cultivars"
              className="inline-flex items-center rounded-md border border-border px-4 py-2 font-semibold hover:border-primary/40"
            >
              Browse all references
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
