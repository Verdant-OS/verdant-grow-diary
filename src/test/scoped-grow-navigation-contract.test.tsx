/**
 * Contract tests for the scoped-grow navigation flow.
 *
 * Protects the end-to-end shape of the `?growId=` navigation contract:
 *  - GrowDetail emits canonical scoped links into Logs/Plants/Tents/Actions.
 *  - Scoped pages consume the shared useScopedGrow hook + ScopedGrowBanner.
 *  - Clear-filter links point back to the canonical unscoped routes.
 *  - Back-to-Grow links flow through backHref (undefined on invalid growId,
 *    so no <Link> renders — verified at the hook level).
 *  - Query/filter precedence: urlGrowId beats the store's active grow.
 *  - Create defaults receive the validated growId.
 *  - No ai-coach / device-control / service_role surface is introduced.
 *
 * These are static (source-text) assertions plus one hook behavior check.
 * They are intentionally narrow: they fail loudly when the navigation
 * contract drifts, but do not re-test individual page rendering.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const GROW_DETAIL = read("src/pages/GrowDetail.tsx");
const PLANTS = read("src/pages/Plants.tsx");
const TENTS = read("src/pages/Tents.tsx");
const TIMELINE = read("src/pages/Timeline.tsx");
const ACTIONQ = read("src/pages/ActionQueue.tsx");
const HOOK_SRC = read("src/hooks/useScopedGrow.ts");
const BANNER_SRC = read("src/components/ScopedGrowBanner.tsx");

const SCOPED_PAGES: Array<[string, string]> = [
  ["Plants", PLANTS],
  ["Tents", TENTS],
  ["Timeline", TIMELINE],
  ["ActionQueue", ACTIONQ],
];

describe("scoped-grow navigation contract — GrowDetail outbound links", () => {
  it("links to /logs?growId=<growId>", () => {
    expect(GROW_DETAIL).toMatch(/to=\{`\/logs\?growId=\$\{growId\}`\}/);
  });
  it("links to /plants?growId=<growId>", () => {
    expect(GROW_DETAIL).toMatch(/to=\{`\/plants\?growId=\$\{growId\}`\}/);
  });
  it("links to /tents?growId=<growId>", () => {
    expect(GROW_DETAIL).toMatch(/to=\{`\/tents\?growId=\$\{growId\}`\}/);
  });
  it("links to /actions?growId=<growId>", () => {
    expect(GROW_DETAIL).toMatch(/to=\{`\/actions\?growId=\$\{growId\}`\}/);
  });
});

describe("scoped-grow navigation contract — scoped pages consume shared primitives", () => {
  it.each(SCOPED_PAGES)("%s uses useScopedGrow()", (_name, src) => {
    expect(src).toMatch(/useScopedGrow\(\)/);
    expect(src).toMatch(/from\s+["']@\/hooks\/useScopedGrow["']/);
  });
  it.each(SCOPED_PAGES)("%s renders <ScopedGrowBanner />", (_name, src) => {
    expect(src).toMatch(/import\s+ScopedGrowBanner/);
    expect(src).toMatch(/<ScopedGrowBanner/);
  });
});

describe("scoped-grow navigation contract — clear-filter targets", () => {
  it("Plants clears to /plants", () => {
    expect(PLANTS).toMatch(/clearHref=\s*["']\/plants["']/);
  });
  it("Tents clears to /tents", () => {
    expect(TENTS).toMatch(/clearHref=\s*["']\/tents["']/);
  });
  it("Timeline/Logs clears to /timeline and /logs respectively", () => {
    expect(TIMELINE).toMatch(/clearTo\s*=\s*isLogsRoute\s*\?\s*["']\/logs["']\s*:\s*["']\/timeline["']/);
    expect(TIMELINE).toMatch(/clearHref=\{clearTo\}/);
  });
  it("ActionQueue clears to /actions", () => {
    expect(ACTIONQ).toMatch(/clearHref=\s*["']\/actions["']/);
  });
});

describe("scoped-grow navigation contract — Back to Grow wiring", () => {
  it.each(SCOPED_PAGES)("%s threads backHref from the hook", (_name, src) => {
    expect(src).toMatch(/backHref=\{backHref\}/);
  });

  it("ScopedGrowBanner only renders the Back to Grow link when backHref is provided", () => {
    // Defensive: the banner gates the link on `backHref &&`.
    expect(BANNER_SRC).toMatch(/backHref\s*&&[\s\S]*?Back to Grow/);
  });

  it("invalid growId yields no backHref (no Back to Grow link rendered)", async () => {
    vi.resetModules();
    vi.doMock("@/store/grows", () => ({
      useGrows: () => ({ grows: [{ id: "grow-1", name: "Blue Dream" }] }),
    }));
    const { useScopedGrow } = await import("@/hooks/useScopedGrow");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/anywhere?growId=does-not-exist"]}>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useScopedGrow(), { wrapper });
    expect(result.current.urlGrowId).toBe("does-not-exist");
    expect(result.current.isValidScopedGrow).toBe(false);
    expect(result.current.backHref).toBeUndefined();
    vi.doUnmock("@/store/grows");
  });
});

describe("scoped-grow navigation contract — filter precedence", () => {
  it("Timeline/Logs uses urlGrowId before store activeGrowId", () => {
    expect(TIMELINE).toMatch(/urlGrowId\s*\?\?\s*storeGrowId/);
  });
  it("ActionQueue uses urlGrowId before store activeGrowId", () => {
    expect(ACTIONQ).toMatch(/effectiveGrowId\s*=\s*urlGrowId\s*\?\?\s*activeGrowId/);
  });
  it("Plants forwards urlGrowId to useGrowPlants", () => {
    expect(PLANTS).toMatch(/useGrowPlants\([^)]*urlGrowId[^)]*\)/);
  });
  it("Tents forwards urlGrowId to useGrowTents", () => {
    expect(TENTS).toMatch(/useGrowTents\([^)]*urlGrowId[^)]*\)/);
  });
});

describe("scoped-grow navigation contract — create defaults remain grow-aware", () => {
  it("Logs (Timeline) syncs valid urlGrowId into the active grow store", () => {
    expect(TIMELINE).toMatch(/grows\.some\(\s*\(g\)\s*=>\s*g\.id\s*===\s*urlGrowId\s*\)/);
    expect(TIMELINE).toMatch(/setActiveGrowId\(urlGrowId\)/);
  });
  it("Plants passes validGrowId into CreatePlantDialog defaultGrowId", () => {
    expect(PLANTS).toMatch(/<CreatePlantDialog\s+defaultGrowId=\{validGrowId\}\s*\/>/);
  });
  it("Tents passes validGrowId into CreateTentDialog defaultGrowId", () => {
    expect(TENTS).toMatch(/<CreateTentDialog\s+defaultGrowId=\{validGrowId\}\s*\/>/);
  });
});

describe("scoped-grow navigation contract — safe surface", () => {
  const SAFE = [GROW_DETAIL, PLANTS, TENTS, TIMELINE, ACTIONQ, HOOK_SRC, BANNER_SRC];
  it("no ai-coach call introduced", () => {
    for (const src of SAFE) expect(src).not.toMatch(/ai-coach|ai_coach/);
  });
  it("no device-control strings introduced", () => {
    for (const src of SAFE) {
      expect(src).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i);
    }
  });
  it("no service_role introduced", () => {
    for (const src of SAFE) expect(src).not.toMatch(/service_role/);
  });
});
