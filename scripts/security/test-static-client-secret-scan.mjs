#!/usr/bin/env node
/**
 * Tests for scripts/security/static-client-secret-scan.mjs.
 * Uses synthetic in-memory scans (no fs writes into repo).
 */
import {
  findOffending,
  scanRepo,
  FORBIDDEN_PATTERNS,
  SCAN_ROOTS,
  EXACT_PATH_ALLOWLIST,
} from "./static-client-secret-scan.mjs";
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

t("flags SUPABASE_SERVICE_ROLE_KEY identifier", () => {
  const hits = findOffending(
    `const k = process.env.SUPABASE_SERVICE_ROLE_KEY;`,
  );
  assert.ok(hits.includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("flags bare service_role identifier", () => {
  const hits = findOffending(`if (role === service_role) {}`);
  assert.ok(hits.includes("service_role"));
});

t("flags Paddle notification set secret shape", () => {
  const hits = findOffending(
    `const x = { s: cfg.pdl_ntfset_abc123def };`,
  );
  assert.ok(hits.includes("paddle_ntfset_secret"));
});

t("flags sk_live_ literal", () => {
  const hits = findOffending(`const s = other.sk_live_abcdef1234;`);
  assert.ok(hits.includes("stripe_live_secret"));
});

t("flags Bearer ${process.env template usage", () => {
  const hits = findOffending(
    "const h = { Authorization: `Bearer ${process.env.X}` };",
    { scrub: false },
  );
  assert.ok(hits.includes("bearer_env_template"));
});

t("flags console.log of authorization header", () => {
  const hits = findOffending(
    `console.log(req.headers.authorization);`,
  );
  assert.ok(hits.includes("authorization_header_log"));
});

t("permits denylist strings in code (scrubbed)", () => {
  const src = `const DENY = ["service_role", "SUPABASE_SERVICE_ROLE_KEY"];`;
  assert.deepEqual(findOffending(src), []);
});

t("permits comments mentioning the terms", () => {
  const src = `// service_role is server-only\nconst x = 1;`;
  assert.deepEqual(findOffending(src), []);
});

t("scan roots are opt-in and limited", () => {
  assert.deepEqual([...SCAN_ROOTS].sort(), ["dist", "public", "src"]);
});

t("forbidden pattern list covers required categories", () => {
  const names = FORBIDDEN_PATTERNS.map((p) => p.name);
  for (const required of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
    "PADDLE_WEBHOOK_SECRET",
    "STRIPE_SECRET_KEY",
    "BRIDGE_TOKEN_ENV",
    "stripe_live_secret",
    "stripe_test_secret",
    "authorization_header_log",
  ]) {
    assert.ok(names.includes(required), `missing pattern ${required}`);
  }
});

t("allowlist contains only scanner infra", () => {
  for (const p of EXACT_PATH_ALLOWLIST) {
    assert.ok(
      p.startsWith("scripts/"),
      `allowlist entry not under scripts/: ${p}`,
    );
  }
});

t("real repo scan passes", () => {
  const violations = scanRepo(process.cwd());
  if (violations.length > 0) {
    throw new Error(
      "unexpected violations: " +
        violations
          .map((v) => `${v.file}:${v.hits.join(",")}`)
          .join("; "),
    );
  }
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${"passed"}.`);
