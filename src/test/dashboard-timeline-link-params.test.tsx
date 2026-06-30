/**
 * Slice 7 — Dashboard Timeline link param preservation.
 *
 * Static scan over src/pages/Dashboard.tsx. Verifies that every user-facing
 * Timeline/history link in the Dashboard:
 *   - resolves through the shared `timelinePath()` helper (never a hand-built
 *     "/logs" or "/timeline" string),
 *   - is invoked with `scopedGrowId` so the `?growId=` query param is
 *     preserved by the helper's `withGrowId` builder,
 *   - never points at the legacy `/logs` path.
 *
 * Read-only. No React render, no fetch, no Supabase, no schema work.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { timelinePath, logsPath } from "@/lib/routes";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

/** User-facing Timeline/history link copy strings rendered by Dashboard. */
const TIMELINE_LINK_LABELS = [
  "Open Timeline", // Latest Environment, Environment Trends
  "Inspect history", // Sensor Data Quality, Target Comparison
  "View full Timeline", // Recent Activity
] as const;

describe("Slice 7: Dashboard Timeline links preserve growId via timelinePath", () => {
  it("imports timelinePath from @/lib/routes and does not import logsPath", () => {
    const importLine =
      DASHBOARD.match(/import\s*\{[^}]*\}\s*from\s*["']@\/lib\/routes["']/)?.[0] ?? "";
    expect(importLine).toContain("timelinePath");
    expect(importLine).not.toContain("logsPath");
  });

  it("never references logsPath(...) in the Dashboard source", () => {
    expect(DASHBOARD).not.toMatch(/\blogsPath\s*\(/);
  });

  it("never hand-builds a /logs href in user-facing Dashboard links", () => {
    expect(DASHBOARD).not.toMatch(/to=\{?["']\/logs(?:["'?])/);
    expect(DASHBOARD).not.toMatch(/href=\{?["']\/logs(?:["'?])/);
  });

  it.each(TIMELINE_LINK_LABELS)(
    "link labeled %s uses timelinePath(scopedGrowId)",
    (label) => {
      const idx = DASHBOARD.indexOf(label);
      expect(idx, `expected to find Dashboard link labeled "${label}"`).toBeGreaterThan(-1);
      // Walk back ~600 chars from the label to find the nearest preceding
      // `to={...}` attribute on the same <Link>.
      const windowStart = Math.max(0, idx - 600);
      const slice = DASHBOARD.slice(windowStart, idx);
      const toMatches = [...slice.matchAll(/to=\{([^}]+)\}/g)];
      const nearestTo = toMatches.at(-1)?.[1] ?? "";
      expect(
        nearestTo,
        `link "${label}" should resolve to a timelinePath(scopedGrowId) target`,
      ).toMatch(/timelinePath\s*\(\s*scopedGrowId\s*\)/);
    },
  );

  it("uses timelinePath at least 5 times (once per known Timeline/history link)", () => {
    const occurrences = [...DASHBOARD.matchAll(/timelinePath\s*\(\s*scopedGrowId\s*\)/g)];
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
  });

  it("timelinePath helper preserves growId and renders the canonical /timeline path", () => {
    expect(timelinePath("grow-abc")).toBe("/timeline?growId=grow-abc");
    expect(timelinePath(null)).toBe("/timeline");
    expect(timelinePath(undefined)).toBe("/timeline");
    // URL-encoding sanity for arbitrary id strings.
    expect(timelinePath("a b/c")).toBe("/timeline?growId=a%20b%2Fc");
  });

  it("legacy logsPath helper remains available but resolves to /logs (alias)", () => {
    // The helper is retained for backward-compatibility in non-Dashboard
    // surfaces and tests. The App.tsx redirect alias is what actually
    // forwards /logs → /timeline at runtime; this helper must NOT be used
    // by user-facing Dashboard links (asserted above).
    expect(logsPath("grow-abc")).toBe("/logs?growId=grow-abc");
  });

  it("Dashboard currently scopes Timeline links by growId only (no plantId/tentId/filter Timeline links exist)", () => {
    // Documented invariant: no Dashboard Timeline/history link currently
    // carries a plantId, tentId, or filter param. If a future slice adds
    // one, this assertion should be tightened, not deleted.
    const timelineCalls = [
      ...DASHBOARD.matchAll(/timelinePath\s*\(([^)]*)\)/g),
    ].map((m) => m[1].trim());
    expect(timelineCalls.length).toBeGreaterThan(0);
    for (const arg of timelineCalls) {
      expect(arg).toBe("scopedGrowId");
    }
    // No hand-built timeline URL appending plantId/tentId/filter.
    expect(DASHBOARD).not.toMatch(
      /["']\/timeline\?[^"']*\b(plantId|tentId|filter|filters)=/,
    );
  });
});
