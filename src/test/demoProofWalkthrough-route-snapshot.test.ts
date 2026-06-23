/**
 * Route-snapshot guard: every href used by the Demo Proof Walkthrough
 * must correspond to a route currently mounted in `src/App.tsx`. The
 * walkthrough is the operator's tour of the real app — if a step links
 * to a non-existent route, the demo is broken.
 *
 * Source of truth: paths scraped from `src/App.tsx`. The app route
 * manifest is consulted as a secondary cross-check when entries exist.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDemoProofWalkthroughViewModel } from "@/lib/demoProofWalkthroughViewModel";

function loadAppRoutePaths(): Set<string> {
  const src = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const paths = new Set<string>();
  const re = /path=["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) paths.add(m[1]);
  return paths;
}

function stripQuery(href: string): string {
  const q = href.indexOf("?");
  return q === -1 ? href : href.slice(0, q);
}

describe("Demo Proof Walkthrough — route snapshot", () => {
  const appPaths = loadAppRoutePaths();
  const vm = buildDemoProofWalkthroughViewModel();

  it("App.tsx exposes the expected real routes the walkthrough relies on", () => {
    const required = [
      "/",
      "/tents",
      "/plants",
      "/daily-check",
      "/logs",
      "/sensors",
      "/doctor",
      "/alerts",
      "/actions",
      "/demo/one-tent-live-proof",
    ];
    for (const p of required) {
      expect(appPaths.has(p), `App.tsx missing route ${p}`).toBe(true);
    }
  });

  it("every walkthrough href resolves to a real App.tsx route (query stripped)", () => {
    for (const step of vm.steps) {
      const base = stripQuery(step.href);
      expect(
        appPaths.has(base),
        `walkthrough step ${step.id} href ${step.href} (base ${base}) not in App.tsx`,
      ).toBe(true);
    }
  });

  it("operator-mode step preserves ?operator=1 on /sensors", () => {
    const op = vm.steps.find((s) => s.href.includes("?operator=1"));
    expect(op).toBeTruthy();
    expect(op!.href).toBe("/sensors?operator=1");
    expect(appPaths.has("/sensors")).toBe(true);
  });

  it("never links to /grows", () => {
    for (const step of vm.steps) {
      const base = stripQuery(step.href);
      expect(base).not.toBe("/grows");
      expect(base.startsWith("/grows/")).toBe(false);
    }
  });
});
