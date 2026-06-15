/**
 * Manual refresh button tests for Action Queue.
 *
 * The refresh button must:
 *   - Appear near the Action Queue heading.
 *   - Call the existing load/refetch function on click.
 *   - Be disabled while loading or refreshing.
 *   - Not disable approve/reject/complete/cancel buttons.
 *   - Not imply automation, device control, or fake data.
 *   - Co-exist with the existing refreshing indicator and last-updated timestamp.
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

describe("Action Queue manual refresh button structure", () => {
  it("renders a refresh button with stable test id near the heading", () => {
    expect(SRC).toContain('data-testid="action-queue-refresh-button"');
    const headingIdx = SRC.indexOf("Action Queue");
    const btnIdx = SRC.indexOf("action-queue-refresh-button");
    expect(btnIdx).toBeGreaterThan(headingIdx);
  });

  it("uses RefreshCw icon from lucide-react", () => {
    expect(SRC).toContain("RefreshCw");
    expect(SRC).toMatch(/import.*RefreshCw.*from "lucide-react"/);
  });

  it("button has visible label 'Refresh'", () => {
    expect(SRC).toContain("<span>Refresh</span>");
  });

  it("button has accessible label 'Refresh Action Queue'", () => {
    expect(SRC).toContain('aria-label="Refresh Action Queue"');
  });

  it("button is a Button component with ghost variant", () => {
    const idx = SRC.indexOf("action-queue-refresh-button");
    const block = SRC.slice(Math.max(0, idx - 300), idx + 300);
    expect(block).toMatch(/variant="ghost"/);
    expect(block).toMatch(/size="sm"/);
  });
});

describe("Action Queue manual refresh button behavior", () => {
  it("onClick calls the existing load function", () => {
    expect(SRC).toMatch(/onClick=\{load\}/);
  });

  it("button is disabled during loading or refreshing", () => {
    const idx = SRC.indexOf("action-queue-refresh-button");
    const block = SRC.slice(Math.max(0, idx - 300), idx + 300);
    expect(block).toMatch(/disabled=\{loading \|\| isRefreshing\}/);
  });

  it("icon spins while refreshing", () => {
    const idx = SRC.indexOf("action-queue-refresh-button");
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/\`h-4 w-4 \$\{isRefreshing \? "animate-spin" : ""\}\`/);
  });

  it("does not gate approve/reject/complete/cancel buttons with refresh state", () => {
    // Action row buttons must remain disabled only when the per-row mutation is in flight.
    expect(SRC).toMatch(/const disabled = busyId === row\.id;/);
    // In the action row button block, no disabled prop should reference isRefreshing.
    const btnBlockStart = SRC.indexOf("action-queue-refresh-button");
    const actionRowsStart = SRC.indexOf("const disabled = busyId === row.id;");
    const actionBlock = SRC.slice(actionRowsStart, actionRowsStart + 700);
    expect(actionBlock).not.toMatch(/disabled=\{.*isRefreshing.*\}/);
    expect(actionBlock).not.toMatch(/disabled=\{.*loading.*\}/);
  });

  it("approve/reject buttons remain governed by busyId only", () => {
    expect(SRC).toMatch(/const disabled = busyId === row\.id;/);
  });
});

describe("Action Queue manual refresh co-existence with existing states", () => {
  it("refreshing indicator test id remains present", () => {
    expect(SRC).toContain('data-testid="action-queue-refreshing-indicator"');
  });

  it("last-updated timestamp test id remains present", () => {
    expect(SRC).toContain('data-testid="action-queue-last-updated"');
  });

  it("refresh button is rendered outside the loading skeleton block", () => {
    const btnIdx = SRC.indexOf("action-queue-refresh-button");
    const skeletonIdx = SRC.indexOf("action-queue-loading-skeleton");
    expect(btnIdx).toBeLessThan(skeletonIdx);
  });

  it("refresh button block contains no fake metric values", () => {
    const idx = SRC.indexOf("action-queue-refresh-button");
    const block = SRC.slice(idx, idx + 600);
    expect(block).not.toMatch(/\b\d+(\.\d+)?\s?(°|kpa|ppfd|ec|ph|%)\b/i);
    expect(block).not.toMatch(/temperature|humidity|vpd|soil/i);
    for (const re of UNSAFE_PATTERNS) {
      expect(block).not.toMatch(re);
    }
  });
});

describe("safety: refresh button does not leak secrets or imply automation", () => {
  it("source file contains no service_role / raw_payload / token strings", () => {
    expect(SRC).not.toMatch(/raw_payload/i);
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    expect(SRC).not.toMatch(/Bearer\s+ey/i);
    expect(SRC).not.toMatch(/sk_live_/i);
  });
});
