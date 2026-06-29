// Route Guard Parity v1 — static parity between appRouteManifest and App.tsx.
//
// Confirms every route in `src/lib/appRouteManifest.ts` with
// access === "operator" | "internal" is mounted INSIDE the
// `<Route element={<RequireOperatorRole />}>` block in `src/App.tsx`,
// except for documented public/fixture-only exceptions that perform no
// Supabase/auth/AI/writes.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const APP = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");

function tagOpenEnd(src: string, openIdx: number): number {
  let i = openIdx + 1;
  let braces = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === ">" && braces === 0) return i;
    i += 1;
  }
  return -1;
}

function sliceMatchingRouteBlock(src: string, openIdx: number): string {
  const startEnd = tagOpenEnd(src, openIdx);
  let depth = 1;
  let i = startEnd + 1;
  while (i < src.length && depth > 0) {
    const nextOpen = src.indexOf("<Route", i);
    const nextClose = src.indexOf("</Route>", i);
    if (nextClose === -1) return "";
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const end = tagOpenEnd(src, nextOpen);
      if (end === -1) return "";
      if (src[end - 1] !== "/") depth += 1;
      i = end + 1;
    } else {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx, nextClose);
      i = nextClose + "</Route>".length;
    }
  }
  return "";
}

const operatorOpen = APP.indexOf("<Route element={<RequireOperatorRole />}>");
expect(operatorOpen).toBeGreaterThan(-1);
const operatorBlock = sliceMatchingRouteBlock(APP, operatorOpen);
expect(operatorBlock.length).toBeGreaterThan(0);

const OPERATOR_PROTECTED_PATHS = new Set(
  [...operatorBlock.matchAll(/path="([^"]+)"/g)].map((m) => m[1]),
);

/**
 * Documented exceptions — internal-access routes that are intentionally
 * mounted outside the operator-role gate because they are read-only,
 * fixture-only presenters with NO Supabase / AI / auth / write surface.
 * These are linkable only by direct URL.
 */
const PUBLIC_FIXTURE_ONLY_INTERNAL_EXCEPTIONS = new Set<string>([
  "/internal/demo-proof-walkthrough",
  "/internal/contextual-pheno-comparison-demo",
]);

/**
 * Deferred operator/internal manifest entries that are NOT covered by
 * Route Guard Parity v1. They are intentionally left as-is in this slice
 * because moving them under <RequireOperatorRole /> would change
 * grower-facing behavior (e.g. `/diagnostics` exposes the read-only
 * Contextual Pheno Comparison entrypoint to all authenticated users) or
 * was not part of the audited route set. Tracked for a follow-up slice
 * after a behavior review.
 */
const DEFERRED_OPERATOR_PARITY = new Set<string>([
  "/diagnostics",
  "/grow-lineage",
  "/sensors/ecowitt-audit",
  "/sensors/ingest-normalizer",
]);

describe("Route Guard Parity v1 — operator/internal manifest entries are role-gated", () => {
  const gated = APP_ROUTES.filter(
    (r) => r.access === "operator" || r.access === "internal",
  );

  for (const r of gated) {
    if (PUBLIC_FIXTURE_ONLY_INTERNAL_EXCEPTIONS.has(r.path)) {
      it(`${r.path} is a documented public fixture-only exception`, () => {
        expect(r.access).toBe("internal");
        expect(OPERATOR_PROTECTED_PATHS.has(r.path)).toBe(false);
      });
    } else if (DEFERRED_OPERATOR_PARITY.has(r.path)) {
      it(`${r.path} is a documented deferred-parity entry (follow-up slice)`, () => {
        expect(OPERATOR_PROTECTED_PATHS.has(r.path)).toBe(false);
      });
    } else {
      it(`${r.path} is mounted inside <RequireOperatorRole />`, () => {
        expect(OPERATOR_PROTECTED_PATHS.has(r.path)).toBe(true);
      });
    }
  }

  it("documented fixture exceptions do not import Supabase client", () => {
    const pages: Record<string, string> = {
      "/internal/demo-proof-walkthrough": "../pages/DemoProofWalkthrough.tsx",
      "/internal/contextual-pheno-comparison-demo":
        "../pages/ContextualPhenoComparisonDemo.tsx",
    };
    for (const p of PUBLIC_FIXTURE_ONLY_INTERNAL_EXCEPTIONS) {
      const file = pages[p];
      expect(file, `missing fixture-only page mapping for ${p}`).toBeTruthy();
      const src = fs.readFileSync(path.resolve(__dirname, file), "utf8");
      expect(src).not.toMatch(/@\/integrations\/supabase\/client/);
      expect(src).not.toMatch(/supabase\./);
    }
  });
});

describe("Route Guard Parity v1 — required operator-gated routes", () => {
  const REQUIRED_OPERATOR_GATED = [
    "/admin/leads",
    "/leads",
    "/pi-ingest-status",
    "/ingest-inspector",
    "/internal/ai-doctor-phase1-preview",
    "/internal/one-tent-loop-proof",
    "/internal/sensor-truth-audit",
    "/internal/ai-doctor-confidence-audit",
  ];
  for (const p of REQUIRED_OPERATOR_GATED) {
    it(`${p} is inside the RequireOperatorRole block`, () => {
      expect(OPERATOR_PROTECTED_PATHS.has(p)).toBe(true);
    });
  }
});
