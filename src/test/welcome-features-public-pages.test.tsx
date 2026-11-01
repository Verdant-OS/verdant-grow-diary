/**
 * /welcome and /features are real public pages.
 *
 * They used to be permanent aliases of / (a 308 at the host layer plus a
 * client-side RouteAliasRedirect). The owner asked for both to carry their own
 * content and search identity, so this asserts the whole chain on resolved
 * values: no host redirect, a self-canonical indexable metadata document, a
 * public manifest entry, a sitemap entry, and rendered page content.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import Features from "@/pages/Features";
import Welcome from "@/pages/Welcome";
import { FEATURES_COPY, WELCOME_COPY } from "@/constants/welcomeFeaturesCopy";
import { resolveHostRouting } from "@/lib/cloudflareHostRoutingRules";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { getRoutesByAccess } from "@/lib/appRouteManifest";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";

const ROOT = resolve(import.meta.dirname, "../..");
const PAGES = ["/welcome", "/features"] as const;

afterEach(() => cleanup());

describe("welcome and features host routing", () => {
  it.each(PAGES)("%s is served, not redirected to the homepage", (path) => {
    expect(resolveHostRouting({ pathname: path, search: "" })).toMatchObject({
      kind: "continue",
      location: null,
    });
  });
});

describe("welcome and features search metadata", () => {
  it.each(PAGES)("%s resolves a self-canonical, indexable head", (path) => {
    const head = staticRouteHead(path);
    expect(head.links).toEqual([{ rel: "canonical", href: `${VERDANT_SITE_ORIGIN}${path}` }]);
    expect(head.meta).toContainEqual({ name: "robots", content: "index, follow" });
    expect(head.meta.find((entry) => entry.title)?.title).toMatch(/Verdant/);
    expect(head.meta).toContainEqual({
      property: "og:url",
      content: `${VERDANT_SITE_ORIGIN}${path}`,
    });
  });

  it("publishes a metadata document for each page", () => {
    for (const path of PAGES) {
      const doc = STATIC_PUBLIC_OUTPUT_DOCUMENTS.find((candidate) => candidate.path === path);
      expect(doc?.metadata.url).toBe(`${VERDANT_SITE_ORIGIN}${path}`);
    }
  });

  it("advertises both pages in the sitemap", () => {
    const sitemap = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
    expect(sitemap).toContain(`<loc>${VERDANT_SITE_ORIGIN}/welcome</loc>`);
    expect(sitemap).toContain(`<loc>${VERDANT_SITE_ORIGIN}/features</loc>`);
  });
});

describe("welcome and features route access", () => {
  it("lists both as public routes and not as redirects", () => {
    const publicPaths = getRoutesByAccess("public").map((route) => route.path);
    const redirectPaths = getRoutesByAccess("redirect").map((route) => route.path);
    for (const path of PAGES) {
      expect(publicPaths).toContain(path);
      expect(redirectPaths).not.toContain(path);
    }
  });
});

describe("welcome page content", () => {
  it("renders its own heading, the nine-step loop, and the free-tool links", () => {
    render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("welcome-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(WELCOME_COPY.h1);
    expect(screen.getByTestId("welcome-loop").children).toHaveLength(WELCOME_COPY.loop.length);
    expect(screen.getByTestId("welcome-loop").children).toHaveLength(9);
    expect(screen.getByTestId("welcome-steps").children).toHaveLength(3);
    expect(screen.getByRole("link", { name: "VPD chart by growth stage" })).toHaveAttribute(
      "href",
      "/vpd-chart",
    );
    expect(screen.getByRole("link", { name: "Open Quick Log" })).toHaveAttribute(
      "href",
      "/quick-log",
    );
  });
});

describe("features page content", () => {
  it("renders its own heading, every capability group, and the MCP API link", () => {
    render(
      <MemoryRouter>
        <Features />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("features-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(FEATURES_COPY.h1);
    expect(screen.getByTestId("features-groups").children).toHaveLength(
      FEATURES_COPY.groups.length,
    );
    expect(screen.getByTestId("feature-group-sensors")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the MCP API reference" })).toHaveAttribute(
      "href",
      "/docs/mcp-api",
    );
    expect(screen.getByRole("link", { name: "How AI Doctor works" })).toHaveAttribute(
      "href",
      "/how-ai-doctor-works",
    );
  });
});
