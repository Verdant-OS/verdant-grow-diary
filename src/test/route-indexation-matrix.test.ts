/**
 * Pins docs/seo/route-indexation-matrix.md to the route manifest and the
 * static SEO documents. The matrix is the artifact under test; robots,
 * canonicals, and sitemap membership are read from the modules and
 * public/sitemap.xml, not from the markdown.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVARS } from "@/constants/strainReferenceLibrary";
import { VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";
import { APP_ROUTE_ACCESS_VALUES, APP_ROUTES, getRoutesByAccess } from "@/lib/appRouteManifest";
import { cultivarVerificationIsSearchIndexable } from "@/lib/cultivarDetailSeo";
import {
  STATIC_CULTIVAR_NOINDEX_DOCUMENTS,
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";

const ROOT = resolve(__dirname, "../..");
const MATRIX = readFileSync(resolve(ROOT, "docs/seo/route-indexation-matrix.md"), "utf8");
const SITEMAP = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");

const sitemapPaths = new Set(
  [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1].trim()).pathname),
);

function inventoryLine(document: (typeof STATIC_PUBLIC_OUTPUT_DOCUMENTS)[number]): string {
  const robots = document.metadata.robots ?? "index, follow";
  const canonical = new URL(document.metadata.url).pathname;
  const inSitemap = sitemapPaths.has(document.path) ? "yes" : "no";
  return `- \`${document.path}\` — robots \`${robots}\`; sitemap ${inSitemap}; canonical \`${canonical}\``;
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

/** Body of one `## ` section, without the heading line. */
function section(heading: string): string {
  const start = MATRIX.indexOf(`\n## ${heading}\n`);
  expect(start, `missing section "## ${heading}"`).toBeGreaterThanOrEqual(0);
  const bodyStart = start + heading.length + 5;
  const next = MATRIX.indexOf("\n## ", bodyStart);
  return MATRIX.slice(bodyStart, next === -1 ? undefined : next);
}

/** Splits "`/a`; `/b`; `/c`." into ["/a", "/b", "/c"]. */
function backtickList(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

/** Parses each `Manifest paths (\`access: "x"\`, N):` block. */
function manifestPathLists(): Map<string, { count: number; paths: string[] }> {
  const lists = new Map<string, { count: number; paths: string[] }>();
  for (const match of MATRIX.matchAll(/^Manifest paths \(`access: "(\w+)"`, (\d+)\):\n\n(.+)$/gm)) {
    expect(lists.has(match[1]), `duplicate manifest list for ${match[1]}`).toBe(false);
    lists.set(match[1], { count: Number(match[2]), paths: backtickList(match[3]) });
  }
  return lists;
}

/** First-column routes of the "Public routes with no static document" table. */
function noStaticDocumentTableRoutes(): string[] {
  return section("Public routes with no static document")
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => backtickList(line.split("|")[1])[0]);
}

/**
 * Page- and route-level robots claims in the matrix. Each row is checked in
 * the source file and in the matrix sentence that states it.
 *  - client-noindex: the page passes `noindex: true` to `usePageSeo`
 *    (`noindex, follow` after hydration).
 *  - route-head: the route module's `head()` sets that robots meta string.
 *  - none: the page module never sets noindex; the first head is the root
 *    shell's `index, follow`.
 */
type RobotsClaim =
  | { route: string; source: string; routeModule: string; kind: "client-noindex" }
  | { route: string; source: string; kind: "route-head"; robots: string }
  | { route: string; source: string; routeModule: string; kind: "none" };

