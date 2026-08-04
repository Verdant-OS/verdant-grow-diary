#!/usr/bin/env node
/**
 * Automated evidence checks for the generic bridge sensor-ingest trust chain
 * (`vbt_` bearer tokens): mint -> hash at rest -> verify -> entitle -> tent
 * scope -> freshness -> persist -> audit -> revoke.
 *
 * Companion to docs/bridge-sensor-ingest-security-audit-checklist.md. Each
 * check below carries the checklist evidence id (E1, E2, ...) cited there.
 *
 * Static and offline by design: reads committed source only. No network, no
 * env, no secrets, no database. The runtime complement lives in the vitest
 * suites listed in the checklist doc (sensor-ingest-webhook-bridge-auth,
 * error-leakage, tent-bridge-tokens-page-safety, ...).
 *
 * Exit code 0 = every check passed. Exit code 1 = at least one FAIL, or a
 * trust-chain file is missing (a missing surface is a broken chain, never a
 * skip). Self-test: scripts/security/test-bridge-sensor-ingest-evidence-checks.mjs
 * proves each check fails when its protection is removed.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

export const FILES = {
  sharedAuth: "supabase/functions/_shared/sensorIngestAuth.ts",
  webhookIndex: "supabase/functions/sensor-ingest-webhook/index.ts",
  webhookAuthShim: "supabase/functions/sensor-ingest-webhook/auth.ts",
  webhookSanitize: "supabase/functions/sensor-ingest-webhook/sanitize.ts",
  mint: "supabase/functions/mint-bridge-token/index.ts",
  revoke: "supabase/functions/revoke-bridge-token/index.ts",
  freshness: "supabase/functions/_shared/sensorIngestFreshness.ts",
  entitlementGate: "supabase/functions/_shared/liveSensorEntitlementGate.ts",
  ecowittIngest: "supabase/functions/ecowitt-ingest/index.ts",
  piIngest: "supabase/functions/pi-ingest-readings/index.ts",
  staticSecretScan: "scripts/security/static-client-secret-scan.mjs",
  securityRegressionWorkflow: ".github/workflows/security-regression.yml",
  edgeTestsWorkflow: ".github/workflows/sensor-ingest-webhook-edge-tests.yml",
  packageJson: "package.json",
};

/**
 * Each check: { id, file, description, expect: [{ re, must }] }.
 * `must: true`  -> pattern must match the file content.
 * `must: false` -> pattern must NOT match the file content.
 * A check passes only when every expectation holds.
 */
