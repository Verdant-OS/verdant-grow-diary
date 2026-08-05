/**
 * Static safety tests for the action_queue_events audit trail.
 *
 * Asserts:
 *   - Migration creates public.action_queue_events with required columns,
 *     CHECK on event_type, RLS enabled, and owner-locked policies that
 *     also verify the referenced action_queue and grow belong to auth.uid().
 *   - ActionQueue.tsx uses the transactional owner-scoped RPC for every
 *     decision and never sends equipment commands.
 *   - No service_role / device-control surface introduced anywhere new.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");

function allMigrations(): string {
  const dir = resolve(ROOT, "supabase/migrations");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .join("\n\n");
}
const MIG = allMigrations();

function aqeMigration(): string {
  const dir = resolve(ROOT, "supabase/migrations");
  return (
    readdirSync(dir)
      .filter((n) => n.endsWith(".sql"))
      .map((n) => readFileSync(join(dir, n), "utf8"))
      .find((sql) => /CREATE\s+TABLE\s+public\.action_queue_events/i.test(sql)) ?? ""
  );
}
const AQE = aqeMigration();

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

describe("action_queue_events — schema & RLS", () => {
  it("table exists with required columns", () => {
    expect(AQE).toMatch(/CREATE\s+TABLE\s+public\.action_queue_events/i);
    expect(AQE).toMatch(/user_id\s+uuid\s+NOT\s+NULL\s+DEFAULT\s+auth\.uid\(\)/i);
    expect(AQE).toMatch(
      /action_queue_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.action_queue\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
    expect(AQE).toMatch(/grow_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.grows\(id\)/i);
    expect(AQE).toMatch(/event_type\s+text\s+NOT\s+NULL/i);
    expect(AQE).toMatch(/previous_status\s+text/i);
    expect(AQE).toMatch(/new_status\s+text/i);
    expect(AQE).toMatch(/note\s+text/i);
    expect(AQE).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i);
  });

  it("CHECK constrains event_type to the allowed set", () => {
    for (const t of [
      "created",
      "simulated",
      "approved",
      "rejected",
      "completed",
      "cancelled",
      "note",
    ]) {
      expect(AQE).toMatch(new RegExp(`'${t}'`));
    }
    expect(AQE).toMatch(/event_type\s+IN\s*\(/i);
  });

  it("RLS is enabled", () => {
    expect(AQE).toMatch(
      /ALTER\s+TABLE\s+public\.action_queue_events\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("INSERT policy enforces auth.uid() = user_id + owned action + owned grow", () => {
    expect(AQE).toMatch(
      /FOR\s+INSERT[\s\S]*?WITH\s+CHECK[\s\S]*?auth\.uid\(\)\s*=\s*user_id[\s\S]*?EXISTS\s*\([\s\S]*?action_queue[\s\S]*?a\.user_id\s*=\s*auth\.uid\(\)[\s\S]*?EXISTS\s*\([\s\S]*?grows[\s\S]*?g\.user_id\s*=\s*auth\.uid\(\)/i,
    );
  });

  it("SELECT policy is owner-locked", () => {
    expect(AQE).toMatch(/FOR\s+SELECT[\s\S]*?USING\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
  });

  it("no service_role bypass in the audit migration", () => {
    expect(AQE).not.toMatch(/service_role/i);
  });

  it("no device-control surface introduced in the audit migration", () => {
    expect(AQE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
    );
  });
});

describe("ActionQueue page — audit wiring", () => {
  it("uses the transactional transition-and-audit RPC", () => {
    const rpcCallSiteCount = (PAGE.match(/supabase\.rpc\b/g) ?? []).length;
    const rpcCalls = resolveRpcCalls(PAGE);
    // Every call site must independently resolve its own first-argument
    // name and second-argument identifier — a dynamic/foreign call site
    // would leave this short rather than being credited with the
    // canonical name or rpcArgs binding.
    expect(rpcCalls.length).toBe(rpcCallSiteCount);
    expect(rpcCalls).toEqual([{ name: "action_queue_transition", argsVar: "rpcArgs" }]);
    expect(PAGE).toMatch(/parseActionQueueTransitionRpcResult\(data,\s*rpcArgs\)/);
  });

  it("transition input never sends identity or server-derived lifecycle fields", () => {
    const m = PAGE.match(
      /const\s+rpcArgs\s*=\s*buildActionQueueTransitionRpcArgs\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(
      /\buser_id\b|\bgrow_id\b|\bevent_type\b|\bnew_status\b|\btransitioned_at\b/,
    );
    expect(PAGE).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(/);
  });

  it("approve / reject / simulate each go through the transition helper (via dialog confirm)", () => {
    // approve/reject/simulate open the note dialog; confirmNoteDialog calls transition()
    expect(PAGE).toMatch(/function\s+approve[\s\S]*?openNoteDialog\(/);
    expect(PAGE).toMatch(/function\s+reject[\s\S]*?openNoteDialog\(/);
    expect(PAGE).toMatch(/function\s+simulate[\s\S]*?openNoteDialog\(/);
    expect(PAGE).toMatch(/function\s+confirmNoteDialog[\s\S]*?transition\(/);
    expect(PAGE).toMatch(/transition\(row,\s*kind,\s*note\)/);
    expect(PAGE).toMatch(/buildActionQueueTransitionRpcArgs\(\s*\{/);
    expect(PAGE).toMatch(/from "@\/lib\/actionQueueTransitions"/);
  });

  it("simulate explicitly states no device command is sent", () => {
    expect(PAGE).toMatch(/no device command sent/i);
  });

  it("approve does NOT call any device-control endpoint", () => {
    expect(PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });

  it("reports one calm failure when the atomic write does not succeed", () => {
    expect(PAGE).toMatch(
      /if \(error \|\| !result \|\| result\.ok !== true\)[\s\S]*?safeActionQueueFailureCopy\("transition"/,
    );
    expect(PAGE).not.toMatch(/Status updated, but audit log failed/i);
  });

  it("renders an event history section", () => {
    expect(PAGE).toMatch(/EventHistory/);
    expect(PAGE).toMatch(/History/);
  });
});
