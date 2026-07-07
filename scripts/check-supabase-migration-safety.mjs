#!/usr/bin/env node
/**
 * check-supabase-migration-safety
 *
 * Static, read-only guardrail that fails CI when a NEW high-risk pattern
 * appears in supabase/migrations/*.sql. Accepted historical findings are
 * pinned in config/supabase-migration-safety-baseline.json — any finding
 * whose fingerprint is not in the baseline fails the build.
 *
 * High-risk patterns:
 *   1. SEARCH_PATH_MUTABLE
 *      SECURITY DEFINER function without a `SET search_path` clause in the
 *      same CREATE FUNCTION statement.
 *   2. PERMISSIVE_POLICY
 *      CREATE POLICY for INSERT/UPDATE/DELETE with `USING (true)` or
 *      `WITH CHECK (true)`.
 *   3. TABLE_WITHOUT_RLS
 *      CREATE TABLE public.<x> without a matching
 *      `ALTER TABLE public.<x> ENABLE ROW LEVEL SECURITY` anywhere in the
 *      migrations tree.
 *
 * Exit codes: 0 = clean, 1 = new finding vs baseline, 2 = tooling error.
 *
 * Usage:
 *   node scripts/check-supabase-migration-safety.mjs
 *   node scripts/check-supabase-migration-safety.mjs --update-baseline
 *   node scripts/check-supabase-migration-safety.mjs --json
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const BASELINE_PATH = join(REPO_ROOT, "config", "supabase-migration-safety-baseline.json");

function fingerprint(scanner, migration, snippet) {
  const normalized = snippet.replace(/\s+/g, " ").trim().slice(0, 400);
  const h = createHash("sha256")
    .update(`${scanner}|${migration}|${normalized}`)
    .digest("hex");
  return h.slice(0, 16);
}

function loadMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
    }));
}

// Split top-level statements on `;` that end a line. This is coarse but
// sufficient — CREATE FUNCTION bodies use `$$ ... $$`, and we only split
// outside of `$$` regions.
function splitStatements(sql) {
  const out = [];
  let buf = "";
  let inDollar = false;
  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    // toggle $$ per line occurrence
    let l = line;
    while (l.includes("$$")) {
      const idx = l.indexOf("$$");
      buf += l.slice(0, idx + 2);
      l = l.slice(idx + 2);
      inDollar = !inDollar;
    }
    buf += l + "\n";
    if (!inDollar && line.trimEnd().endsWith(";")) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function scanSearchPathMutable(migration, stmt) {
  // Match CREATE [OR REPLACE] FUNCTION with SECURITY DEFINER, no SET search_path.
  const upper = stmt.toUpperCase();
  if (!/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/.test(upper)) return null;
  if (!/SECURITY\s+DEFINER/.test(upper)) return null;
  if (/SET\s+SEARCH_PATH\s*(=|TO)/.test(upper)) return null;
  const nameMatch = stmt.match(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_.]+)/i,
  );
  const name = nameMatch ? nameMatch[1] : "<unknown>";
  return {
    scanner: "SEARCH_PATH_MUTABLE",
    migration,
    subject: name,
    snippet: stmt.split(/\r?\n/).slice(0, 3).join(" ").slice(0, 240),
  };
}

function scanPermissivePolicy(migration, stmt) {
  const upper = stmt.toUpperCase();
  if (!/CREATE\s+POLICY/.test(upper)) return null;
  const forMatch = upper.match(/\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/);
  const op = forMatch ? forMatch[1] : "ALL";
  if (op === "SELECT") return null; // intentionally excluded
  const permissive =
    /USING\s*\(\s*TRUE\s*\)/.test(upper) ||
    /WITH\s+CHECK\s*\(\s*TRUE\s*\)/.test(upper);
  if (!permissive) return null;
  const nameMatch = stmt.match(/CREATE\s+POLICY\s+"?([^"\s]+)"?/i);
  const name = nameMatch ? nameMatch[1] : "<unnamed>";
  return {
    scanner: "PERMISSIVE_POLICY",
    migration,
    subject: `${name} FOR ${op}`,
    snippet: stmt.replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

function scanTablesWithoutRls(migrations) {
  // Collect all public tables created and all ENABLE ROW LEVEL SECURITY
  // targets across the whole migrations tree. A CREATE TABLE without a
  // matching enable anywhere is flagged against the migration that
  // creates it.
  const created = new Map(); // table -> {migration, snippet}
  const enabled = new Set();
  const createRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)/gi;
  const enableRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?public\.([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  for (const m of migrations) {
    let match;
    while ((match = createRe.exec(m.sql))) {
      const t = match[1].toLowerCase();
      if (!created.has(t)) {
        const idx = match.index;
        const snippet = m.sql.slice(idx, idx + 200).replace(/\s+/g, " ");
        created.set(t, { migration: m.name, snippet });
      }
    }
    while ((match = enableRe.exec(m.sql))) {
      enabled.add(match[1].toLowerCase());
    }
  }
  const findings = [];
  for (const [table, info] of created) {
    if (enabled.has(table)) continue;
    findings.push({
      scanner: "TABLE_WITHOUT_RLS",
      migration: info.migration,
      subject: `public.${table}`,
      snippet: info.snippet.slice(0, 240),
    });
  }
  return findings;
}

function scanAll(migrations) {
  const findings = [];
  for (const m of migrations) {
    const stmts = splitStatements(m.sql);
    for (const stmt of stmts) {
      const a = scanSearchPathMutable(m.name, stmt);
      if (a) findings.push(a);
      const b = scanPermissivePolicy(m.name, stmt);
      if (b) findings.push(b);
    }
  }
  findings.push(...scanTablesWithoutRls(migrations));
  for (const f of findings) {
    f.fingerprint = fingerprint(f.scanner, f.migration, f.snippet);
  }
  return findings;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return { version: 1, accepted: [] };
  }
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function writeBaseline(findings) {
  const payload = {
    version: 1,
    generated_at: new Date().toISOString(),
    _notes:
      "Fingerprints of accepted historical Supabase migration safety findings. Do not edit by hand except to remove an item after the underlying SQL is truly fixed. Never add a NEW finding to this file to silence CI — fix the migration instead.",
    accepted: findings
      .map((f) => ({
        fingerprint: f.fingerprint,
        scanner: f.scanner,
        migration: f.migration,
        subject: f.subject,
      }))
      .sort((a, b) =>
        a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0,
      ),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const asJson = args.has("--json");
  const update = args.has("--update-baseline");

  let migrations;
  try {
    migrations = loadMigrations();
  } catch (err) {
    console.error(`[supabase-security] failed to read migrations: ${err.message}`);
    process.exit(2);
  }

  const findings = scanAll(migrations);

  if (update) {
    writeBaseline(findings);
    console.log(
      `[supabase-security] baseline updated with ${findings.length} accepted finding(s) at ${BASELINE_PATH}`,
    );
    process.exit(0);
  }

  const baseline = loadBaseline();
  const accepted = new Set(baseline.accepted.map((a) => a.fingerprint));
  const newFindings = findings.filter((f) => !accepted.has(f.fingerprint));

  if (asJson) {
    console.log(
      JSON.stringify(
        { total: findings.length, new: newFindings, baseline_count: accepted.size },
        null,
        2,
      ),
    );
  }

  if (newFindings.length === 0) {
    if (!asJson) {
      console.log(
        `[supabase-security] OK — ${findings.length} finding(s) all baselined (${accepted.size} accepted).`,
      );
    }
    process.exit(0);
  }

  console.error(
    `[supabase-security] FAIL — ${newFindings.length} new high-risk finding(s) not in baseline:`,
  );
  for (const f of newFindings) {
    console.error(
      `  • [${f.scanner}] ${f.migration} :: ${f.subject}\n      fingerprint=${f.fingerprint}\n      ${f.snippet}`,
    );
  }
  console.error(
    "\nFix the migration, or (only for a legitimate pre-existing case) run:\n  node scripts/check-supabase-migration-safety.mjs --update-baseline\nand justify the change in review.",
  );
  process.exit(1);
}

main();
