#!/usr/bin/env node
/**
 * introspect-money-contract-effect — is the money contract still IN EFFECT,
 * or did something overwrite it after it was applied?
 *
 * WHY THIS EXISTS
 *
 * migration-drift-probe.yml and money-migration-drift-alert.yml both answer
 * "did this migration RUN?" by reading supabase_migrations.schema_migrations.
 * Neither can answer "is what it did still true?". Those are different
 * questions, and in this repo the gap is not theoretical:
 * 20260727050000_ai_credit_service_contract_forward_reassert.sql exists
 * precisely BECAUSE a later immutable export reintroduced earlier function
 * bodies over a contract that had already been applied. schema_migrations
 * would have reported that migration applied the whole time.
 *
 * So this reads the live catalog and reports what is actually there.
 *
 * DELIBERATELY AN INTROSPECTION, NOT A GATE
 *
 * It reports; it does not fail on a mismatch. Asserting an exact expected
 * shape before anyone has seen production would encode a guess as a gate --
 * and a money gate that is confidently wrong is worse than no gate. The
 * `comparison` block states what the migration asserts next to what the
 * database has, so the assertions for a future gate can be written from
 * observed fact instead of assumption.
 *
 * It still exits non-zero when it could not look, because "I could not check"
 * must never be mistaken for "nothing is wrong".
 *
 * THE OVERLOAD TRAP
 *
 * It enumerates EVERY function with the target NAMES, not just the signatures
 * the migration pins. The documented failure mode is an export reintroducing
 * an EARLIER OVERLOAD; a probe that only looked at the pinned signature would
 * report it healthy while a second, laxer overload sat beside it.
 *
 * READ-ONLY BY CONSTRUCTION
 *
 * default_transaction_read_only=on, one SELECT, no writes.
 *
 * USAGE
 *   SUPABASE_DB_URL='postgresql://...' node scripts/introspect-money-contract-effect.mjs
 *   node scripts/introspect-money-contract-effect.mjs --json
 *
 * EXIT CODES
 *   0  introspection completed and reported
 *   2  could not introspect (no URL, psql missing, query failed, manifest
 *      unparseable) -- nothing was observed
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { redactDbUrl } from "./lib/redactDbUrl.mjs";
import {
  parseContractSql,
  buildIntrospectionSql,
  compare,
} from "./lib/moneyContractEffectManifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The contract source. Its own SQL is the manifest -- the target objects are
 * derived from it rather than restated here, so this cannot drift from the
 * migration it verifies.
 */
const CONTRACT_MIGRATION = join(
  ROOT,
  "supabase",
  "migrations",
  "20260727050000_ai_credit_service_contract_forward_reassert.sql",
);

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const urlFlagIndex = args.indexOf("--url");
const dbUrl =
  (urlFlagIndex !== -1 ? args[urlFlagIndex + 1] : undefined) ??
  process.env.SUPABASE_DB_URL ??
  process.env.SUPABASE_DB_URL_LIVE ??
  process.env.DATABASE_URL;
const outPath = process.env.INTROSPECTION_PATH ?? "";

const say = (line) => console.log(redactDbUrl(line, dbUrl));
const warn = (line) => console.error(redactDbUrl(line, dbUrl));

function bail(message, detail) {
  const payload = {
    status: "could_not_introspect",
    message: redactDbUrl(message, dbUrl),
    detail: redactDbUrl(detail, dbUrl),
  };
  if (asJson) say(JSON.stringify(payload, null, 2));
  else {
    warn(`[money-contract-effect] COULD NOT INTROSPECT — ${message}`);
    if (detail) warn(`  ${detail}`);
    warn("  Nothing was observed. This is NOT a clean result.");
  }
  writeOut(payload);
  process.exit(2);
}

function writeOut(payload) {
  if (!outPath) return;
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  } catch (err) {
    warn(`(warning) could not write ${outPath}: ${err.message}`);
  }
}

/** Reads and parses the contract, exiting via bail() if it finds nothing. */
function loadContract() {
  if (!existsSync(CONTRACT_MIGRATION)) {
    bail(`contract migration not found: ${CONTRACT_MIGRATION}`);
  }
  const sql = readFileSync(CONTRACT_MIGRATION, "utf8");
  const parsed = parseContractSql(sql);
  if (parsed.function_names.length === 0) {
    bail(
      "parsed zero functions out of the contract migration",
      "the manifest parser matched nothing, so any report would be vacuous. Fix the parser before trusting this tool.",
    );
  }
  return {
    source: "supabase/migrations/20260727050000_ai_credit_service_contract_forward_reassert.sql",
    ...parsed,
  };
}

function introspect(url, contract) {
  let sql;
  try {
    sql = buildIntrospectionSql(contract);
  } catch (err) {
    bail("refused to build the introspection query", err.message);
  }
  try {
    return execFileSync("psql", [url, "-tAc", sql], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      // Belt-and-braces: the session cannot write regardless of this script.
      env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" },
      // The checker this workflow was built alongside had NO timeout, and a
      // stalled connection could block a job until the runner's own default
      // cancelled it -- taking any always() reporting step down with it. Never
      // repeat that here.
      timeout: 120_000,
    });
  } catch (error) {
    const stderr = (error && error.stderr) || "";
    if (error && error.code === "ENOENT") {
      bail("psql is not installed or not on PATH", "install the postgresql-client package");
    }
    if (error && error.signal) {
      bail("psql timed out", `killed by ${error.signal} after 120s; the database did not answer`);
    }
    bail("introspection query failed", (stderr || String(error)).trim().slice(0, 400));
  }
}

function main() {
  if (!dbUrl) {
    bail(
      "no database URL",
      "set SUPABASE_DB_URL (or pass --url). Refusing to report without looking.",
    );
  }
  const contract = loadContract();
  const raw = introspect(dbUrl, contract);

  let observed;
  try {
    observed = JSON.parse(raw.trim());
  } catch (err) {
    bail("could not parse the introspection result", err.message);
  }

  const payload = {
    status: "introspected",
    checked_at: new Date().toISOString(),
    contract,
    observed,
    comparison: compare(contract, observed),
    caveat:
      "Reports observed state only. It does not decide pass/fail: the assertions for a gate should be written from these observations, not guessed ahead of them.",
  };

  writeOut(payload);
  if (asJson) {
    say(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  say("[money-contract-effect]");
  say(`  contract: ${contract.source}`);
  say(`  functions observed: ${observed.functions.length}`);
  say(`  tables observed:    ${observed.tables.length}`);
  say("");
  for (const n of payload.comparison) {
    say(`  ${n.object}`);
    say(`    ${n.observation}: ${n.detail}`);
    if (n.intended_by_migration)
      say(`    migration intends EXECUTE for: ${n.intended_by_migration}`);
    if (n.security_definer !== undefined)
      say(`    security definer: ${n.security_definer}   search_path: ${n.search_path}`);
    if (n.signatures) for (const s of n.signatures) say(`      - ${s}`);
  }
  say("");
  say("  Observation only — no pass/fail asserted. See the caveat in the JSON output.");
  process.exit(0);
}

try {
  main();
} catch (error) {
  // An uncaught throw would print a raw stack straight to stderr, bypassing
  // the redaction above.
  bail("unexpected failure", String((error && error.stack) || error));
}
