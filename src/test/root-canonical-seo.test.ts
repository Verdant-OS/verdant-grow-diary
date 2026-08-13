/**
 * Root SSR self-canonical and public-document coverage contracts.
 *
 * TanStack route heads and the postbuild SSR snapshot manifest share
 * `STATIC_PUBLIC_OUTPUT_DOCUMENTS`. Every sitemap URL, including `/`, must own
 * one of those documents so its first response can emit a route-specific head.
 * Unknown URLs remain outside that allowlist and must not gain an indexable
 * canonical by accident.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { STATIC_PUBLIC_OUTPUT_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { getRoutesByAccess } from "@/lib/appRouteManifest";
import { staticRouteHead } from "@/lib/build/staticRouteHead";

const ROOT = resolve(__dirname, "../..");
const SITE_ORIGIN = "https://verdantgrowdiary.com";
const ROOT_CANONICAL_URL = `${SITE_ORIGIN}/`;
const HAS_INDEX_HTML = existsSync(resolve(ROOT, "index.html"));
// Classic SPA shell is gone under TanStack SSR; root head owns brand SEO.
const INDEX_HTML = HAS_INDEX_HTML
  ? readFileSync(resolve(ROOT, "index.html"), "utf8")
  : readFileSync(resolve(ROOT, "src/routes/__root.tsx"), "utf8");
const SITEMAP = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");

function sitemapPaths(): string[] {
  return [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim().replace(SITE_ORIGIN, ""))
    .map((p) => (p === "" ? "/" : p));
}

const prerendered = new Set(STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((d) => d.path));

describe("the invariant that keeps every sitemap canonical route-specific", () => {
  it("every sitemap URL has an SSR metadata document", () => {
    const orphaned = sitemapPaths().filter((p) => !prerendered.has(p));
    expect(
      orphaned,
      `These sitemap URLs have no SSR metadata document, so their first response ` +
        `cannot emit the route-specific head recorded in the SEO manifest. Add a ` +
        `static SEO document for each, or ` +
        `remove them from public/sitemap.xml:\n  ${orphaned.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the sitemap is non-trivial, so the check above cannot pass vacuously", () => {
    expect(sitemapPaths().length).toBeGreaterThan(20);
    expect(prerendered.size).toBeGreaterThan(20);
  });

  it("root owns index.html and an absolute self-canonical in its SSR head", () => {
    const rootDocument = STATIC_PUBLIC_OUTPUT_DOCUMENTS.find((document) => document.path === "/");
    expect(rootDocument).toMatchObject({
      fileName: "index.html",
      metadata: { url: ROOT_CANONICAL_URL },
    });

    const head = staticRouteHead("/");
    expect(head.links.filter((link) => link.rel === "canonical")).toEqual([
      { rel: "canonical", href: ROOT_CANONICAL_URL },
    ]);
    expect(head.meta).toEqual(
      expect.arrayContaining([
        { title: "Grow Diary & Grow Room Tracking App | Verdant Grow Diary" },
        { property: "og:image", content: `${SITE_ORIGIN}/og/home.png` },
        { name: "twitter:image", content: `${SITE_ORIGIN}/og/home.png` },
      ]),
    );
  });
});

/**
 * The sitemap invariant above is necessary but not sufficient: the route
 * manifest is the real universe of public routes, and a public route absent
 * from BOTH the sitemap and the prerender set still receives the shell — and
 * with it the root canonical. For an indexable page that means declaring
 * itself a duplicate of the homepage (caught by Codex on /docs/mcp-api, which
 * previously reached non-JS crawlers with the request URL as its implicit —
 * and correct — canonical).
 *
 * Every concrete public route must therefore either be prerendered or appear
 * below with a reason why dedupe-to-homepage is the RIGHT outcome for it.
 */
const ROOT_CANONICAL_TOLERATED: ReadonlyMap<string, string> = new Map([
  ["*", "NotFound catch-all — dedupe-to-homepage is the soft-404 mitigation"],
  ["/.lovable/oauth/consent", "OAuth protocol page; must never rank on its own"],
  ["/auth", "sign-in flow; noindex client-side, never an acquisition page"],
  ["/internal/contextual-pheno-comparison-demo", "fixture demo, deliberately unlinked"],
  ["/internal/demo-proof-walkthrough", "fixture demo, deliberately unlinked"],
  ["/internal/pheno-hunt-demo", "fixture demo, deliberately unlinked"],
  [
    "/partners/csv-preview",
    "browser-local tool, not in sitemap; promote to a prerendered doc if it becomes an acquisition page",
  ],
  ["/reset-password", "credential flow; must never rank"],
  [
    "/sensors/csv-preview",
    "browser-local tool, not in sitemap; promote to a prerendered doc if it becomes an acquisition page",
  ],
  ["/unsubscribe", "token-validated flow; must never rank"],
]);

