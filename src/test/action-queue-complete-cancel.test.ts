import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../pages/ActionQueue.tsx"), "utf8");

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

function resolveRpcCalls(source: string): Array<{ name: string; argsVar?: string }> {
  const direct = [...source.matchAll(DIRECT_RPC_CALL_PATTERN)].map((m) => ({
    name: m[1],
    argsVar: m[2],
  }));
  const cast = [...source.matchAll(CAST_RPC_CALL_PATTERN)].map((m) => ({
    name: m[1],
    argsVar: m[2],
  }));
  return [...direct, ...cast];
}

describe("Action Queue complete/cancel transitions", () => {
  it("defines complete and cancel dialog kinds", () => {
    expect(src).toMatch(/"approve" \| "reject" \| "simulate" \| "complete" \| "cancel"/);
  });

  it("blocks transitions on terminal statuses via shared isTerminalStatus", () => {
    expect(src).toMatch(/isTerminalStatus\(row\.status\)/);
  });

  it("complete branch delegates status and completed_at derivation to the transactional RPC", () => {
    expect(src).toMatch(/transition:\s*kind/);
    expect(src).toMatch(/expectedStatus:\s*row\.status/);
    expect(src).toMatch(/from "@\/lib\/actionQueueTransitions"/);
  });

  it("cancel transition accepts only a validated canonical RPC result", () => {
    expect(src).toMatch(/parseActionQueueTransitionRpcResult\(data,\s*rpcArgs\)/);
    expect(src).toMatch(/result\.ok !== true/);
  });

  it("Mark Complete is gated via shared canComplete", () => {
    expect(src).toMatch(
      /import \{[\s\S]*?canComplete[\s\S]*?\} from "@\/lib\/actionQueueTransitions"/,
    );
    expect(src).toMatch(/canComplete\(row\.status\) && \(/);
    expect(src).toMatch(/Mark Complete/);
  });

  it("Cancel is gated via shared canCancel", () => {
    expect(src).toMatch(
      /import \{[\s\S]*?canCancel[\s\S]*?\} from "@\/lib\/actionQueueTransitions"/,
    );
    expect(src).toMatch(/canCancel\(row\.status\) && \(/);
  });

  it("status filter includes completed and cancelled", () => {
    expect(src).toMatch(/value="completed">Completed/);
    expect(src).toMatch(/value="cancelled">Cancelled/);
  });

  it("uses existing note dialog flow for complete and cancel", () => {
    expect(src).toMatch(/openNoteDialog\(row, "complete"\)/);
    expect(src).toMatch(/openNoteDialog\(row, "cancel"\)/);
    expect(src).toMatch(/complete: \{\s*title: "Mark Action Complete"/);
    expect(src).toMatch(/cancel: \{\s*title: "Cancel Action"/);
  });

  it("records status and audit through the canonical RPC (no privileged key)", () => {
    const rpcCallSiteCount = (src.match(/supabase\.rpc\b/g) ?? []).length;
    const rpcCalls = resolveRpcCalls(src);
    // Every call site must independently resolve its own first-argument
    // name — a dynamic/foreign call site would leave this short rather
    // than being credited with the canonical name.
    expect(rpcCalls.length).toBe(rpcCallSiteCount);
    expect(rpcCalls.map((c) => c.name)).toEqual(["action_queue_transition"]);
    expect(src).not.toMatch(/\.from\(\s*"action_queue_events"\s*\)\s*\.insert\(/);
    expect(src).not.toMatch(/service_role/i);
  });

  it("introduces no device-control surface", () => {
    expect(src).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
  });
});