export const CHECKS = [
  // --- A. Shared bearer-auth contract -----------------------------------
  {
    id: "E1",
    file: "sharedAuth",
    description: "vbt_ prefix is the canonical bridge marker",
    expect: [{ re: /export const BRIDGE_PREFIX = "vbt_"/, must: true }],
  },
  {
    id: "E2",
    file: "sharedAuth",
    description: "bridge tokens are SHA-256 hashed before lookup; never queried raw",
    expect: [
      { re: /const hash = await sha256Hex\(rawToken\)/, must: true },
      { re: /lookupBridgeToken\(hash\)/, must: true },
      { re: /lookupBridgeToken\(rawToken\)/, must: false },
    ],
  },
  {
    id: "E3",
    file: "sharedAuth",
    description: "revoked tokens are rejected",
    expect: [{ re: /revoked_at\)\s*return \{ ok: false, error: "token_revoked" \}/, must: true }],
  },
  {
    id: "E4",
    file: "sharedAuth",
    description: "expired tokens are rejected against the injected request clock",
    expect: [
      { re: /new Date\(data\.expires_at\)\.getTime\(\) <= now\(\)/, must: true },
      { re: /error: "token_expired"/, must: true },
    ],
  },
  {
    id: "E5",
    file: "sharedAuth",
    description: "short/garbage vbt_ bearers are rejected before any DB lookup",
    expect: [{ re: /rawToken\.length < BRIDGE_PREFIX\.length \+ 16/, must: true }],
  },
  {
    id: "E6",
    file: "sharedAuth",
    description: "allowJwt=false surfaces bridge_required (no silent JWT fallback)",
    expect: [
      { re: /allowJwt === false/, must: true },
      { re: /error: "bridge_required"/, must: true },
    ],
  },

  // --- B. Webhook binding ------------------------------------------------
  {
    id: "E7",
    file: "webhookIndex",
    description: "sensor-ingest-webhook is bridge-only: allowJwt disabled",
    expect: [{ re: /allowJwt:\s*false/, must: true }],
  },
  {
    id: "E8",
    file: "webhookIndex",
    description: "defense-in-depth kind narrowing rejects any non-bridge auth",
    expect: [{ re: /auth\.kind !== "bridge"/, must: true }],
  },
  {
    id: "E9",
    file: "webhookIndex",
    description: "webhook never resolves user-JWT claims (stubbed to null sub)",
    expect: [{ re: /verifyJwtClaims:\s*async \(\) => \(\{ sub: null \}\)/, must: true }],
  },
  {
    id: "E10",
    file: "webhookIndex",
    description: "entitlement is re-checked on every token use (not only at mint)",
    expect: [{ re: /requireLiveSensorEntitlement\(/, must: true }],
  },
  {
    id: "E11",
    file: "webhookIndex",
    description: "tent scope is enforced; cross-tent payloads get forbidden_tent",
    expect: [
      { re: /tentScopeMatches\(auth, payloadTentId\)/, must: true },
      { re: /error: "forbidden_tent"/, must: true },
    ],
  },
  {
    id: "E12",
    file: "webhookIndex",
    description: "ownership is server-stamped; caller-supplied user_id is never read",
    expect: [
      { re: /user_id: auth\.userId/, must: true },
      { re: /body\.user_id|payload\.user_id/, must: false },
    ],
  },
  {
    id: "E13",
    file: "webhookIndex",
    description: "stale timestamps fail closed before persistence (server clock)",
    expect: [
      {
        re: /classifyIngestTimestampFreshness\(capturedAt, \{ now: requestNow \}\) === "stale"/,
        must: true,
      },
      { re: /accepted: false/, must: true },
    ],
  },
  {
    id: "E14",
    file: "webhookIndex",
    description: "every response body flows through the sanitizer",
    expect: [{ re: /sanitizeForResponse\(body\)/, must: true }],
  },
  {
    id: "E15",
    file: "webhookAuthShim",
    description: "webhook auth shim is a pure re-export of the shared twin (no drift)",
    expect: [{ re: /export \* from "\.\.\/_shared\/sensorIngestAuth\.ts";/, must: true }],
    custom: (content) => {
      const executable = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("//"));
      return executable.length === 1 &&
        executable[0] === 'export * from "../_shared/sensorIngestAuth.ts";'
        ? []
        : ["shim contains executable code beyond the single shared re-export"];
    },
  },
  {
    id: "E16",
    file: "webhookSanitize",
    description: "sanitizer treats vbt_-shaped strings as secrets",
    expect: [{ re: /\^vbt_/, must: true }],
  },

  // --- C. Mint -----------------------------------------------------------
  {
    id: "E17",
    file: "mint",
    description: "mint requires a verified Supabase session JWT",
    expect: [
      { re: /auth\.getClaims\(token\)/, must: true },
      { re: /claims\?\.sub\b/, must: true },
    ],
  },
  {
    id: "E18",
    file: "mint",
    description: "mint enforces the server-authoritative live-sensor entitlement gate",
    expect: [{ re: /requireLiveSensorEntitlement\(/, must: true }],
  },
  {
    id: "E19",
    file: "mint",
    description: "mint verifies tent ownership before issuing a tent-scoped token",
    expect: [
      { re: /from\("tents"\)/, must: true },
      { re: /tentRow\.user_id !== userId/, must: true },
      { re: /error: "forbidden_tent"/, must: true },
    ],
  },
  {
    id: "E20",
    file: "mint",
    description: "only the SHA-256 hash and a short non-secret prefix are stored",
    expect: [
      { re: /token_hash: tokenHash/, must: true },
      { re: /token_prefix: tokenPrefix/, must: true },
      // The insert payload must never carry the plaintext. A bare `token:`
      // key may appear only in the one-time response body, never in .insert().
      { re: /\.insert\(\{[^}]*[^\w]token:/s, must: false },
    ],
  },
  {
    id: "E21",
    file: "mint",
    description: "token entropy is 32 CSPRNG bytes",
    expect: [
      { re: /new Uint8Array\(32\)/, must: true },
      { re: /crypto\.getRandomValues\(rand\)/, must: true },
    ],
  },
  {
    id: "E22",
    file: "mint",
    description: "displayed prefix is capped at 12 chars (vbt_ + 8, non-secret)",
    expect: [{ re: /plaintext\.slice\(0, 12\)/, must: true }],
  },
  {
    id: "E23",
    file: "mint",
    description: "TTL is clamped (1 hour minimum, 365 days maximum)",
    expect: [
      { re: /MIN_TTL_HOURS = 1/, must: true },
      { re: /MAX_TTL_DAYS = 365/, must: true },
    ],
  },

  // --- D. Revoke ---------------------------------------------------------
  {
    id: "E24",
    file: "revoke",
    description: "revocation is owner-scoped and uses the caller's JWT (RLS), not service role",
    expect: [
      { re: /\.eq\("user_id", userId\)/, must: true },
      { re: /revoked_at/, must: true },
      { re: /SUPABASE_ANON_KEY/, must: true },
      { re: /SERVICE_ROLE/, must: false },
    ],
  },

  // --- E. Freshness canon -----------------------------------------------
  {
    id: "E25",
    file: "freshness",
    description:
      "server ingest freshness window is pinned at 30 minutes; changing it must update the checklist doc in the same PR",
    expect: [{ re: /LIVE_INGEST_FRESHNESS_WINDOW_MS = 30 \* 60 \* 1000/, must: true }],
  },

  // --- F. Sibling isolation ---------------------------------------------
  {
    id: "E32",
    file: "ecowittIngest",
    description:
      "ecowitt-ingest is the second sanctioned vbt_ consumer: same shared resolver, bridge-only",
    expect: [
      { re: /authenticateBearer/, must: true },
      { re: /allowJwt:\s*false/, must: true },
    ],
  },
  {
    id: "E33",
    file: "piIngest",
    description:
      "pi-ingest-readings stays HMAC-only: it never reads bearer Authorization and never accepts vbt_",
    expect: [
      { re: /authenticateBearer/, must: false },
      { re: /vbt_/, must: false },
      { re: /headers\.get\(\s*["']Authorization["']/i, must: false },
    ],
  },

  // --- H. Client-boundary meta-checks -----------------------------------
  {
    id: "E26",
    file: "staticSecretScan",
    description: "client secret scanner still forbids bridge-token identifiers in src/public/dist",
    expect: [
      { re: /VERDANT_BRIDGE_TOKEN/, must: true },
      { re: /\\bBRIDGE_TOKEN\\b/, must: true },
    ],
  },

  // --- I. CI self-wiring -------------------------------------------------
  {
    id: "E27",
    file: "securityRegressionWorkflow",
    description: "this evidence lane is an active run step in the Security regression workflow",
    // Anchored as a live YAML `run:` line: a commented-out `# run: ...`
    // would not satisfy this, so the lane cannot be soft-disabled in place.
    expect: [{ re: /^\s*run:\s*bun run test:bridge-sensor-ingest-evidence\s*$/m, must: true }],
  },
  {
    id: "E28",
    file: "packageJson",
    description: "package.json defines the evidence lane (self-test first, then checks)",
    expect: [
      {
        re: /"test:bridge-sensor-ingest-evidence":\s*"node scripts\/security\/test-bridge-sensor-ingest-evidence-checks\.mjs && node scripts\/security\/bridge-sensor-ingest-evidence-checks\.mjs"/,
        must: true,
      },
    ],
  },
  {
    id: "E36",
    file: "edgeTestsWorkflow",
    description:
      "mint and revoke handler e2e tests are ACTIVE in the Deno edge-test lane: live run-list arguments plus live path filters in both push and pull_request",
    expect: [],
    // Anchored as active lines (a commented-out `# supabase/...` or
    // `# - "supabase/..."` never satisfies these), and each trigger section
    // is validated independently — a filter duplicated twice under one
    // event must NOT satisfy the other event's wiring.
    custom: (content) => {
      const failures = [];
      // Normalize CRLF so the $-anchored active-line patterns behave
      // identically on Windows working trees and Linux CI checkouts.
      const text = content.replace(/\r\n/g, "\n");
      const sections = { push: [], pull_request: [] };
      let current = null;
      for (const line of text.split("\n")) {
        const head = line.match(/^ {2}(push|pull_request):\s*$/);
        if (head) {
          current = head[1];
          continue;
        }
        if (/^\S/.test(line) || /^ {2}\S/.test(line)) {
          current = null;
          continue;
        }
        if (current) sections[current].push(line);
      }
      for (const fn of ["mint-bridge-token", "revoke-bridge-token"]) {
        const runLine = new RegExp(
          String.raw`^\s*supabase/functions/${fn}/handler_e2e_test\.ts \\$`,
          "m",
        );
        if (!runLine.test(text)) {
          failures.push(`${fn} e2e is not an active argument in the deno run list`);
        }
        const filterLine = new RegExp(String.raw`^\s*- "supabase/functions/${fn}/\*\*"$`, "m");
        for (const event of ["push", "pull_request"]) {
          if (!filterLine.test(sections[event].join("\n"))) {
            failures.push(`${fn} path filter is not active under ${event}.paths`);
          }
        }
      }
      return failures;
    },
  },
  {
    id: "E37",
    file: "packageJson",
    description:
      "the bridge_tokens runtime RLS harness is defined and chained into test:security-db-local",
    expect: [
      {
        re: /"test:bridge-tokens-db-security":\s*"node scripts\/security\/run-bridge-tokens-db-security\.mjs"/,
        must: true,
      },
      { re: /"test:security-db-local":\s*"[^"]*test:bridge-tokens-db-security[^"]*"/, must: true },
    ],
  },
];

/**
 * Migration checks scan every file under supabase/migrations that mentions
 * bridge_tokens, in aggregate. Concatenated text alone cannot prove the
 * *effective* final state (a later migration could undo an earlier one), so
 * every "protection present" check is paired with a forbidden-regression
 * tripwire for the statement that would undo it (DISABLE ROW LEVEL SECURITY,
 * a re-GRANT, a PUBLIC/anon policy). Full effective-state proof belongs to
 * the runtime bridge_tokens RLS harness tracked as checklist gap G3.
 */
export const MIGRATION_CHECKS = [
  {
    id: "E29",
    description: "bridge_tokens has RLS enabled and no migration ever disables it",
    expect: [
      {
        re: /ALTER TABLE (?:public\.)?bridge_tokens ENABLE ROW LEVEL SECURITY/i,
        must: true,
      },
      { re: /(?:public\.)?bridge_tokens\s+DISABLE ROW LEVEL SECURITY/i, must: false },
    ],
  },
  {
    id: "E30",
    description:
      "every bridge_tokens policy (created or altered) grants only authenticated; no grant reaches anon or PUBLIC",
    expect: [
      {
        re: /GRANT[^;]{0,200}ON (?:TABLE )?(?:public\.)?bridge_tokens[^;]{0,200}\bTO[^;]{0,200}\b(anon|PUBLIC)\b/is,
        must: false,
      },
    ],
    // Role lists are parsed in full for both CREATE POLICY and role-changing
    // ALTER POLICY statements, after SQL comments are stripped so commented
    // history never classifies as active SQL. The declared role list must be
    // exactly `authenticated` — one role, no additions in any order (`TO
    // authenticated, anon`, `TO anon, authenticated`, `TO authenticated,
    // service_role` all fail), and a CREATE POLICY with no TO clause fails
    // because it defaults to PUBLIC (which includes anon). An ALTER POLICY
    // without a TO clause leaves roles unchanged, and `RENAME TO` is not a
    // role list.
    custom: (corpus) => {
      const failures = [];
      const policyStatements = stripSqlComments(corpus)
        .split(";")
        .map((s) => s.trim())
        .filter(
          (s) =>
            /\b(?:CREATE|ALTER)\s+POLICY\b/i.test(s) &&
            /\bON\s+(?:public\.)?bridge_tokens\b/i.test(s),
        );
      if (!policyStatements.some((s) => /\bCREATE\s+POLICY\b/i.test(s))) {
        failures.push("no bridge_tokens CREATE POLICY statements found");
      }
      for (const raw of policyStatements) {
        const label = raw.replace(/\s+/g, " ").slice(0, 70);
        const stmt = raw.replace(/\bRENAME\s+TO\s+(?:"[^"]+"|\w+)/gi, "");
        const toClause = stmt.match(/\bTO\s+([\w",\s]+?)(?=\s+(?:FOR|USING|WITH)\b|$)/i);
        const isCreate = /\bCREATE\s+POLICY\b/i.test(stmt);
        if (!toClause) {
          if (isCreate) {
            failures.push(`policy lacks explicit TO clause (defaults to PUBLIC): ${label}`);
          }
          continue;
        }
        const roles = toClause[1]
          .split(",")
          .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())
          .filter((r) => r.length > 0);
        if (roles.length !== 1 || roles[0] !== "authenticated") {
          failures.push(
            `policy role list must be exactly [authenticated], found [${roles.join(", ")}]: ${label}`,
          );
        }
      }
      return failures;
    },
  },
  {
    id: "E31",
    description: "bridge_tokens stores token_hash (and never a plaintext token column)",
    expect: [
      { re: /token_hash/i, must: true },
      { re: /^\s*token\s+text\b/im, must: false },
    ],
  },
  {
    id: "E34",
    description:
      "bump_bridge_token_usage (SECURITY DEFINER) is locked to service_role and never re-granted",
    expect: [
      {
        re: /REVOKE EXECUTE ON FUNCTION public\.bump_bridge_token_usage\(UUID, INTEGER\) FROM PUBLIC, anon, authenticated;/,
        must: true,
      },
      {
        re: /GRANT EXECUTE ON FUNCTION public\.bump_bridge_token_usage[^;]*\bTO[^;]*\b(PUBLIC|anon|authenticated)\b/i,
        must: false,
      },
    ],
  },
  {
    id: "E35",
    description:
      "revocation is one-way, telemetry is server-maintained on BOTH insert and update paths, and client rows are born unrevoked (guard triggers)",
    expect: [
      { re: /RAISE EXCEPTION 'bridge_token revocation is one-way'/, must: true },
      { re: /RAISE EXCEPTION 'bridge_token rows must be created unrevoked'/, must: true },
    ],
    // The telemetry guard must exist on the UPDATE path AND the INSERT
    // path — one occurrence means a whole write path is unprotected.
    custom: (corpus) => {
      const n = (
        stripSqlComments(corpus).match(
          /RAISE EXCEPTION 'bridge_token usage telemetry is server-maintained'/g,
        ) ?? []
      ).length;
      return n >= 2
        ? []
        : [`telemetry guard must exist on both UPDATE and INSERT paths (found ${n})`];
    },
  },
];

/**
 * Deterministic comment strip for migration classification: removes block
 * comments, then `--` line comments. Deliberately NOT a SQL parser — string
 * literals containing comment markers do not occur in this corpus, and the
 * G3 runtime harness remains the effective-state authority.
 */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

export function readRepoFile(rel) {
  const p = resolve(REPO_ROOT, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

export function bridgeMigrationCorpus(root = REPO_ROOT) {
  const dir = resolve(root, "supabase/migrations");
  if (!existsSync(dir)) return { files: [], corpus: "" };
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, content: readFileSync(join(dir, f), "utf8") }))
    // Singular form deliberately included: the bump_bridge_token_usage
    // grant-lockdown migration never writes the plural table name.
    .filter((f) => /bridge_token/i.test(f.content));
  return { files: files.map((f) => f.name), corpus: files.map((f) => f.content).join("\n") };
}

export function runExpectations(content, expectations) {
  const failures = [];
  for (const ex of expectations) {
    const matched = ex.re.test(content);
    if (ex.must && !matched) failures.push(`missing required pattern ${ex.re}`);
    if (!ex.must && matched) failures.push(`forbidden pattern present ${ex.re}`);
  }
  return failures;
}

export function runAllChecks({ readFile = readRepoFile, migrations = bridgeMigrationCorpus } = {}) {
  const results = [];

  for (const check of CHECKS) {
    const rel = FILES[check.file];
    const content = readFile(rel);
    if (content === null) {
      results.push({
        id: check.id,
        ok: false,
        detail: `${rel}: file missing (trust-chain surface gone)`,
      });
      continue;
    }
    const failures = runExpectations(content, check.expect);
    if (check.custom) failures.push(...check.custom(content));
    results.push({
      id: check.id,
      ok: failures.length === 0,
      detail:
        failures.length === 0 ? `${rel}: ${check.description}` : `${rel}: ${failures.join("; ")}`,
    });
  }

  const { files, corpus } = migrations();
  for (const check of MIGRATION_CHECKS) {
    if (files.length === 0) {
      results.push({ id: check.id, ok: false, detail: "no migration mentions bridge_tokens" });
      continue;
    }
    // Comments are stripped for every migration expectation: a commented-out
    // protection must not satisfy a must-pattern, and a commented-out
    // regression must not false-trip a forbidden one.
    const failures = runExpectations(stripSqlComments(corpus), check.expect);
    if (check.custom) failures.push(...check.custom(corpus));
    results.push({
      id: check.id,
      ok: failures.length === 0,
      detail:
        failures.length === 0
          ? `${files.length} bridge_tokens migration(s): ${check.description}`
          : `bridge_tokens migrations: ${failures.join("; ")}`,
    });
  }

  return results;
}

function main() {
  const results = runAllChecks();
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id} ${r.detail}`);
    if (!r.ok) failed += 1;
  }

  console.log(
    `bridge-sensor-ingest evidence: ${results.length - failed}/${results.length} checks passed`,
  );
  if (failed > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
