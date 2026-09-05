// Route Guard Parity v1 — static parity between appRouteManifest and file routes.
//
// Confirms every route in appRouteManifest with access === "operator" | "internal"
// is mounted under the `/_app/_operator` layout (RequireOperatorRole),
// except for documented public/fixture-only exceptions.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  extractMountedAppRoutePaths,
  isMountedUnderOperatorLayout,
} from "./helpers/routeManifestSyncHarness";

const MOUNTED = new Set(extractMountedAppRoutePaths());

const OPERATOR_PROTECTED_PATHS = new Set(
  [...MOUNTED].filter((p) => isMountedUnderOperatorLayout(p)),
);

const PUBLIC_FIXTURE_ONLY_DEMO_ROUTES = new Set<string>([
  "/internal/demo-proof-walkthrough",
  "/internal/contextual-pheno-comparison-demo",
  "/internal/demo-advanced-nutrients-feeding",
]);

/**
 * Deferred operator/internal manifest entries that are NOT covered by
 * Route Guard Parity v1. They are intentionally left as-is in this slice
 * because moving them under /_app/_operator layout would change
 * grower-facing behavior, or was not part of the audited route set.
 * Tracked for a follow-up slice after a behavior review.
 *
 * Diagnostics Audience Split v1 — `/diagnostics` removed from this list
 * and is now mounted inside /_app/_operator layout.
 *
 * Grow Lineage Manifest Reclassification v1 — `/grow-lineage` removed
 * from this list and reclassified as `access: "auth"` in the manifest.
 * It is a grower-facing repair tool (Archive → Lineage Repair) that
 * reads owner-scoped tents/grows and only mutates the signed-in
 * grower's own `tents.grow_id` under existing RLS. Moving it under
 * /_app/_operator layout would incorrectly hide grower UI.
 */
const DEFERRED_OPERATOR_PARITY = new Set<string>([]);

describe("Route Guard Parity v1 — operator/internal manifest entries are role-gated", () => {
  const gated = APP_ROUTES.filter((r) => r.access === "operator" || r.access === "internal");

  for (const r of gated) {
    if (PUBLIC_FIXTURE_ONLY_DEMO_ROUTES.has(r.path)) {
      it(`${r.path} must not be labeled operator/internal — it is a public fixture-only demo`, () => {
        // Route Metadata Truth v1: these routes are declared `public`.
        // Reaching this branch means the manifest drifted back.
        expect(r.access).toBe("public");
      });
    } else if (DEFERRED_OPERATOR_PARITY.has(r.path)) {
      it(`${r.path} is a documented deferred-parity entry (follow-up slice)`, () => {
        expect(OPERATOR_PROTECTED_PATHS.has(r.path)).toBe(false);
      });
    } else {
      it(`${r.path} is mounted inside /_app/_operator layout`, () => {
        expect(OPERATOR_PROTECTED_PATHS.has(r.path)).toBe(true);
      });
    }
  }

  it("documented fixture-only demo routes do not import Supabase client", () => {
    const pages: Record<string, string> = {
      "/internal/demo-proof-walkthrough": "../pages/DemoProofWalkthrough.tsx",
      "/internal/contextual-pheno-comparison-demo": "../pages/ContextualPhenoComparisonDemo.tsx",
      "/internal/demo-advanced-nutrients-feeding": "../pages/AnVerdantFeedingDemo.tsx",
    };
    for (const p of PUBLIC_FIXTURE_ONLY_DEMO_ROUTES) {
      const file = pages[p];
      expect(file, `missing fixture-only page mapping for ${p}`).toBeTruthy();
      const src = fs.readFileSync(path.resolve(__dirname, file), "utf8");
      expect(src).not.toMatch(/@\/integrations\/supabase\/client/);
      expect(src).not.toMatch(/supabase\./);
    }
  });
});

describe("Route Metadata Truth v1 — fixture-only demo routes are labeled public", () => {
  for (const p of PUBLIC_FIXTURE_ONLY_DEMO_ROUTES) {
    const entry = APP_ROUTES.find((r) => r.path === p);

    it(`${p} is present in the manifest and labeled public (matches its actual routing)`, () => {
      expect(entry).toBeDefined();
      expect(entry?.access).toBe("public");
      // The description must keep declaring the fixture-only contract.
      expect(entry?.description).toMatch(/fixture/i);
    });

    it(`${p} stays outside the operator-role gate (mounted as a public presenter)`, () => {
      expect(OPERATOR_PROTECTED_PATHS.has(p)).toBe(false);
    });
  }
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
    "/diagnostics",
  ];
  for (const p of REQUIRED_OPERATOR_GATED) {
    it(`${p} is inside the RequireOperatorRole block`, () => {
      expect(OPERATOR_PROTECTED_PATHS.has(p)).toBe(true);
    });
  }
});

describe("Grow Lineage Manifest Reclassification v1 — /grow-lineage is grower-facing auth", () => {
  const entry = APP_ROUTES.find((r) => r.path === "/grow-lineage");

  it("is present in the manifest", () => {
    expect(entry).toBeDefined();
  });

  it("is access: 'auth' (grower-facing authenticated), not internal/operator/public", () => {
    expect(entry?.access).toBe("auth");
  });

  it("is NOT mounted inside /_app/_operator layout", () => {
    expect(OPERATOR_PROTECTED_PATHS.has("/grow-lineage")).toBe(false);
  });
});
