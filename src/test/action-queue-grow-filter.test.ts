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

const PAGE = readFileSync(resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"), "utf8");
const GROW = readFileSync(resolve(__dirname, "../..", "src/pages/GrowDetail.tsx"), "utf8");

// Only two RPC-invocation shapes are legitimate in this codebase (see
// action-detail-linked-alert.test.tsx for the full writeup):
//   1. Direct call:       supabase.rpc("name", args)
//   2. Cast-wrapped call: (supabase.rpc as unknown as (fn: string, args:
//      unknown) => Promise<...>)("name", args) — used before the RPC's
//      generated typing lands (see actionQueueRpcAvailability).
// Anchoring to the call's own first argument rather than "any quote within
// N characters of supabase.rpc" stops a dynamic/foreign RPC call from
// being credited with the canonical name (Codex P2).
const DIRECT_RPC_CALL_PATTERN = /supabase\.rpc\s*\(\s*["']([^"']+)["']\s*(?:,\s*(\w+))?\s*,?\s*\)/g;
const CAST_RPC_CALL_PATTERN =
  /supabase\.rpc\s+as\s+unknown\s+as\s*\([\s\S]{0,150}?\)\s*=>\s*[\s\S]{0,150}?\)\s*\(\s*["']([^"']+)["']\s*(?:,\s*(\w+))?\s*,?\s*\)/g;

function resolveRpcCalls(src: string): Array<{ name: string; argsVar?: string }> {
  const direct = [...src.matchAll(DIRECT_RPC_CALL_PATTERN)].map((m) => ({
    name: m[1],
    argsVar: m[2],
  }));
  const cast = [...src.matchAll(CAST_RPC_CALL_PATTERN)].map((m) => ({
    name: m[1],
    argsVar: m[2],
  }));
  return [...direct, ...cast];
}

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

  it("preserves transition/audit flow through the atomic RPC", () => {
    const rpcCallSiteCount = (PAGE.match(/supabase\.rpc\b/g) ?? []).length;
    const rpcCalls = resolveRpcCalls(PAGE);
    // Every call site must independently resolve its own first-argument
    // name — a dynamic/foreign call site would leave this short rather
    // than being credited with the canonical name.
    expect(rpcCalls.length).toBe(rpcCallSiteCount);
    expect(rpcCalls.map((c) => c.name)).toEqual(["action_queue_transition"]);
    expect(PAGE).toMatch(/buildActionQueueTransitionRpcArgs/);
    expect(PAGE).not.toMatch(/from\(\s*["']action_queue_events["']\s*\)\s*\.insert/);
  });

  it("introduces no device-control, ai-coach, or service_role surface", () => {
    expect(PAGE).not.toMatch(/ai-coach/i);
    expect(PAGE).not.toMatch(/service_role/i);
    expect(PAGE).not.toMatch(/device[_-]?control/i);
    expect(PAGE).not.toMatch(/sendCommand|deviceCommand/);
  });
});

describe("GrowDetail — Action Queue hub link", () => {
  it("links Action Queue card via actionsPath(growId)", () => {
    expect(GROW).toMatch(/actionsPath\(growId\)/);
  });
});
