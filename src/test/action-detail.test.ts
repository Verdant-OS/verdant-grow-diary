import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractMountedAppRoutePaths,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");
const APP = readAllRouteModuleSources();
const DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");

// Only two RPC-invocation shapes are legitimate in this codebase (see
// action-detail-linked-alert.test.tsx for the full writeup):
//   1. Direct call:       supabase.rpc("name", args)
//   2. Cast-wrapped call: (supabase.rpc as unknown as (fn: string, args:
//      unknown) => Promise<...>)("name", args) — used before the RPC's
//      generated typing lands (see actionQueueRpcAvailability).
// Anchoring to the call's own first argument (and, here, its second
// argument identifier) rather than "any quote within N characters of
// supabase.rpc" stops a dynamic/foreign RPC call from being credited with
// the canonical name or the expected rpcArgs binding (Codex P2).
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

describe("Action Queue detail view", () => {
  it("registers the /actions/:actionId route in file routes", () => {
    expect(extractMountedAppRoutePaths()).toContain("/actions/:actionId");
    expect(APP).toMatch(/ActionDetail/);
    expect(APP).toMatch(/@\/pages\/ActionDetail|pages\/ActionDetail/);
  });

  it("uses the useParams actionId from the URL", () => {
    expect(DETAIL).toMatch(/useParams<\{\s*actionId:\s*string\s*\}>/);
  });

  it("queries action_queue by id with maybeSingle (safe not-found)", () => {
    expect(DETAIL).toMatch(
      /\.from\(\s*["']action_queue["']\s*\)[\s\S]{0,600}\.eq\(\s*["']id["']\s*,\s*actionId\s*\)[\s\S]{0,80}\.maybeSingle\(\)/,
    );
  });

  it("queries action_queue_events by action_queue_id ordered newest-first", () => {
    expect(DETAIL).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,400}\.eq\(\s*["']action_queue_id["']\s*,\s*actionId\s*\)[\s\S]{0,200}\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    );
  });

  it("renders an audit-history section and shows previous → new status", () => {
    expect(DETAIL).toMatch(/aria-label="Audit history"/);
    expect(DETAIL).toMatch(/previous_status \?\? "—"\}\s*→\s*\{e\.new_status \?\? "—"/);
  });

  it("renders a not-found / RLS-blocked safe state", () => {
    expect(DETAIL).toMatch(/Action not found/);
    expect(DETAIL).toMatch(/do not have access/);
  });

  it("has a Back to Action Queue link to /actions via actionsPath()", () => {
    expect(DETAIL).toMatch(/to=\{actionsPath\(\)\}/);
    expect(DETAIL).toMatch(/Back to Action Queue/);
  });

  it("guards transitions on terminal statuses via shared helper", () => {
    expect(DETAIL).toMatch(/from "@\/lib\/actionQueueTransitions"/);
    expect(DETAIL).toMatch(/isTerminalStatus/);
    expect(DETAIL).toMatch(/!isTerminalStatus\(row\.status\)\s*&&\s*\(\(\) => \{/);
    expect(DETAIL).toMatch(/if \(!row \|\| isTerminal\(row\.status\)\) return;/);
  });

  it("imports the shared transition guards (canApprove/canSimulate/canReject/canComplete/canCancel)", () => {
    expect(DETAIL).toMatch(
      /import \{[\s\S]*?canApprove[\s\S]*?canSimulate[\s\S]*?canReject[\s\S]*?canComplete[\s\S]*?canCancel[\s\S]*?\} from "@\/lib\/actionQueueTransitions"/,
    );
  });

  it("does not allow editing audit events (no update on action_queue_events)", () => {
    expect(DETAIL).not.toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.update\(/,
    );
    expect(DETAIL).not.toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.delete\(/,
    );
  });

  it("uses the atomic transition RPC without caller-supplied identity", () => {
    const m = DETAIL.match(
      /const\s+rpcArgs\s*=\s*buildActionQueueTransitionRpcArgs\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(m).toBeTruthy();
    expect(m![1]).not.toMatch(/\buser_id\b|\bgrow_id\b|\bevent_type\b|\bnew_status\b/);
    const rpcCallSiteCount = (DETAIL.match(/supabase\.rpc\b/g) ?? []).length;
    const rpcCalls = resolveRpcCalls(DETAIL);
    // Every call site must independently resolve its own first-argument
    // name and second-argument identifier — a dynamic/foreign call site
    // would leave this short rather than being credited with the
    // canonical name or rpcArgs binding.
    expect(rpcCalls.length).toBe(rpcCallSiteCount);
    expect(rpcCalls).toEqual([{ name: "action_queue_transition", argsVar: "rpcArgs" }]);
    expect(DETAIL).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(/);
  });

  it("introduces no device-control surface or service_role", () => {
    expect(DETAIL).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(DETAIL).not.toMatch(/service_role/i);
  });
});