const ROBOTS_CLAIMS: ReadonlyArray<RobotsClaim & { sentence: string }> = [
  {
    route: "*",
    source: "src/pages/NotFound.tsx",
    routeModule: "src/routes/$.tsx",
    kind: "client-noindex",
    sentence: "`src/pages/NotFound.tsx` sets `noindex: true` (`noindex, follow`)",
  },
  {
    route: "/auth",
    source: "src/pages/Auth.tsx",
    routeModule: "src/routes/auth.tsx",
    kind: "client-noindex",
    sentence: "`src/pages/Auth.tsx` sets `noindex: true`.",
  },
  {
    route: "/reset-password",
    source: "src/pages/ResetPassword.tsx",
    routeModule: "src/routes/reset-password.tsx",
    kind: "client-noindex",
    sentence: "`src/pages/ResetPassword.tsx` sets `noindex: true`.",
  },
  {
    route: "/unsubscribe",
    source: "src/pages/Unsubscribe.tsx",
    routeModule: "src/routes/unsubscribe.tsx",
    kind: "client-noindex",
    sentence: "`src/pages/Unsubscribe.tsx` sets `noindex: true`.",
  },
  {
    route: "/partners/csv-preview",
    source: "src/pages/PartnerCsvPreviewLanding.tsx",
    routeModule: "src/routes/partners.csv-preview.tsx",
    kind: "client-noindex",
    sentence:
      "`src/pages/PartnerCsvPreviewLanding.tsx` sets `noindex: true` and path `/partners/csv-preview`.",
  },
  {
    route: "/sensors/csv-preview",
    source: "src/pages/SensorCsvPreview.tsx",
    routeModule: "src/routes/sensors.csv-preview.tsx",
    kind: "client-noindex",
    sentence:
      "`src/pages/SensorCsvPreview.tsx` sets `noindex: true` and path `/sensors/csv-preview`.",
  },
  {
    route: "/checkout/success",
    source: "src/pages/CheckoutSuccess.tsx",
    routeModule: "src/routes/checkout.success.tsx",
    kind: "client-noindex",
    sentence:
      "`/checkout/success` and `/checkout/cancel` are in the inventory (`noindex, follow`, not in the sitemap) and their pages also set `noindex: true`.",
  },
  {
    route: "/checkout/cancel",
    source: "src/pages/CheckoutCancel.tsx",
    routeModule: "src/routes/checkout.cancel.tsx",
    kind: "client-noindex",
    sentence:
      "`/checkout/success` and `/checkout/cancel` are in the inventory (`noindex, follow`, not in the sitemap) and their pages also set `noindex: true`.",
  },
  {
    route: "/customer/guide/oreoz-vs-gelonade-comparison",
    source: "src/pages/CustomerOreozGelonadeGuide.tsx",
    routeModule: "src/routes/customer.guide.oreoz-vs-gelonade-comparison.tsx",
    kind: "client-noindex",
    sentence: "`src/pages/CustomerOreozGelonadeGuide.tsx` also sets `noindex: true`.",
  },
  {
    route: "/settings/agent-integrations",
    source: "src/pages/AgentIntegrations.tsx",
    routeModule: "src/routes/_app/settings_.agent-integrations.tsx",
    kind: "client-noindex",
    sentence:
      "- `/settings/agent-integrations` — `src/pages/AgentIntegrations.tsx` sets `noindex: true` (`noindex, follow` after hydration).",
  },
  {
    route: "/diary/pheno-expression-comparison",
    source: "src/pages/OreozGelonadeDiaryComparison.tsx",
    routeModule: "src/routes/_app/diary.pheno-expression-comparison.tsx",
    kind: "client-noindex",
    sentence:
      "- `/diary/pheno-expression-comparison` — `src/pages/OreozGelonadeDiaryComparison.tsx` sets `noindex: true`.",
  },
  {
    route: "/diary/strains/:slug",
    source: "src/pages/CultivarDiaryProfile.tsx",
    routeModule: "src/routes/_app/diary.strains.$slug.tsx",
    kind: "client-noindex",
    sentence:
      "- `/diary/strains/:slug` — `src/pages/CultivarDiaryProfile.tsx` sets `noindex: true`.",
  },
  {
    route: "/operator/mode",
    source: "src/pages/OperatorMode.tsx",
    routeModule: "src/routes/_app/_operator/operator.mode.tsx",
    kind: "client-noindex",
    sentence: "- `/operator/mode` — `src/pages/OperatorMode.tsx` sets `noindex: true`.",
  },
  {
    route: "/operator/edge-alerts",
    source: "src/pages/OperatorEdgeAlerts.tsx",
    routeModule: "src/routes/_app/_operator/operator.edge-alerts.tsx",
    kind: "client-noindex",
    sentence:
      "- `/operator/edge-alerts` — `src/pages/OperatorEdgeAlerts.tsx` sets `noindex: true`.",
  },
  {
    route: "/operator/edge-metrics",
    source: "src/pages/OperatorEdgeMetrics.tsx",
    routeModule: "src/routes/_app/_operator/operator.edge-metrics.tsx",
    kind: "client-noindex",
    sentence:
      "- `/operator/edge-metrics` — `src/pages/OperatorEdgeMetrics.tsx` sets `noindex: true`.",
  },
  {
    route: "/operator/credits-audit",
    source: "src/pages/OperatorCreditsAudit.tsx",
    routeModule: "src/routes/_app/_operator/operator.credits-audit.tsx",
    kind: "client-noindex",
    sentence:
      "- `/operator/credits-audit` — `src/pages/OperatorCreditsAudit.tsx` sets `noindex: true`.",
  },
  {
    route: "/operator/schema-audit",
    source: "src/pages/OperatorSchemaAudit.tsx",
    routeModule: "src/routes/_app/_operator/operator.schema-audit.tsx",
    kind: "client-noindex",
    sentence:
      "- `/operator/schema-audit` — `src/pages/OperatorSchemaAudit.tsx` sets `noindex: true`.",
  },
  {
    route: "/operator/support-inbox",
    source: "src/pages/OperatorSupportInbox.tsx",
    routeModule: "src/routes/_app/_operator/operator.support-inbox.tsx",
    kind: "client-noindex",
    sentence:
      "- `/operator/support-inbox` — `src/pages/OperatorSupportInbox.tsx` sets `noindex: true`.",
  },
  {
    route: "/internal/demo-proof-walkthrough",
    source: "src/routes/internal.demo-proof-walkthrough.tsx",
    kind: "route-head",
    robots: "noindex, nofollow",
    sentence:
      "| `/internal/demo-proof-walkthrough`           | Route `head()` meta `noindex, nofollow`.",
  },
  {
    route: "/settings/analytics",
    source: "src/routes/_app/settings_.analytics.tsx",
    kind: "route-head",
    robots: "noindex",
    sentence:
      "- `/settings/analytics` — `src/routes/_app/settings_.analytics.tsx` sets `robots` to `noindex` (that string only; it does not say `follow`).",
  },
  {
    route: "/diagnostics-lighting-measurement",
    source: "src/routes/_app/_operator/diagnostics-lighting-measurement.tsx",
    kind: "route-head",
    robots: "noindex, nofollow",
    sentence:
      "- `/diagnostics-lighting-measurement` — `noindex, nofollow` in `src/routes/_app/_operator/diagnostics-lighting-measurement.tsx`.",
  },
  {
    route: "/diagnostics-seo-artifacts",
    source: "src/routes/_app/_operator/diagnostics-seo-artifacts.tsx",
    kind: "route-head",
    robots: "noindex, nofollow",
    sentence:
      "- `/diagnostics-seo-artifacts` — `noindex, nofollow` in `src/routes/_app/_operator/diagnostics-seo-artifacts.tsx`.",
  },
  {
    route: "/.lovable/oauth/consent",
    source: "src/pages/OAuthConsent.tsx",
    routeModule: "src/routes/[.]lovable.oauth.consent.tsx",
    kind: "none",
    sentence: "`src/pages/OAuthConsent.tsx` does not call `usePageSeo`.",
  },
  {
    route: "/pheno-hunts/:id/compare",
    source: "src/pages/PhenoHuntCompare.tsx",
    routeModule: "src/routes/pheno-hunts.$id.compare.tsx",
    kind: "none",
    sentence: "`src/pages/PhenoHuntCompare.tsx` does not call `usePageSeo`.",
  },
  {
    route: "/pheno-hunts/:id/showcase",
    source: "src/pages/PhenoHuntShowcase.tsx",
    routeModule: "src/routes/pheno-hunts.$id.showcase.tsx",
    kind: "none",
    sentence: "`src/pages/PhenoHuntShowcase.tsx` does not call `usePageSeo`.",
  },
  {
    route: "/internal/contextual-pheno-comparison-demo",
    source: "src/pages/ContextualPhenoComparisonDemo.tsx",
    routeModule: "src/routes/internal.contextual-pheno-comparison-demo.tsx",
    kind: "none",
    sentence: "`src/pages/ContextualPhenoComparisonDemo.tsx` does not call `usePageSeo`.",
  },
  {
    route: "/internal/pheno-hunt-demo",
    source: "src/pages/PhenoHuntDemo.tsx",
    routeModule: "src/routes/internal.pheno-hunt-demo.tsx",
    kind: "none",
    sentence: "`src/pages/PhenoHuntDemo.tsx` does not call `usePageSeo`.",
  },
  {
    route: "/diagnostics/quicklog",
    source: "src/pages/QuicklogDiagnostics.tsx",
    routeModule: "src/routes/_app/_operator/diagnostics_.quicklog.tsx",
    kind: "none",
    sentence:
      "`/diagnostics/quicklog` has no route `head()` and `src/pages/QuicklogDiagnostics.tsx` does not set `noindex`.",
  },
];

