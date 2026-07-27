/**
 * Action Detail loading / not-found / error state polish.
 *
 * Static-source tests (no React render): assert the page source contains the
 * required accessible state markup, copy, and safety properties. These act as
 * regression guards parallel to action-queue-state-polish.test.tsx.
 *
 * Scope (presentation/accessibility only):
 *  - Loading: "Loading action…", role="status", aria-live="polite",
 *    aria-busy="true"; no not-found/error copy in the loading branch.
 *  - Not-found: calm copy "Action not found"; back-link present; raw action id
 *    is not rendered in visible UI.
 *  - Error: role="alert", aria-live="assertive", a "Retry" button that calls
 *    load(), sanitized message (no raw provider/internal IDs).
 *  - Focus: BackLink + Retry use focus-visible:ring utilities.
 *  - Safety: no service_role, no client user_id insert, no automation/device
 *    control copy, no AI invocation, no auto-approve/reject/execute paths.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const RAW = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");
const SRC = stripSourceComments(RAW);

function block(label: string, regex: RegExp): string {
  const m = SRC.match(regex);
  if (!m) throw new Error(`Could not locate ${label} block in ActionDetail.tsx`);
  return m[0];
}

const LOADING_BLOCK = block("loading-state", /if \(loading\) \{[\s\S]*?\n {2}\}/);
const ERROR_BLOCK = block("error-state", /if \(loadError\) \{[\s\S]*?\n {2}\}/);
const NOTFOUND_BLOCK = block("not-found-state", /if \(notFound \|\| !row\) \{[\s\S]*?\n {2}\}/);

// Only two RPC-invocation shapes are legitimate in this codebase (see
// action-detail-linked-alert.test.tsx for the full writeup):
//   1. Direct call:       supabase.rpc("name", args)
//   2. Cast-wrapped call: (supabase.rpc as unknown as (fn: string, args:
//      unknown) => Promise<...>)("name", args) — used before the RPC's
//      generated typing lands (see actionQueueRpcAvailability).
// Anchoring to the call's own first argument (and second argument
// identifier) rather than "any quote within N characters of supabase.rpc"
// stops a dynamic/foreign RPC call from being credited with the canonical
// name or the expected rpcArgs binding (Codex P2).
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

describe("ActionDetail — loading state", () => {
  it("renders visible 'Loading action…' copy", () => {
    expect(LOADING_BLOCK).toMatch(/Loading action…/);
  });

  it("uses accessible status semantics", () => {
    expect(LOADING_BLOCK).toMatch(/role="status"/);
    expect(LOADING_BLOCK).toMatch(/aria-live="polite"/);
    expect(LOADING_BLOCK).toMatch(/aria-busy="true"/);
  });

  it("does not render not-found or error copy while loading", () => {
    expect(LOADING_BLOCK).not.toMatch(/Action not found/);
    expect(LOADING_BLOCK).not.toMatch(/couldn't load/i);
    expect(LOADING_BLOCK).not.toMatch(/Retry/);
  });
});

describe("ActionDetail — not-found state", () => {
  it("renders calm not-found copy", () => {
    expect(NOTFOUND_BLOCK).toMatch(/Action not found/);
    expect(NOTFOUND_BLOCK).toMatch(/do not have access/);
  });

  it("includes a Back to Action Queue affordance", () => {
    expect(NOTFOUND_BLOCK).toMatch(/<BackLink\s*\/>/);
  });

  it("does not render the raw actionId param", () => {
    // Visible UI for not-found must not interpolate actionId / row.id.
    expect(NOTFOUND_BLOCK).not.toMatch(/\{\s*actionId\s*\}/);
    expect(NOTFOUND_BLOCK).not.toMatch(/\{\s*row\?\.id\s*\}/);
    expect(NOTFOUND_BLOCK).not.toMatch(/\{\s*row\.id\s*\}/);
  });

  it("does not raise an alert role for the calm not-found UI", () => {
    expect(NOTFOUND_BLOCK).not.toMatch(/role="alert"/);
  });
});

describe("ActionDetail — error state", () => {
  it("uses role=alert with assertive live region", () => {
    expect(ERROR_BLOCK).toMatch(/role="alert"/);
    expect(ERROR_BLOCK).toMatch(/aria-live="assertive"/);
  });

  it("includes a clear, accessible Retry button wired to load()", () => {
    expect(ERROR_BLOCK).toMatch(/>\s*Retry\s*</);
    expect(ERROR_BLOCK).toMatch(/onClick=\{\(\)\s*=>\s*load\(\)\}/);
  });

  it("Retry surface uses focus-visible ring utilities", () => {
    expect(ERROR_BLOCK).toMatch(/focus-visible:ring-2/);
  });

  it("does not leak raw provider error or internal IDs into the message", () => {
    expect(ERROR_BLOCK).not.toMatch(/error\.message/);
    expect(ERROR_BLOCK).not.toMatch(/\{\s*actionId\s*\}/);
    expect(ERROR_BLOCK).not.toMatch(/\{\s*row\?\.id\s*\}/);
    expect(ERROR_BLOCK).not.toMatch(/\{\s*row\.id\s*\}/);
  });

  it("uses a sanitized human-readable message", () => {
    expect(ERROR_BLOCK).toMatch(/couldn't load/i);
  });
});

describe("ActionDetail — load() error handling", () => {
  it("sets loadError (not notFound) when the supabase call returns error", () => {
    expect(SRC).toMatch(/if \(error\) \{[\s\S]{0,400}setLoadError\(/);
  });

  it("sets notFound for the empty-data branch (RLS-blocked or missing row)", () => {
    expect(SRC).toMatch(/if \(!data\) \{[\s\S]{0,200}setNotFound\(true\)/);
  });

  it("resets loadError + notFound on every load() invocation", () => {
    expect(SRC).toMatch(/setNotFound\(false\);[\s\S]{0,200}setLoadError\(null\);/);
  });
});

describe("ActionDetail — back link focus styles", () => {
  it("BackLink uses focus-visible:ring utilities", () => {
    const back = block("BackLink", /function BackLink\(\) \{[\s\S]*?\n\}/);
    expect(back).toMatch(/focus-visible:ring-2/);
    expect(back).toMatch(/focus-visible:ring-ring/);
  });
});

describe("ActionDetail — state UI safety", () => {
  it("state branches do not leak [alert:] or [session:] tokens", () => {
    const all = LOADING_BLOCK + ERROR_BLOCK + NOTFOUND_BLOCK;
    expect(all).not.toMatch(/\[alert:/);
    expect(all).not.toMatch(/\[session:/);
  });

  it("state branches contain no device-control or automation copy", () => {
    const all = LOADING_BLOCK + ERROR_BLOCK + NOTFOUND_BLOCK;
    expect(all).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
    );
    expect(all).not.toMatch(/autopilot|auto[- ]?execute|auto[- ]?run|executed automatically/i);
  });

  it("page module contains no service_role and sends no identity to the transition RPC", () => {
    expect(SRC).not.toMatch(/service_role/i);
    const m = SRC.match(
      /const\s+rpcArgs\s*=\s*buildActionQueueTransitionRpcArgs\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/\buser_id\b|\bgrow_id\b|\bevent_type\b|\bnew_status\b/);
    const rpcCallSiteCount = (SRC.match(/supabase\.rpc\b/g) ?? []).length;
    const rpcCalls = resolveRpcCalls(SRC);
    // Every call site must independently resolve its own first-argument
    // name and second-argument identifier — a dynamic/foreign call site
    // would leave this short rather than being credited with the
    // canonical name or rpcArgs binding.
    expect(rpcCalls.length).toBe(rpcCallSiteCount);
    expect(rpcCalls).toEqual([{ name: "action_queue_transition", argsVar: "rpcArgs" }]);
  });

  it("page module does not invoke edge functions or AI gateway", () => {
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/ai[- ]?gateway/i);
  });
});
