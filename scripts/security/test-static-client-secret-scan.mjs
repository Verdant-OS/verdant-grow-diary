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
  isServerOnlySourcePath,
} from "./static-client-secret-scan.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

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
  const hits = findOffending(`const k = process.env.SUPABASE_SERVICE_ROLE_KEY;`);
  assert.ok(hits.includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("flags bare service_role identifier", () => {
  const hits = findOffending(`if (role === service_role) {}`);
  assert.ok(hits.includes("service_role"));
});

t("flags Paddle notification set secret shape", () => {
  const hits = findOffending(`const x = { s: cfg.pdl_ntfset_abc123def };`);
  assert.ok(hits.includes("paddle_ntfset_secret"));
});

t("flags sk_live_ literal", () => {
  const hits = findOffending(`const s = other.sk_live_abcdef1234;`);
  assert.ok(hits.includes("stripe_live_secret"));
});

t("flags Bearer ${process.env template usage", () => {
  const hits = findOffending("const h = { Authorization: `Bearer ${process.env.X}` };", {
    scrub: false,
  });
  assert.ok(hits.includes("bearer_env_template"));
});

t("flags console.log of authorization header", () => {
  const hits = findOffending(`console.log(req.headers.authorization);`);
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

t("permits denylist text after a quote-containing regex literal", () => {
  const src = String.raw`const r = /[^\s",}]+/gi; const copy = "VERDANT_BRIDGE_TOKEN";`;
  assert.deepEqual(findOffending(src), []);
});

t("permits denylist text after a quote character class", () => {
  const src = String.raw`const r = /[",\n\r]/; const copy = "service_role";`;
  assert.deepEqual(findOffending(src), []);
});

t("permits URL-shaped and denylist regex literals", () => {
  const src = String.raw`const url = /https?:\/\//; const rules = [/service_role/i]; const copy = "VERDANT_BRIDGE_TOKEN";`;
  assert.deepEqual(findOffending(src), []);
});

t("flags executable secrets after comment-like string literals", () => {
  const src = `const copy = "// not a comment"; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;`;
  assert.ok(findOffending(src).includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("flags executable secrets after URL-shaped regex literals", () => {
  const src = String.raw`const url = /https?:\/\//; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;`;
  assert.ok(findOffending(src).includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("flags executable identifiers after quote-containing regex literals", () => {
  const src = String.raw`const r = /[^\s",}]+/gi; if (role === service_role) {}`;
  assert.ok(findOffending(src).includes("service_role"));
});

t("flags executable secrets used as a divisor after a string literal", () => {
  const src = `const ratio = "1" / SUPABASE_SERVICE_ROLE_KEY;`;
  assert.ok(findOffending(src).includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("flags executable secrets used as a divisor after a template literal", () => {
  const src = "const ratio = `1` / SUPABASE_SERVICE_ROLE_KEY;";
  assert.ok(findOffending(src).includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("flags executable secrets used as a divisor after a regex literal", () => {
  const src = `const ratio = /x/ / SUPABASE_SERVICE_ROLE_KEY;`;
  assert.ok(findOffending(src).includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("flags executable secrets after postfix increment and decrement", () => {
  assert.ok(
    findOffending(`const ratio = value++ / SUPABASE_SERVICE_ROLE_KEY;`).includes(
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  );
  assert.ok(findOffending(`const ratio = value-- / service_role;`).includes("service_role"));
});

t("flags executable secrets after a TypeScript non-null assertion", () => {
  const src = `const ratio = value! / SUPABASE_SERVICE_ROLE_KEY;`;
  assert.ok(findOffending(src).includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("preserves UTF-16 offsets when literals follow emoji", () => {
  const harmless = `const icon = "🌱"; const copy = "VERDANT_BRIDGE_TOKEN";`;
  assert.deepEqual(findOffending(harmless), []);

  const executable = `const icon = "🌱"; const key = SUPABASE_SERVICE_ROLE_KEY;`;
  assert.ok(findOffending(executable).includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("permits denylist copy in JSX text", () => {
  const src = `const page = <p>Set VERDANT_BRIDGE_TOKEN at https://example.test</p>;`;
  assert.deepEqual(findOffending(src, { filePath: "scan.tsx" }), []);
});

t("flags executable secrets inside template interpolation", () => {
  const src = "const value = `prefix ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;";
  assert.ok(findOffending(src).includes("SUPABASE_SERVICE_ROLE_KEY"));
});

t("fails closed when source parsing is malformed", () => {
  const src = `const broken = "service_role; const key = SUPABASE_SERVICE_ROLE_KEY;`;
  assert.ok(findOffending(src).includes("SUPABASE_SERVICE_ROLE_KEY"));
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
    assert.ok(p.startsWith("scripts/"), `allowlist entry not under scripts/: ${p}`);
  }
});

t("excludes only server-named source modules from the client scan", () => {
  assert.equal(isServerOnlySourcePath("src/integrations/supabase/client.server.ts"), true);
  assert.equal(isServerOnlySourcePath("src/integrations/supabase/client.ts"), false);
  assert.equal(isServerOnlySourcePath("public/client.server.ts"), false);
  assert.equal(isServerOnlySourcePath("dist/client.server.js"), false);
  assert.equal(isServerOnlySourcePath("src/server/client.ts"), false);
});

t("real repo scan passes", () => {
  const violations = scanRepo(process.cwd());
  if (violations.length > 0) {
    throw new Error(
      "unexpected violations: " + violations.map((v) => `${v.file}:${v.hits.join(",")}`).join("; "),
    );
  }
});

t("direct CLI execution runs the repository scan", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(process.cwd(), "scripts/security/static-client-secret-scan.mjs")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Static client\/published secret-scan OK\./);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${"passed"}.`);
