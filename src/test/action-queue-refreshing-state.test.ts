/**
 * Static-source tests for the Action Queue subtle background-refresh
 * indicator. The indicator must:
 *   - Render only when a refetch overlaps an already-loaded list
 *     (never during initial loading).
 *   - Use polite aria-live and be non-interactive.
 *   - Be presenter-only — no fake action rows, no fake telemetry,
 *     no automation/device-control copy, no secret tokens.
 *   - Not gate approve / reject / simulate controls. Those remain
 *     governed by the existing per-row mutation state (busyId).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SRC = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");

const UNSAFE_PATTERNS: ReadonlyArray<RegExp> = [
  /raw_payload/i,
  /service_role/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /Bearer\s+ey/i,
  /sk_live_/i,
  /\bturn (on|off)\b/i,
  /\bactuator\.(send|trigger|run|fire)/i,
  /\brelay\.(on|off|toggle)/i,
  /automatically (turn|run|trigger|dose|adjust)/i,
];

describe("Action Queue background refresh indicator", () => {
  it("declares a dedicated refreshing state separate from initial loading", () => {
    expect(SRC).toMatch(/const \[isRefreshing, setIsRefreshing\] = useState\(false\)/);
    expect(SRC).toMatch(/hasLoadedOnceRef/);
  });

  it("uses the loaded-once gate to pick skeleton vs. subtle refresh", () => {
    expect(SRC).toMatch(/if \(hasLoadedOnceRef\.current\)\s*{\s*setIsRefreshing\(true\)/);
    expect(SRC).toMatch(/}\s*else\s*{\s*setLoading\(true\)/);
    // Both flags must be cleared after the fetch resolves.
    expect(SRC).toMatch(/setLoading\(false\);\s*setIsRefreshing\(false\)/);
  });

  it("renders the indicator only when not in initial loading", () => {
    expect(SRC).toMatch(/!loading && isRefreshing &&/);
    expect(SRC).toContain('data-testid="action-queue-refreshing-indicator"');
    expect(SRC).toContain("Refreshing actions…");
  });

  it("indicator is polite, non-interactive, and accessible", () => {
    const idx = SRC.indexOf("action-queue-refreshing-indicator");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 400), idx + 400);
    expect(block).toMatch(/role=["']status["']/);
    expect(block).toMatch(/aria-live=["']polite["']/);
    // Must not be a button / link / alert.
    expect(block).not.toMatch(/<Button\b/);
    expect(block).not.toMatch(/<Link\b/);
    expect(block).not.toMatch(/role=["']alert["']/);
    // Spinner must be aria-hidden so it isn't announced as data.
    expect(block).toMatch(/aria-hidden=["']?true["']?/);
  });

  it("does not render fake action rows / fake telemetry inside the indicator block", () => {
    const idx = SRC.indexOf("action-queue-refreshing-indicator");
    const block = SRC.slice(idx, idx + 600);
    expect(block).not.toMatch(/\b\d+(\.\d+)?\s?(°|kpa|ppfd|ec|ph|%)\b/i);
    expect(block).not.toMatch(/temperature|humidity|vpd|soil/i);
    for (const re of UNSAFE_PATTERNS) {
      expect(block).not.toMatch(re);
    }
  });

  it("scope changes reset the loaded-once gate so a real skeleton shows on grow switch", () => {
    expect(SRC).toMatch(
      /useEffect\(\(\) => \{\s*hasLoadedOnceRef\.current = false;\s*\}, \[effectiveGrowId\]\)/,
    );
  });

  it("approve / reject / simulate / cancel buttons are NOT gated by isRefreshing", () => {
    // Buttons must remain disabled only when the per-row mutation is in flight (busyId === row.id).
    expect(SRC).toMatch(/const disabled = busyId === row\.id;/);
    // Sanity: no button passes `disabled={isRefreshing}` or similar.
    expect(SRC).not.toMatch(/disabled=\{isRefreshing/);
    expect(SRC).not.toMatch(/disabled=\{.*isRefreshing.*\}/);
  });

  it("loading skeleton path stays mutually exclusive with the refresh indicator", () => {
    // The indicator is gated on `!loading`, so during the very first load
    // the skeleton (not the refresh pill) is what renders.
    const skeletonIdx = SRC.indexOf("action-queue-loading-skeleton");
    expect(skeletonIdx).toBeGreaterThan(-1);
    const slice = SRC.slice(Math.max(0, skeletonIdx - 200), skeletonIdx + 800);
    expect(slice).not.toContain("action-queue-refreshing-indicator");
  });

  it("empty pending state can co-exist with the refresh indicator without implying actions exist", () => {
    // The empty state is rendered when pending.length === 0; it should not
    // be replaced by the refresh indicator and the indicator must not
    // inject any fake row markup.
    expect(SRC).toContain('data-testid="action-queue-empty-pending"');
    const indicatorIdx = SRC.indexOf("action-queue-refreshing-indicator");
    const emptyIdx = SRC.indexOf("action-queue-empty-pending");
    expect(indicatorIdx).toBeLessThan(emptyIdx);
  });
});

describe("safety: refresh indicator file does not leak secrets or unsafe language", () => {
  it("source file contains no service_role / raw_payload / token strings", () => {
    expect(SRC).not.toMatch(/raw_payload/i);
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    expect(SRC).not.toMatch(/Bearer\s+ey/i);
    expect(SRC).not.toMatch(/sk_live_/i);
  });
});
