/**
 * Last Updated timestamp tests for Action Queue.
 *
 * The timestamp must:
 *   - Appear only after a successful list load/refetch.
 *   - Stay visible during background refresh (alongside rows + indicator).
 *   - NOT appear before the first successful load.
 *   - NOT update on failed fetch (previous timestamp is preserved).
 *   - Render even when the first successful load returns an empty list.
 *   - Be non-interactive, not focusable, and not gate approval controls.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatLastUpdatedAgo } from "@/lib/lastUpdatedAgo";

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

describe("Action Queue last-updated timestamp state", () => {
  it("declares lastUpdatedAt as number | null state", () => {
    expect(SRC).toMatch(
      /const \[lastUpdatedAt, setLastUpdatedAt\] = useState<number \| null>\(null\)/,
    );
  });

  it("sets lastUpdatedAt only in the non-error branch of the fetch", () => {
    // The setter must sit inside the `else` (or after a guard), not unconditionally.
    expect(SRC).toMatch(/if \(error\) \{\s*toast\.error\(error\.message\);\s*\} else \{\s*setLastUpdatedAt\(Date\.now\(\)\);/);
  });

  it("does not unconditionally clear lastUpdatedAt on every load start", () => {
    expect(SRC).not.toMatch(/setLastUpdatedAt\(null\);\s*\n\s*const q = supabase/);
  });

  it("resets lastUpdatedAt when grow scope changes", () => {
    expect(SRC).toMatch(
      /useEffect\(\(\) => \{\s*hasLoadedOnceRef\.current = false;\s*setLastUpdatedAt\(null\);\s*\}, \[effectiveGrowId\]\)/,
    );
  });
});

describe("Action Queue last-updated timestamp rendering", () => {
  it("renders a timestamp element with a stable test id", () => {
    expect(SRC).toContain('data-testid="action-queue-last-updated"');
  });

  it("only renders when lastUpdatedAt is not null", () => {
    expect(SRC).toMatch(/\{lastUpdatedAt !== null && \(/);
  });

  it("uses the existing formatLastUpdatedAgo helper", () => {
    expect(SRC).toContain("formatLastUpdatedAgo");
    expect(SRC).toContain('from "@/lib/lastUpdatedAgo"');
  });

  it("timestamp element is non-interactive and not a button/link", () => {
    const idx = SRC.indexOf("action-queue-last-updated");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 200), idx + 400);
    expect(block).not.toMatch(/<Button\b/);
    expect(block).not.toMatch(/<Link\b/);
    expect(block).not.toMatch(/onClick/);
    expect(block).not.toMatch(/tabIndex/);
  });

  it("timestamp block contains no fake sensor metric values", () => {
    const idx = SRC.indexOf("action-queue-last-updated");
    const block = SRC.slice(idx, idx + 500);
    expect(block).not.toMatch(/\b\d+(\.\d+)?\s?(°|kpa|ppfd|ec|ph|%)\b/i);
    expect(block).not.toMatch(/temperature|humidity|vpd|soil/i);
    for (const re of UNSAFE_PATTERNS) {
      expect(block).not.toMatch(re);
    }
  });

  it("timestamp renders near the heading, not inside the loading skeleton", () => {
    const headingIdx = SRC.indexOf("Action Queue");
    const timestampIdx = SRC.indexOf("action-queue-last-updated");
    const skeletonIdx = SRC.indexOf("action-queue-loading-skeleton");
    expect(timestampIdx).toBeGreaterThan(headingIdx);
    expect(timestampIdx).toBeLessThan(skeletonIdx);
  });
});

describe("Action Queue last-updated timestamp behavior", () => {
  it("formatLastUpdatedAgo returns just-now for a very recent timestamp", () => {
    const now = Date.now();
    expect(formatLastUpdatedAgo(now - 10_000, now)).toBe("Last updated: just now");
  });

  it("formatLastUpdatedAgo returns a relative time for older timestamps", () => {
    const now = Date.now();
    expect(formatLastUpdatedAgo(now - 3_600_000, now)).toBe("Last updated: 1 hr ago");
  });

  it("formatLastUpdatedAgo returns dash when timestamp is null", () => {
    expect(formatLastUpdatedAgo(null, Date.now())).toBe("Last updated: —");
  });
});

describe("safety: timestamp does not gate controls or leak secrets", () => {
  it("approve/reject/simulate/complete/cancel buttons are NOT gated by lastUpdatedAt", () => {
    expect(SRC).not.toMatch(/disabled=\{lastUpdatedAt/);
    expect(SRC).not.toMatch(/disabled=\{.*lastUpdatedAt.*\}/);
  });

  it("source file contains no service_role / raw_payload / token strings in timestamp area", () => {
    expect(SRC).not.toMatch(/raw_payload/i);
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    expect(SRC).not.toMatch(/Bearer\s+ey/i);
    expect(SRC).not.toMatch(/sk_live_/i);
  });
});