describe("route indexation matrix", () => {
  it("states the manifest access counts", () => {
    const counts = {
      public: getRoutesByAccess("public").length,
      auth: getRoutesByAccess("auth").length,
      operator: getRoutesByAccess("operator").length,
      internal: getRoutesByAccess("internal").length,
      redirect: getRoutesByAccess("redirect").length,
    };
    const total = APP_ROUTES.length;
    expect(MATRIX).toContain(
      `**Coverage:** ${total} of ${total} manifest routes — ${counts.public} public, ${counts.auth} authenticated, ${counts.operator} operator, ${counts.internal} internal, and ${counts.redirect} redirects.`,
    );
    expect(MATRIX).not.toContain("134 of 134");
  });

  it("names every manifest path", () => {
    const missing = APP_ROUTES.map((route) => route.path).filter(
      (path) => !MATRIX.includes(`\`${path}\``),
    );
    expect(missing).toEqual([]);
  });

  it("reproduces the static-document robots, sitemap, and canonical inventory", () => {
    const missing = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map(inventoryLine).filter(
      (line) => !MATRIX.includes(line),
    );
    expect(missing).toEqual([]);
    const documented = section("Concrete static-document inventory")
      .split("\n")
      .filter((line) => line.startsWith("- `/"));
    expect(documented).toEqual(STATIC_PUBLIC_OUTPUT_DOCUMENTS.map(inventoryLine));
  });

  it("keeps sitemap locs on the documented origin", () => {
    for (const raw of [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
      match[1].trim(),
    )) {
      expect(raw.startsWith(`${VERDANT_SITE_ORIGIN}/`) || raw === VERDANT_SITE_ORIGIN).toBe(true);
    }
  });

  it("lists each access group's manifest paths exactly, with the stated count", () => {
    const lists = manifestPathLists();
    expect([...lists.keys()].sort()).toEqual([...APP_ROUTE_ACCESS_VALUES].sort());
    for (const access of APP_ROUTE_ACCESS_VALUES) {
      const expected = getRoutesByAccess(access).map((route) => route.path);
      const documented = lists.get(access);
      expect(documented, `no manifest list for ${access}`).toBeDefined();
      expect(documented?.count, `${access} count`).toBe(expected.length);
      expect(documented?.paths, `${access} paths`).toEqual(expected);
    }
  });

  it("tables exactly the public routes that have no static document", () => {
    const documentPaths = new Set(STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => document.path));
    // Patterns whose concrete paths are inventory lines.
    const patternsWithConcreteDocuments = new Set(["/cultivars/:slug", "/guides/:slug"]);
    const expected = getRoutesByAccess("public")
      .map((route) => route.path)
      .filter((path) => !documentPaths.has(path) && !patternsWithConcreteDocuments.has(path))
      .sort();
    expect(noStaticDocumentTableRoutes().sort()).toEqual(expected);
  });

  it("states the sitemap URL count", () => {
    const locs = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)];
    expect(MATRIX).toContain(`(${locs.length} URLs, all on \`${VERDANT_SITE_ORIGIN}\`)`);
    expect(MATRIX.match(/\((\d+) URLs, all on/g)).toHaveLength(1);
  });

  it("keeps sample cultivar slugs noindex and out of the sitemap in the inventory", () => {
    const cultivarLines = section("Concrete static-document inventory")
      .split("\n")
      .filter((line) => line.startsWith("- `/cultivars/"));
    const expected = STATIC_PUBLIC_OUTPUT_DOCUMENTS.filter((document) =>
      document.path.startsWith("/cultivars/"),
    ).map(inventoryLine);
    expect(expected.length).toBeGreaterThan(0);
    expect(cultivarLines).toEqual(expected);
    for (const document of STATIC_CULTIVAR_NOINDEX_DOCUMENTS) {
      expect(sitemapPaths.has(document.path)).toBe(false);
      expect(MATRIX).toContain(
        `- \`${document.path}\` — robots \`noindex, follow\`; sitemap no; canonical \`${document.path}\``,
      );
    }
    expect(MATRIX).toContain(
      "`cultivarVerificationIsSearchIndexable` returns true only for `reviewed` and `verified`.",
    );
  });

  it("pins the cultivar indexability prose to the live verification statuses", () => {
    const indexableSlugs = VERDANT_CULTIVARS.filter((cultivar) =>
      cultivarVerificationIsSearchIndexable(cultivar.verificationStatus),
    ).map((cultivar) => cultivar.slug);
    // The two sentences below are only true while no slug is indexable and the
    // library holds ten sample entries. When either changes, the doc must change.
    expect(
      indexableSlugs,
      "A cultivar is now reviewed/verified (indexable): update docs/seo/route-indexation-matrix.md " +
        'line ~101 ("Today all ten … noindex, follow …") and line ~112 ("No cultivar detail ' +
        'document is indexable today…"), then this test.',
    ).toEqual([]);
    expect(
      VERDANT_CULTIVARS.length,
      'The cultivar count changed: update "all ten" in docs/seo/route-indexation-matrix.md line ~101.',
    ).toBe(10);
    expect(VERDANT_CULTIVARS.every((cultivar) => cultivar.verificationStatus === "sample")).toBe(
      true,
    );
    expect(MATRIX).toContain(
      "Today all ten `VERDANT_CULTIVARS` entries are `sample`, so all ten slugs are `noindex, follow` and not in the sitemap.",
    );
    expect(MATRIX).toContain(
      "- No cultivar detail document is indexable today. `buildStaticCultivarJsonLd` still gives each `/cultivars/<slug>` document WebPage, a cultivar collection node, FAQPage, BreadcrumbList, and Article, but all ten are `noindex, follow` (see the inventory), so that schema is not on an indexable document.",
    );
  });

  it.each(ROBOTS_CLAIMS)("pins the $route robots claim to $source", (claim) => {
    expect(APP_ROUTES.some((route) => route.path === claim.route)).toBe(true);
    // Table cells are padded; compare with runs of spaces collapsed.
    const collapse = (text: string) => text.replace(/ {2,}/g, " ");
    expect(collapse(MATRIX)).toContain(collapse(claim.sentence));
    const source = readSource(claim.source);
    if (claim.kind === "route-head") {
      expect(source).toContain(`{ name: "robots", content: "${claim.robots}" }`);
      // Pathless layout segments (`/_app`) and trailing-underscore escapes
      // (`settings_`) are not part of the URL path.
      const routeId = source.match(/createFileRoute\("([^"]+)"\)/)?.[1] ?? "";
      const urlPath = routeId
        .split("/")
        .filter((segment) => !segment.startsWith("_"))
        .map((segment) => segment.replace(/_$/, ""))
        .join("/");
      expect(urlPath).toBe(claim.route);
      return;
    }
    const pageName = claim.source.replace(/^src\/pages\//, "").replace(/\.tsx$/, "");
    expect(readSource(claim.routeModule)).toMatch(new RegExp(`from "@/pages/${pageName}"`));
    if (claim.kind === "client-noindex") {
      // Scope the marker to the usePageSeo({...}) call, not anywhere in the file.
      const seoCall = source.match(/usePageSeo\(\{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
      expect(seoCall).not.toBe("");
      expect(seoCall).toMatch(/^\s*noindex: true,$/m);
    } else {
      expect(source).not.toMatch(/noindex/);
    }
  });

  it("names the guides that emit Article JSON-LD", () => {
    const withArticle = VERDANT_SEO_GUIDES.filter((guide) => guide.publishedOn).map(
      (guide) => `/guides/${guide.slug}`,
    );
    expect(withArticle.length).toBeGreaterThan(0);
    const sentence = section("Schema on indexable documents")
      .split("\n")
      .find((line) => line.includes("guides set it:"));
    expect(sentence).toBeDefined();
    expect(sentence).toContain(`These ${withArticle.length} guides set it:`);
    expect(backtickList(sentence?.split("guides set it:")[1] ?? "")).toEqual(withArticle);
    expect(MATRIX).toContain(`\`VERDANT_SEO_GUIDES\` (${VERDANT_SEO_GUIDES.length} slugs)`);
    expect(MATRIX).toContain("Article is added only when `publishedOn` is set.");
  });

  it("marks the retired customer share routes as unmounted", () => {
    const retired = ["/customer/:shareId", "/customer/:shareId/cannabis-care"] as const;
    for (const path of retired) {
      expect(APP_ROUTES.find((route) => route.path === path)).toBeUndefined();
      expect(MATRIX).toContain(`\`${path}\``);
    }
    expect(MATRIX).toContain("## Retired routes");
    expect(MATRIX).toContain("**NOT_MEASURED**");
  });
});
