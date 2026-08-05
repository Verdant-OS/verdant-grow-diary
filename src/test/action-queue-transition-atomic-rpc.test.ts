import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const EXPAND_MIGRATION_PATH = resolve(
  ROOT,
  "supabase/migrations/20260726093000_action_queue_transition_rpc.sql",
);
const CONTRACT_MIGRATION_PATH = resolve(
  ROOT,
  "supabase/migrations/20260726094000_action_queue_transition_contract.sql",
);
const EXPAND_MIGRATION = existsSync(EXPAND_MIGRATION_PATH)
  ? readFileSync(EXPAND_MIGRATION_PATH, "utf8")
  : "";
const CONTRACT_MIGRATION = existsSync(CONTRACT_MIGRATION_PATH)
  ? readFileSync(CONTRACT_MIGRATION_PATH, "utf8")
  : "";
const MIGRATION = `${EXPAND_MIGRATION}\n${CONTRACT_MIGRATION}`;
const ACTION_QUEUE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const ACTION_DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");
const RUNTIME_HARNESS = readFileSync(
  resolve(ROOT, "scripts/run-action-queue-rls-harness.ts"),
  "utf8",
);

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

describe("action_queue_transition transactional RPC", () => {
  it("separates the expand RPC from the later privilege-contract migration", () => {
    expect(EXPAND_MIGRATION).toMatch(/CREATE\s+FUNCTION\s+public\.action_queue_transition\s*\(/i);
    expect(EXPAND_MIGRATION).not.toMatch(
      /REVOKE\s+UPDATE\s*,\s*DELETE\s+ON(?:\s+TABLE)?\s+public\.action_queue/i,
    );
    expect(CONTRACT_MIGRATION).toMatch(
      /20260726093000_action_queue_transition_rpc\.sql[\s\S]*?expand\s*->\s*frontend\s*->\s*contract/i,
    );
    expect(CONTRACT_MIGRATION).toMatch(
      /REVOKE\s+UPDATE\s*,\s*DELETE\s+ON(?:\s+TABLE)?\s+public\.action_queue/i,
    );
  });

  it("is an additive security-definer RPC available only to authenticated callers", () => {
    expect(MIGRATION).toMatch(/CREATE\s+FUNCTION\s+public\.action_queue_transition\s*\(/i);
    expect(MIGRATION).toMatch(/SECURITY\s+DEFINER/i);
    expect(MIGRATION).toMatch(/SET\s+search_path\s*=\s*''/i);
    expect(MIGRATION).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.action_queue_transition[\s\S]*?FROM\s+PUBLIC/i,
    );
    expect(MIGRATION).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.action_queue_transition[\s\S]*?FROM\s+anon/i,
    );
    expect(MIGRATION).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.action_queue_transition[\s\S]*?TO\s+authenticated/i,
    );
  });

  it("locks only the authenticated grower's row before evaluating the transition", () => {
    expect(MIGRATION).toMatch(/v_uid\s+uuid\s*:=\s*auth\.uid\(\)/i);
    expect(MIGRATION).toMatch(
      /FROM\s+public\.action_queue\s+AS\s+aq[\s\S]*?aq\.id\s*=\s*p_action_queue_id[\s\S]*?aq\.user_id\s*=\s*v_uid[\s\S]*?FOR\s+UPDATE/i,
    );
    expect(MIGRATION).toContain("action_not_found");
  });

  it("enforces the shared approval-required transition graph and expected-status CAS", () => {
    expect(MIGRATION).toMatch(
      /WHEN\s+'approve'[\s\S]*?pending_approval[\s\S]*?simulated[\s\S]*?approved/i,
    );
    expect(MIGRATION).toMatch(/WHEN\s+'simulate'[\s\S]*?pending_approval[\s\S]*?simulated/i);
    expect(MIGRATION).toMatch(/WHEN\s+'reject'[\s\S]*?pending_approval[\s\S]*?rejected/i);
    expect(MIGRATION).toMatch(
      /WHEN\s+'complete'[\s\S]*?approved[\s\S]*?simulated[\s\S]*?completed/i,
    );
    expect(MIGRATION).toMatch(
      /WHEN\s+'cancel'[\s\S]*?pending_approval[\s\S]*?approved[\s\S]*?simulated[\s\S]*?cancelled/i,
    );
    expect(MIGRATION).toMatch(/v_action\.status\s+IS\s+DISTINCT\s+FROM\s+p_expected_status/i);
    expect(MIGRATION).toContain("status_conflict");
  });

  it("treats a retry as reused only when the matching immutable audit event exists", () => {
    expect(MIGRATION).toMatch(
      /v_action\.status\s*=\s*v_new_status[\s\S]*?FROM\s+public\.action_queue_events[\s\S]*?previous_status\s*=\s*p_expected_status[\s\S]*?new_status\s*=\s*v_new_status/i,
    );
    expect(MIGRATION).toMatch(/aqe\.note\s+IS\s+NOT\s+DISTINCT\s+FROM\s+v_note/i);
    expect(MIGRATION).toMatch(/'reused'\s*,\s*true/i);
  });

  it("updates lifecycle timestamps and inserts the audit event in the same function transaction", () => {
    const lockIndex = MIGRATION.search(/FOR\s+UPDATE/i);
    const timestampIndex = MIGRATION.search(/v_transitioned_at\s*:=\s*clock_timestamp\(\)/i);
    const updateIndex = MIGRATION.search(/UPDATE\s+public\.action_queue/i);
    const eventIndex = MIGRATION.search(/INSERT\s+INTO\s+public\.action_queue_events/i);
    expect(MIGRATION).toMatch(/^\s*BEGIN\s*;/im);
    expect(MIGRATION).toMatch(/^\s*COMMIT\s*;/im);
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(timestampIndex).toBeGreaterThan(lockIndex);
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(eventIndex).toBeGreaterThan(updateIndex);
    expect(MIGRATION).toMatch(/approved_at\s*=\s*CASE/i);
    expect(MIGRATION).toMatch(/rejected_at\s*=\s*CASE/i);
    expect(MIGRATION).toMatch(/completed_at\s*=\s*CASE/i);
    expect(MIGRATION).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
  });

  it("accepts no caller-supplied identity, grow, event type, status target, or timestamp", () => {
    const signature = MIGRATION.match(
      /CREATE\s+FUNCTION\s+public\.action_queue_transition\s*\(([\s\S]*?)\)\s*RETURNS/i,
    )?.[1];
    expect(signature).toBeDefined();
    expect(signature).toMatch(/p_action_queue_id\s+uuid/i);
    expect(signature).toMatch(/p_transition\s+text/i);
    expect(signature).toMatch(/p_expected_status\s+text/i);
    expect(signature).toMatch(/p_note\s+text/i);
    expect(signature).not.toMatch(/user|grow|event_type|new_status|timestamp/i);
  });

  it("makes lifecycle rows RPC-only and prevents authenticated audit deletion", () => {
    expect(MIGRATION).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+["']Users update own action_queue["']\s+ON\s+public\.action_queue/i,
    );
    expect(MIGRATION).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+["']Users delete own action_queue["']\s+ON\s+public\.action_queue/i,
    );
    expect(MIGRATION).toMatch(
      /REVOKE\s+UPDATE\s*,\s*DELETE\s+ON(?:\s+TABLE)?\s+public\.action_queue\s+FROM\s+authenticated/i,
    );
    expect(MIGRATION).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+["']Users delete own action_queue_events["']\s+ON\s+public\.action_queue_events/i,
    );
    expect(MIGRATION).toMatch(
      /REVOKE\s+UPDATE\s*,\s*DELETE\s+ON(?:\s+TABLE)?\s+public\.action_queue_events\s+FROM\s+authenticated/i,
    );
  });

  it("keeps new actions approval-required and blocks client-forged lifecycle events", () => {
    expect(MIGRATION).toMatch(
      /CREATE\s+POLICY\s+["']Users insert own action_queue["'][\s\S]*?action_queue\.status\s*=\s*'pending_approval'[\s\S]*?action_queue\.approved_at\s+IS\s+NULL[\s\S]*?action_queue\.rejected_at\s+IS\s+NULL[\s\S]*?action_queue\.completed_at\s+IS\s+NULL/i,
    );
    expect(MIGRATION).toMatch(
      /CREATE\s+POLICY\s+["']Users append own non-transition action_queue_events["'][\s\S]*?event_type\s+IN\s*\(\s*'created'\s*,\s*'note'\s*\)/i,
    );
    expect(MIGRATION).not.toMatch(
      /CREATE\s+POLICY\s+["']Users append own non-transition action_queue_events["'][\s\S]*?event_type\s+IN\s*\([^)]*(?:approved|rejected|simulated|completed|cancelled)/i,
    );
  });
});

describe.each([
  ["Action Queue list", ACTION_QUEUE],
  ["Action Queue detail", ACTION_DETAIL],
])("%s transition wiring", (_label, source) => {
  it("uses the canonical transition RPC and validates its result", () => {
    expect(source).toMatch(/const\s+rpcArgs\s*=\s*buildActionQueueTransitionRpcArgs\(/);
    const rpcCallSiteCount = (source.match(/supabase\.rpc\b/g) ?? []).length;
    const rpcCalls = resolveRpcCalls(source);
    // Every call site must independently resolve its own first-argument
    // name and second-argument identifier — a dynamic/foreign call site
    // would leave this short rather than being credited with the
    // canonical name or rpcArgs binding.
    expect(rpcCalls.length).toBe(rpcCallSiteCount);
    expect(rpcCalls).toEqual([{ name: "action_queue_transition", argsVar: "rpcArgs" }]);
    expect(source).toMatch(/parseActionQueueTransitionRpcResult\(data,\s*rpcArgs\)/);
  });

  it("does not split a transition across direct row update and event insert calls", () => {
    expect(source).not.toMatch(/\.from\(\s*["']action_queue["']\s*\)\s*\.update\(/);
    expect(source).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(/);
  });

  it("contains no privileged key or equipment-control integration", () => {
    expect(source).not.toMatch(
      /service_role|mqtt|home.?assistant|pi_bridge|webhook|\brelay\b|\bactuator\b/i,
    );
  });
});

describe("action_queue_transition runtime harness coverage", () => {
  it("exercises the RPC through a real signed-in client and reads state independently", () => {
    expect(RUNTIME_HARNESS).toMatch(/client\.auth\.signInWithPassword/);
    expect(RUNTIME_HARNESS).toMatch(/client\.rpc\(\s*["']action_queue_transition["']/);
    expect(RUNTIME_HARNESS).toMatch(
      /admin[\s\S]*?\.from\(\s*["']action_queue["']\s*\)[\s\S]*?admin[\s\S]*?\.from\(\s*["']action_queue_events["']\s*\)/,
    );
  });

  it("covers matching audit persistence, retry dedupe, CAS conflict, illegal transition, and anon denial", () => {
    expect(RUNTIME_HARNESS).toContain(
      "owner RPC atomically records approved status and matching audit event",
    );
    expect(RUNTIME_HARNESS).toContain(
      "identical owner RPC retry reuses the matching event without duplication",
    );
    expect(RUNTIME_HARNESS).toContain(
      "changed-note owner RPC retry is rejected without event reuse",
    );
    expect(RUNTIME_HARNESS).toContain(
      "stale expected-status RPC is rejected without a second event",
    );
    expect(RUNTIME_HARNESS).toContain(
      "illegal pending-to-completed RPC writes neither status nor event",
    );
    expect(RUNTIME_HARNESS).toContain("anonymous caller cannot execute action_queue_transition");
    expect(RUNTIME_HARNESS).toContain(
      "authenticated owner cannot bypass lifecycle RPC with direct status update",
    );
    expect(RUNTIME_HARNESS).toContain("authenticated owner cannot forge lifecycle audit events");
    expect(RUNTIME_HARNESS).toContain(
      "authenticated owner can append a non-empty note at the current status",
    );
    expect(RUNTIME_HARNESS).toContain("authenticated owner cannot append an empty audit note");
    expect(RUNTIME_HARNESS).toContain(
      "authenticated owner cannot append an event with mismatched grow lineage",
    );
    expect(RUNTIME_HARNESS).toContain(
      "authenticated owner cannot forge a created event outside pending approval",
    );
    expect(RUNTIME_HARNESS).toContain("authenticated owner cannot delete immutable audit events");
    expect(RUNTIME_HARNESS).toContain(
      "authenticated owner cannot delete an action and cascade its audit history",
    );
  });
});
