#!/usr/bin/env node
/**
 * Dependency-free, secret-free preflight for the authenticated One-Tent lane.
 * It validates only the public Supabase URL against the pinned project ref and
 * never prints either raw value.
 */

import { resolveExactSupabaseProjectOrigin } from "./managed-session-materialize-core.mjs";

const targetProjectRef = (process.env.LOVABLE_E2E_TARGET_PROJECT_REF ?? "").trim();
const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "").trim();

if (!targetProjectRef) {
  console.error("one_tent_supabase_target=blocked:missing_target_project_ref");
  process.exit(2);
}

if (!resolveExactSupabaseProjectOrigin({ supabaseUrl, targetProjectRef })) {
  console.error("one_tent_supabase_target=blocked:target_project_mismatch");
  process.exit(2);
}

console.log("one_tent_supabase_target=verified");
