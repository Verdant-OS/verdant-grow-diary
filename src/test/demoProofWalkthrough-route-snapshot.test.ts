/**
 * Route-snapshot guard: every href used by the Demo Proof Walkthrough
 * must correspond to a route currently mounted in `src/file routes`. The
 * walkthrough is the operator's tour of the real app — if a step links
 * to a non-existent route, the demo is broken.
 *
 * Source of truth: paths scraped from `src/file routes`. The app route
 * manifest is consulted as a secondary cross-check when entries exist.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { buildDemoProofWalkthroughViewModel } from "@/lib/demoProofWalkthroughViewModel";
import { extractMountedAppRoutePaths } from "./helpers/routeManifestSyncHarness";

function loadAppRoutePaths(): Set<string> {
  const src = readFileSync(resolve(process.cwd(), "src/file routes"), "utf8");
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

  it("file routes exposes the expected real routes the walkthrough relies on", () => {
    const required = [
      "/",
      "/tents",
      "/plants",
      "/daily-check",
      "/timeline",
      "/sensors",
      "/doctor",
      "/alerts",
      "/actions",
      "/demo/one-tent-live-proof",
    ];
    for (const p of required) {
      expect(appPaths.has(p), `file routes missing route ${p}`).toBe(true);
    }
  });

  it("every walkthrough href resolves to a real file routes route (query stripped)", () => {
    for (const step of vm.steps) {
      const base = stripQuery(step.href);
      expect(
        appPaths.has(base),
        `walkthrough step ${step.id} href ${step.href} (base ${base}) not in file routes`,
      ).toBe(true);
    }
  });

  it("operator-mode step preserves ?operator=1 on /sensors", () => {
    const op = vm.steps.find((s) => s.href.includes("?operator=1"));
    expect(op).toBeTruthy();
    expect(op!.href).toBe("/sensors?operator=1");
    expect(appPaths.has("/sensors")).toBe(true);
  });

  it("labels every operator or internal manifest destination as operator_only", () => {
    const protectedSteps = vm.steps.filter((step) => {
      const base = stripQuery(step.href);
      const manifestEntry = APP_ROUTES.find((route) => route.path === base);
      return manifestEntry?.access === "operator" || manifestEntry?.access === "internal";
    });

    expect(protectedSteps.length).toBeGreaterThan(0);
    for (const step of protectedSteps) {
      expect(step.statusKind, `${step.href} must not be labeled ready`).toBe("operator_only");
      expect(step.safetyNote).toMatch(/server-verified operator role/i);
    }
  });

  it("never links to /grows", () => {
    for (const step of vm.steps) {
      const base = stripQuery(step.href);
      expect(base).not.toBe("/grows");
      expect(base.startsWith("/grows/")).toBe(false);
    }
  });
});