describe("every public MANIFEST route is prerendered or tolerates the root canonical", () => {
  const concretePublicRoutes = getRoutesByAccess("public")
    .map((r) => r.path)
    .filter((p) => !p.includes(":"));

  it("no public route silently inherits the root canonical", () => {
    const orphaned = concretePublicRoutes.filter(
      (p) => !prerendered.has(p) && !ROOT_CANONICAL_TOLERATED.has(p),
    );
    expect(
      orphaned,
      `These PUBLIC manifest routes have no prerendered document, so non-JS ` +
        `crawlers see them with the root canonical — each would declare itself ` +
        `a duplicate of the homepage. Add a static SEO document (indexable ` +
        `pages), or add to ROOT_CANONICAL_TOLERATED with a reason (flow/utility ` +
        `pages):\n  ${orphaned.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the toleration list cannot go stale", () => {
    for (const [path] of ROOT_CANONICAL_TOLERATED) {
      if (path === "*") continue; // catch-all is not a manifest concrete path
      expect(concretePublicRoutes, `${path} left the public manifest`).toContain(path);
      // A route that gained a prerendered doc supplies its own canonical; its
      // entry here is dead weight that would mask a future regression.
      expect(prerendered.has(path), `${path} is now prerendered — remove its toleration`).toBe(
        false,
      );
    }
  });

  it("indexable documentation is prerendered, not tolerated", () => {
    // The concrete case that motivated this block. If /docs/mcp-api ever
    // drops out of the prerender set, this fails before the generic check's
    // message sends someone hunting.
    expect(prerendered.has("/docs/mcp-api")).toBe(true);
    expect(ROOT_CANONICAL_TOLERATED.has("/docs/mcp-api")).toBe(false);
  });
});

describe("index.html shell", () => {
  it("declares exactly one canonical", () => {
    if (!HAS_INDEX_HTML) {
      // TanStack root head declares brand SEO via head(); not a <link rel=canonical> tag.
      expect(INDEX_HTML).toMatch(/SITE_ORIGIN|verdantgrowdiary\.com|canonical/i);
      return;
    }
    const tags = INDEX_HTML.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi) ?? [];
    expect(tags).toHaveLength(1);
  });

  it("points that canonical at the site root", () => {
    if (!HAS_INDEX_HTML) {
      expect(INDEX_HTML).toMatch(/verdantgrowdiary\.com|SITE_ORIGIN/);
      return;
    }
    const tag = (INDEX_HTML.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) ?? [""])[0];
    const href = (tag.match(/href=["']([^"']+)["']/) ?? [])[1];
    expect(href).toBe(SITE_ORIGIN);
  });

  it("uses the absolute origin, not a relative path", () => {
    if (!HAS_INDEX_HTML) {
      expect(INDEX_HTML).toMatch(/https:\/\/verdantgrowdiary\.com|SITE_ORIGIN/);
      return;
    }
    // A relative canonical on an unknown URL would self-reference the junk URL,
    // which is precisely the soft-404 behaviour being fixed.
    const tag = (INDEX_HTML.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) ?? [""])[0];
    expect(tag).toContain(SITE_ORIGIN);
  });
});

describe("prerendered routes override the shell canonical", () => {
  it("replaces rather than appends, so no page ships two canonicals", () => {
    // The safety of baking a root canonical rests entirely on this branch.
    const builder = readFileSync(resolve(ROOT, "src/lib/build/staticSocialRouteHtml.ts"), "utf8");
    expect(builder).toMatch(/canonicalPattern\.test\(html\)/);
    expect(builder).toMatch(/html\.replace\(canonicalPattern, canonicalTag\)/);
  });

  it("gives every prerendered document an absolute self-canonical URL", () => {
    for (const doc of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
      const url = (doc as { metadata?: { url?: string } }).metadata?.url;
      expect(url, doc.path).toBeTruthy();
      expect(url, doc.path).toContain(SITE_ORIGIN);
    }
  });
});
