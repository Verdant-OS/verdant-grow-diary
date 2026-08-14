/**
 * usePageSeo head-node ownership contract.
 *
 * Root cause of the landing-origin navigation freeze (GA E2E red, Browser
 * census red): the landing route declared a canonical via TanStack `head()`
 * (a React 19 hoistable owned by a fiber) while usePageSeo — the incumbent
 * canonical owner on 43 pages — mutated that same node's href on mount and
 * `.remove()`d it on cleanup. Deleting a React-owned hoistable that app code
 * already detached throws `TypeError: ... removeChild ... of null` inside
 * React's commit; the router's load() catch swallows it silently, leaving the
 * navigation permanently pending: URL updates, DOM never swaps.
 *
 * Contract locked here:
 *  1. usePageSeo only ever REMOVES a canonical it created itself (marked
 *     with data-page-seo-owned). Foreign canonicals survive unmount.
 *  2. The hook's own canonical lifecycle (create → update → remove) works.
 *  3. No route module declares a canonical via head() — usePageSeo is the
 *     single owner. A route needing a canonical must call usePageSeo.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { usePageSeo } from "@/hooks/usePageSeo";
import { readAllRouteModuleSources } from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");

function SeoProbe({ path }: { path: string }) {
  usePageSeo({
    title: "Probe | Verdant Grow Diary",
    description: "Probe page description.",
    path,
  });
  return null;
}

function canonicals(): HTMLLinkElement[] {
  return Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'));
}

afterEach(() => {
  for (const el of canonicals()) el.remove();
});

describe("usePageSeo never removes a canonical it does not own", () => {
  it("a pre-existing (React/SSR-owned) canonical survives the hook's unmount", () => {
    const foreign = document.createElement("link");
    foreign.setAttribute("rel", "canonical");
    foreign.setAttribute("href", "https://verdantgrowdiary.com");
    document.head.appendChild(foreign);

    const { unmount } = render(<SeoProbe path="/probe" />);
    unmount();

    // The foreign node must still be attached: removing it detaches a node a
    // React fiber may own, and React later crashes deleting it — which is the
    // exact landing-navigation freeze this contract exists to prevent.
    expect(foreign.isConnected).toBe(true);
  });

  it("creates, marks, updates, and removes its own canonical", () => {
    expect(canonicals()).toHaveLength(0);

    const { rerender, unmount } = render(<SeoProbe path="/probe" />);
    let own = canonicals();
    expect(own).toHaveLength(1);
    expect(own[0].getAttribute("href")).toBe("https://verdantgrowdiary.com/probe");
    expect(own[0].hasAttribute("data-page-seo-owned")).toBe(true);

    rerender(<SeoProbe path="/probe-2" />);
    own = canonicals();
    expect(own).toHaveLength(1);
    expect(own[0].getAttribute("href")).toBe("https://verdantgrowdiary.com/probe-2");

    unmount();
    expect(canonicals()).toHaveLength(0);
  });
});

describe("usePageSeo is the single canonical owner", () => {
  it("no route module declares rel=canonical via head()", () => {
    // A head() canonical is a React-owned hoistable; usePageSeo adopting or
    // removing it corrupts React 19's head bookkeeping and freezes the next
    // navigation off that page. Pages needing a canonical call usePageSeo.
    const sources = readAllRouteModuleSources();
    expect(sources).not.toMatch(/rel:\s*["']canonical["']/);
  });

  it("the landing route keeps its social card metadata", () => {
    const indexRoute = readFileSync(resolve(ROOT, "src/routes/index.tsx"), "utf8");
    expect(indexRoute).toContain("og/home.png");
  });
});
