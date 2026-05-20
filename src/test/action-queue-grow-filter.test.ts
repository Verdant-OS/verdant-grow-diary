/**
 * Static tests for Action Queue grow-scoped URL filter (?growId=...).
 *
 * Asserts:
 *  - ActionQueue reads growId from URL search params.
 *  - Query filters action_queue by grow_id when URL growId is present.
 *  - Banner + Clear grow filter link render when URL growId is present.
 *  - Existing status/risk/sort filters remain.
 *  - Transition/audit flow unchanged.
 *  - GrowDetail Action Queue hub card links to /actions?growId=<id>.
 *  - No ai-coach call, no device-control, no service_role introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"),
  "utf8",
);
const GROW = readFileSync(
  resolve(__dirname, "../..", "src/pages/GrowDetail.tsx"),
  "utf8",
);

describe("ActionQueue — URL growId filter", () => {
  it("reads growId via shared useScopedGrow hook", () => {
    expect(PAGE).toMatch(/useScopedGrow\(\)/);
    expect(PAGE).toMatch(/const\s*\{[^}]*urlGrowId[^}]*\}\s*=\s*useScopedGrow\(\)/);
  });

  it("scopes the action_queue query by grow_id", () => {
    expect(PAGE).toMatch(/\.eq\(\s*["']grow_id["']\s*,\s*effectiveGrowId\s*\)/);
  });

  it("renders the grow filter banner and Clear grow filter link via ScopedGrowBanner", () => {
    expect(PAGE).toMatch(/ScopedGrowBanner/);
    expect(PAGE).toMatch(/label=\s*["']actions["']/);
    expect(PAGE).toMatch(/clearHref=\{actionsPath\(\)\}/);
  });

  it("keeps status, risk, and sort filters", () => {
    expect(PAGE).toMatch(/aria-label=\s*["']Status filter["']/);
    expect(PAGE).toMatch(/aria-label=\s*["']Risk filter["']/);
    expect(PAGE).toMatch(/aria-label=\s*["']Sort order["']/);
  });

  it("preserves transition/audit flow (no schema changes)", () => {
    expect(PAGE).toMatch(/from\(\s*["']action_queue_events["']\s*\)\s*\.insert/);
    expect(PAGE).toMatch(/buildTransitionPatch/);
  });

  it("introduces no device-control, ai-coach, or service_role surface", () => {
    expect(PAGE).not.toMatch(/ai-coach/i);
    expect(PAGE).not.toMatch(/service_role/i);
    expect(PAGE).not.toMatch(/device[_-]?control/i);
    expect(PAGE).not.toMatch(/sendCommand|deviceCommand/);
  });
});

describe("GrowDetail — Action Queue hub link", () => {
  it("links Action Queue card to /actions?growId=<growId>", () => {
    expect(GROW).toMatch(/\/actions\?growId=\$\{growId\}/);
  });
});
