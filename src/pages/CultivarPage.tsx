/**
 * Public source-backed cultivar detail page.
 *
 * The profile is reference context only. It does not read private plant data,
 * write rows, diagnose a plant, create alerts, or generate Action Queue items.
 */
import { useEffect } from "react";
import { Link, useParams } from "@/lib/react-router-compat";
import BrandLogo from "@/components/BrandLogo";
import CultivarBlueprintCrossSell from "@/components/CultivarBlueprintCrossSell";
import CultivarFollowButton from "@/components/CultivarFollowButton";
import CultivarPhenoSampleModule from "@/components/CultivarPhenoSampleModule";
import CultivarQaPanel from "@/components/CultivarQaPanel";
import { usePageSeo } from "@/hooks/usePageSeo";
import { usePublishedCultivars } from "@/hooks/usePublishedCultivars";
import {
  formatVerificationStatus,
  type CultivarGuideSectionKey,
} from "@/constants/verdantCultivars";
import type { VerdantCultivarProfile } from "@/constants/strainReferenceLibrary";
import { cultivarReferenceSourceNotice } from "@/constants/cultivarReferenceSourceCopy";
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
  cultivarVerificationIsSearchIndexable,
} from "@/lib/cultivarDetailSeo";
import { CultivarVerifiedProfileRules } from "@/lib/cultivarVerifiedProfileRules";

