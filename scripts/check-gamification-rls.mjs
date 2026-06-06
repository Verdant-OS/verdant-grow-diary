#!/usr/bin/env node
/**
 * Gamification RLS verification (read-only).
 *
 * Verifies the post-drop-policy invariants for nug_events / unlocks /
 * user_quests and the award_nugs SECURITY DEFINER RPC.
 *
 * Required env: SUPABASE_DB_URL (Postgres connection string).
 * Read-only: runs only SELECT against pg_catalog. Does not print secrets.
 *
 * Exit:
 *   0  — all checks pass
 *   1  — at least one check failed
 *   2  — required env missing (treated as failure in CI)
 */
import { execFileSync } from "node:child_process";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("missing SUPABASE_DB_URL");
  process.exit(2);
}

function psql(sql) {
  const out = execFileSync(
    "psql",
    [DB_URL, "-X", "-A", "-t", "-F", "\u0001", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return out
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => l.split("\u0001"));
}

const checks = [];
function expect(name, ok, detail) {
  checks.push({ name, ok, detail });
}

// 1. INSERT policies absent on the three tables.
const policyRows = psql(
  "SELECT tablename, cmd, policyname FROM pg_policies " +
    "WHERE schemaname='public' AND tablename IN ('nug_events','unlocks','user_quests') " +
    "ORDER BY tablename, cmd, policyname;",
);
const inserts = policyRows.filter((r) => r[1] === "INSERT");
expect(
  "no INSERT policy on nug_events",
  !inserts.some((r) => r[0] === "nug_events"),
);
expect(
  "no INSERT policy on unlocks",
  !inserts.some((r) => r[0] === "unlocks"),
);
expect(
  "no INSERT policy on user_quests",
  !inserts.some((r) => r[0] === "user_quests"),
);

// 2. Expected SELECT policies still present.
const expectedSelect = {
  nug_events: "Users view own events",
  unlocks: "Users view own unlocks",
  user_quests: "Users view own quests",
};
for (const [table, policy] of Object.entries(expectedSelect)) {
  const found = policyRows.some(
    (r) => r[0] === table && r[1] === "SELECT" && r[2] === policy,
  );
  expect(`SELECT policy "${policy}" present on ${table}`, found);
}

// 3. award_nugs(text, integer, jsonb, text) exists.
const funcRows = psql(
  "SELECT pg_get_function_identity_arguments(p.oid) " +
    "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace " +
    "WHERE n.nspname='public' AND p.proname='award_nugs';",
);
const expectedArgs = "_kind text, _amount integer, _meta jsonb, _quest_key text";
expect(
  "award_nugs(text,integer,jsonb,text) exists",
  funcRows.some((r) => r[0] === expectedArgs),
);

// 4. EXECUTE granted to authenticated, not anon.
const grantRows = psql(
  "SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')::text, " +
    "       has_function_privilege('anon', p.oid, 'EXECUTE')::text " +
    "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace " +
    "WHERE n.nspname='public' AND p.proname='award_nugs' " +
    "  AND pg_get_function_identity_arguments(p.oid)='" +
    expectedArgs +
    "';",
);
const [authExec, anonExec] = grantRows[0] ?? ["", ""];
expect("authenticated has EXECUTE on award_nugs", authExec === "true");
expect("anon does NOT have EXECUTE on award_nugs", anonExec === "false");

// Report.
let pass = 0;
let fail = 0;
console.log("");
console.log("Gamification RLS verification");
console.log("─".repeat(60));
for (const c of checks) {
  if (c.ok) {
    pass++;
    console.log(`  ✓ ${c.name}`);
  } else {
    fail++;
    console.log(`  ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
}
console.log("─".repeat(60));
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
