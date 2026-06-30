#!/usr/bin/env node
/**
 * Tests for scripts/assert-client-secret-boundary.mjs.
 */
import {
  scrubSource,
  findOffendingTerms,
  BLOCKED_TERMS,
  SCAN_ROOTS,
  EXACT_PATH_EXCEPTIONS,
  scanClientSecretBoundary,
} from "./assert-client-secret-boundary.mjs";
import assert from "node:assert/strict";

let failed = 0;
function t(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`not ok - ${name}\n  ${e.message}`);
  }
}

t("blocks bare identifier usage of SUPABASE_SERVICE_ROLE_KEY", () => {
  const src = `const k = process.env.SUPABASE_SERVICE_ROLE_KEY;`;
  assert.deepEqual(findOffendingTerms(src), ["SUPABASE_SERVICE_ROLE_KEY"]);
});

t("blocks bare identifier usage of service_role", () => {
  const src = `if (role === SERVICE_ROLE) {} const x = a.service_role;`;
  assert.deepEqual(findOffendingTerms(src), ["service_role"]);
});

t("allows string-literal denylist entries", () => {
  const src = `const DENY = ["service_role", "SUPABASE_SERVICE_ROLE_KEY"];`;
  assert.deepEqual(findOffendingTerms(src), []);
});

t("allows references inside line and block comments", () => {
  const src = `
    // No service_role usage here.
    /* SUPABASE_SERVICE_ROLE_KEY must never appear in client. */
    const x = 1;
  `;
  assert.deepEqual(findOffendingTerms(src), []);
});

t("allows references inside regex literals", () => {
  const src = `const RE = /service_role|SUPABASE_SERVICE_ROLE_KEY/i;`;
  assert.deepEqual(findOffendingTerms(src), []);
});

t("normal client files pass", () => {
  const src = `
    import { supabase } from "@/integrations/supabase/client";
    export async function load() {
      const { data } = await supabase.from("tents").select("id");
      return data;
    }
  `;
  assert.deepEqual(findOffendingTerms(src), []);
});

t("scrub helper removes comments and strings", () => {
  const scrubbed = scrubSource(`const a = "service_role"; // service_role`);
  assert.ok(!scrubbed.includes("service_role"));
});

t("scan roots are narrow and intentional", () => {
  assert.deepEqual([...SCAN_ROOTS].sort(), [
    "src/components",
    "src/hooks",
    "src/lib",
    "src/pages",
  ]);
});

t("blocked terms are exact", () => {
  assert.deepEqual([...BLOCKED_TERMS].sort(), [
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
  ]);
});

t("exact-path exceptions are a Set (not a glob)", () => {
  assert.ok(EXACT_PATH_EXCEPTIONS instanceof Set);
});

t("real repo scan passes", () => {
  const violations = scanClientSecretBoundary(process.cwd());
  if (violations.length > 0) {
    throw new Error(
      "violations: " +
        violations.map((v) => `${v.file}:${v.hits.join(",")}`).join("; "),
    );
  }
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll tests passed.`);