function sectionId(key: CultivarGuideSectionKey): string {
  return `guide-${key.replace(/_/g, "-")}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date)
    : "Not recorded";
}

export function CultivarNotFound({ slug }: { slug?: string }) {
  return (
    <main data-testid="cultivar-not-found" className="min-h-screen bg-background px-4 py-16">
      <h1 className="font-display text-3xl font-bold">Cultivar not found</h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        {slug ? `"${slug}" is not in the strain reference library.` : "No cultivar was requested."}{" "}
        This page is not indexed.
      </p>
      <Link to="/cultivars" className="mt-6 inline-flex text-sm font-semibold text-primary">
        Back to the strain reference library
      </Link>
    </main>
  );
}

export default function CultivarPage({
  routeProfile = null,
}: {
  routeProfile?: VerdantCultivarProfile | null;
} = {}) {
  const { slug } = useParams<{ slug: string }>();
  // V1.1: bundled library unless the default-off database read flag is on;
  // the resolved source state is explicit and never silent.
  const referenceSource = usePublishedCultivars();
  const { catalog } = referenceSource;
  const sourceNotice = cultivarReferenceSourceNotice(referenceSource.reason);
  const fromCatalog = catalog.findBySlug(slug);
  const cultivar =
    fromCatalog ?? (routeProfile && routeProfile.slug === slug ? routeProfile : undefined);
  const sections = cultivar ? catalog.sectionsFor(cultivar) : [];
  const sources = cultivar ? catalog.sourcesFor(cultivar) : [];
  const summaryRows = cultivar
    ? buildCultivarSummaryRows(cultivar, formatDate(cultivar.lastVerifiedAt))
    : [];
  const faqItems = cultivar ? buildCultivarFaqItems(cultivar) : [];

  usePageSeo({
    title: cultivar
      ? `${cultivar.name} Cultivar Grow Guide | Verdant`
      : "Cultivar not found | Verdant",
    description: cultivar
      ? (cultivar.metaDescription ??
        `${cultivar.name} grow guide: lineage (${cultivar.lineage}), ${cultivar.flowerWeeks} flower, environment ranges by stage, and common issues home growers report.`)
      : "This cultivar reference is not in the library.",
    path: cultivar ? `/cultivars/${cultivar.slug}` : "/cultivars",
    noindex: cultivar ? !cultivarVerificationIsSearchIndexable(cultivar.verificationStatus) : true,
    omitCanonical: !cultivar,
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
        ...(cultivar.difficulty ? [{ name: "Difficulty", value: cultivar.difficulty }] : []),
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
      headline: `${cultivar.name} Cultivar Grow Guide`,
      description: `${cultivar.name} source-backed grow reference: reported lineage (${cultivar.lineage}), ${cultivar.flowerWeeks}, environment context by stage, and common issues home growers report.`,
      url,
      datePublished: verifiedDate,
      dateModified: verifiedDate,
      image: "https://verdantgrowdiary.com/brand/verdant-logo-512.png",
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

  if (!cultivar) {
    return <CultivarNotFound slug={slug} />;
  }

  const diaryCta =
    cultivar.verificationStatus === "verified"
      ? CultivarVerifiedProfileRules.diaryCta(cultivar)
      : null;

  return (
    <main
      data-testid="cultivar-page"
      data-cultivar-slug={cultivar.slug}
      data-cultivar-source-state={referenceSource.state}
      className="min-h-screen bg-background text-foreground"
    >
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-5 sm:px-6">
        <Link to="/" aria-label="Verdant Grow Diary home">
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
          {cultivar.dek ? (
            <p className="mt-3 max-w-3xl text-base text-muted-foreground">{cultivar.dek}</p>
          ) : null}

          <div className="mt-4">
            <CultivarFollowButton cultivar={cultivar} />
          </div>

          <div
            data-testid="cultivar-reference-banner"
            className="mt-6 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4"
          >
            <p className="font-semibold text-amber-200">
              {formatVerificationStatus(cultivar.verificationStatus)} — not plant-specific advice
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This profile supplies a starting hypothesis. Your plant&apos;s logs, stage, medium,
              source-labeled sensors, and observed response remain authoritative.
            </p>
          </div>
          {sourceNotice ? (
            <p
              data-testid="cultivar-reference-source-notice"
              className="mt-3 text-xs text-muted-foreground"
            >
              {sourceNotice}
            </p>
          ) : null}
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
                  className="inline-flex min-h-[40px] items-center rounded-full border border-border/70 px-3 py-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {section.title}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#sources"
                className="inline-flex min-h-[40px] items-center rounded-full border border-border/70 px-3 py-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/60"
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
                        <li
                          key={`${item.text}-${item.confidence}`}
                          className="rounded-lg bg-muted/35 p-3 text-sm"
                        >
                          <p>{item.text}</p>
                          <p className="mt-1 text-xs capitalize text-muted-foreground">
                            {item.confidence} confidence · {item.evidenceKeys.length} evidence
                            reference
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
                          <span className="ml-2 text-xs uppercase tracking-wide">
                            Risk: {item.risk}
                          </span>
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
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Difficulty
                  </dt>
                  <dd className="mt-1">{cultivar.difficulty ?? "Not sourced"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Height tendency
                  </dt>
                  <dd className="mt-1 capitalize">{cultivar.heightCategory}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Market classification
                  </dt>
                  <dd className="mt-1 capitalize">{cultivar.marketClassification}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Data origin
                  </dt>
                  <dd className="mt-1 capitalize">{cultivar.dataOrigin}</dd>
                </div>
              </dl>
            </section>

            {cultivar.lineageClaims.length > 0 ? (
              <section className="rounded-xl border border-border/60 p-4">
                <h2 className="font-display text-lg font-semibold">Lineage claims</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Claim</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cultivar.lineageClaims.map((claim) => (
                        <tr key={claim.claim} className="border-t border-border/50">
                          <td className="py-2 pr-3">{claim.claim}</td>
                          <td className="py-2 pr-3">{claim.source}</td>
                          <td className="py-2">{claim.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {cultivar.sameNameLines.length > 0 ? (
              <section className="rounded-xl border border-border/60 p-4">
                <h2 className="font-display text-lg font-semibold">Same name, different plant</h2>
                {cultivar.sameNameNote ? (
                  <p className="mt-2 text-sm text-muted-foreground">{cultivar.sameNameNote}</p>
                ) : null}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Line</th>
                        <th className="py-2 pr-3">Seed type</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cultivar.sameNameLines.map((line) => (
                        <tr key={line.name} className="border-t border-border/50 align-top">
                          <td className="py-2 pr-3">
                            {line.name}
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {line.lineage} · {line.source} · {line.date}
                            </span>
                          </td>
                          <td className="py-2 pr-3">{line.seedType}</td>
                          <td className="py-2">{line.relation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section id="sources" className="scroll-mt-32 rounded-xl border border-border/60 p-4">
              <h2 className="font-display text-lg font-semibold">
                {cultivar.verificationStatus === "verified"
                  ? `Sources · last checked ${formatDate(cultivar.lastVerifiedAt)}`
                  : "Sources"}
              </h2>
              {cultivar.verificationStatus === "verified" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {CultivarVerifiedProfileRules.verifiedDefinition()}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  References support individual claims. Verdant does not copy source marketing text.
                </p>
              )}
              <ul className="mt-4 space-y-3 text-sm">
                {sources.map((source) => (
                  <li key={source.key} className="rounded-lg bg-muted/30 p-3">
                    {source.linkPolicy === "unlinked" ? (
                      <p className="font-medium">{source.title}</p>
                    ) : (
                      <a
                        href={source.url}
                        target="_blank"
                        rel={
                          source.linkPolicy === "nofollow"
                            ? "nofollow noopener noreferrer"
                            : "noopener noreferrer"
                        }
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {source.title}
                      </a>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {source.publisher} · {source.sourceType.replace(/_/g, " ")} · retrieved{" "}
                      {formatDate(source.retrievedAt)}
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

        <CultivarBlueprintCrossSell cultivar={cultivar} />

        <section className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-display text-xl font-semibold">
            Track {cultivar.name} in your own grow
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            A linked reference may provide context later, but Verdant will keep the plant&apos;s
            actual logs and sensors in charge. Reference pages never create alerts, nutrient
            actions, irrigation actions, or equipment commands.
          </p>
          {cultivar.verificationStatus === "verified" ? (
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              The public record has no finished home harvest. If you are running this cut, your
              diary is the data. {CultivarVerifiedProfileRules.phenoHuntNote()}{" "}
              <Link to="/pricing" className="font-semibold text-primary">
                Pricing
              </Link>
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {diaryCta ? (
              <a
                href={diaryCta.href}
                data-testid="cultivar-signup-cta"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
              >
                {diaryCta.label}
              </a>
            ) : (
              <Link
                to="/auth"
                data-testid="cultivar-signup-cta"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
              >
                Start a free grow diary
              </Link>
            )}
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
