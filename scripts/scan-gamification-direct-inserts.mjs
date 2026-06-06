#!/usr/bin/env node
/**
 * Static scan: forbid client-side direct inserts into gamification tables.
 *
 * Gamification writes must flow only through public.award_nugs SECURITY
 * DEFINER RPC. Authenticated INSERT policies on nug_events / unlocks /
 * user_quests have been dropped; any client-side `.from("<table>").insert(`
 * would be both unsafe (bypassing whitelist/caps if policies regress) and
 * dead (will return a permission error today).
 *
 * Scope: src/ only. Allowed locations:
 *   - SELECT helpers in src/lib/db.ts (we don't grep `.select(`)
 *   - intentional RLS deny-tests inside supabase/functions/rls-selftest/
 *
 * Usage: node scripts/scan-gamification-direct-inserts.mjs
 *   --extra <glob>    additional path to scan (repeatable)
 * Exit 0 on clean, 1 on any forbidden hit.
 */
import { execFileSync } from "node:child_process";

const TABLES = ["nug_events", "unlocks", "user_quests"];
// Match `.from("X").insert(` and `.from('X').insert(` (allow whitespace/newline).
const PATTERN = String.raw`\.from\(\s*['"](${TABLES.join("|")})['"]\s*\)\s*\.insert\(`;

const args = process.argv.slice(2);
const extra = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--extra" && args[i + 1]) {
    extra.push(args[i + 1]);
    i++;
  }
}
const roots = ["src", ...extra];

let hits = "";
try {
  hits = execFileSync(
    "rg",
    ["-nU", "--no-heading", "--color=never", PATTERN, ...roots],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (err) {
  // rg exit 1 = no matches; anything else = real error
  if (err.status === 1) hits = "";
  else {
    console.error("rg failed:", err.message);
    process.exit(2);
  }
}

const lines = hits
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

if (lines.length === 0) {
  console.log("✓ no direct client inserts into nug_events / unlocks / user_quests");
  process.exit(0);
}

console.error("✗ forbidden direct inserts into gamification tables found:");
for (const line of lines) console.error("  " + line);
console.error(
  "\nUse the public.award_nugs SECURITY DEFINER RPC instead. " +
    "These tables have no client INSERT policy.",
);
process.exit(1);
