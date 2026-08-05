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
  const h = createHash("sha256").update(`${scanner}|${migration}|${normalized}`).digest("hex");
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

function splitStatements(sql) {
  const out = [];
  let buf = "";
  let inDollar = false;
  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    let remainder = line;
    while (remainder.includes("$$")) {
      const idx = remainder.indexOf("$$");
      buf += remainder.slice(0, idx + 2);
      remainder = remainder.slice(idx + 2);
      inDollar = !inDollar;
    }
    buf += remainder + "\n";
    if (!inDollar && line.trimEnd().endsWith(";")) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

// Policy replay needs exact top-level statement order, including multiple DDL
// statements on one line. Preserve semicolons inside quoted strings,
// identifiers, comments, and dollar-quoted function bodies.
function splitPolicyStatements(sql) {
  const out = [];
  let buf = "";
  let mode = "normal";
  let dollarTag = null;
  let blockCommentDepth = 0;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (mode === "line-comment") {
      buf += char;
      if (char === "\n") mode = "normal";
      continue;
    }

    if (mode === "block-comment") {
      if (char === "/" && next === "*") {
        buf += "/*";
        blockCommentDepth += 1;
        i += 1;
        continue;
      }
      if (char === "*" && next === "/") {
        buf += "*/";
        blockCommentDepth -= 1;
        i += 1;
        if (blockCommentDepth === 0) mode = "normal";
        continue;
      }
      buf += char;
      continue;
    }

    if (mode === "single-quote") {
      buf += char;
      if (char === "\\" && next !== undefined) {
        buf += next;
        i += 1;
      } else if (char === "'" && next === "'") {
        buf += next;
        i += 1;
      } else if (char === "'") {
        mode = "normal";
      }
      continue;
    }

    if (mode === "double-quote") {
      buf += char;
      if (char === '"' && next === '"') {
        buf += next;
        i += 1;
      } else if (char === '"') {
        mode = "normal";
      }
      continue;
    }

    if (mode === "dollar-quote") {
      if (dollarTag && sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
        mode = "normal";
      } else {
        buf += char;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      buf += "--";
      mode = "line-comment";
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      buf += "/*";
      mode = "block-comment";
      blockCommentDepth = 1;
      i += 1;
      continue;
    }
    if (char === "'") {
      buf += char;
      mode = "single-quote";
      continue;
    }
    if (char === '"') {
      buf += char;
      mode = "double-quote";
      continue;
    }
    if (char === "$") {
      const tag = sql.slice(i).match(/^(\$\$|\$[a-zA-Z_][a-zA-Z0-9_]*\$)/)?.[1];
      if (tag) {
        buf += tag;
        dollarTag = tag;
        mode = "dollar-quote";
        i += tag.length - 1;
        continue;
      }
    }
    if (char === ";") {
      buf += char;
      out.push(buf);
      buf = "";
      continue;
    }
    buf += char;
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
  const nameMatch = stmt.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_.]+)/i);
  const name = nameMatch ? nameMatch[1] : "<unknown>";
  return {
    scanner: "SEARCH_PATH_MUTABLE",
    migration,
    subject: name,
    snippet: stmt.split(/\r?\n/).slice(0, 3).join(" ").slice(0, 240),
  };
}

const SQL_IDENTIFIER_SOURCE = `(?:"(?:[^"]|"")*"|[a-zA-Z_][a-zA-Z0-9_$]*)`;
const QUALIFIED_IDENTIFIER_SOURCE = `${SQL_IDENTIFIER_SOURCE}(?:\\s*\\.\\s*${SQL_IDENTIFIER_SOURCE})?`;

function normalizeSqlIdentifier(identifier) {
  const trimmed = identifier.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed.toLowerCase();
}

function splitQualifiedIdentifier(identifier) {
  const parts = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < identifier.length; i += 1) {
    const char = identifier[i];
    if (char === '"') {
      current += char;
      if (quoted && identifier[i + 1] === '"') {
        current += identifier[i + 1];
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "." && !quoted) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts;
}

function normalizeQualifiedIdentifier(identifier) {
  const parts = splitQualifiedIdentifier(identifier);
  return parts.map(normalizeSqlIdentifier);
}

function stripLeadingSqlTrivia(stmt) {
  let sql = stmt.trimStart();
  while (sql) {
    if (sql.startsWith("--")) {
      const newline = sql.indexOf("\n");
      return newline === -1 ? "" : stripLeadingSqlTrivia(sql.slice(newline + 1));
    }
    if (sql.startsWith("/*")) {
      const end = sql.indexOf("*/", 2);
      return end === -1 ? "" : stripLeadingSqlTrivia(sql.slice(end + 2));
    }
    return sql;
  }
  return sql;
}

function maskSqlCommentsAndLiterals(sql) {
  const masked = sql.split("");
  let mode = "normal";
  let dollarTag = null;
  let blockCommentDepth = 0;
  let backslashEscapes = false;

  const mask = (index) => {
    if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
  };

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (mode === "line-comment") {
      mask(i);
      if (char === "\n") mode = "normal";
      continue;
    }

    if (mode === "block-comment") {
      if (char === "/" && next === "*") {
        mask(i);
        mask(i + 1);
        blockCommentDepth += 1;
        i += 1;
        continue;
      }
      if (char === "*" && next === "/") {
        mask(i);
        mask(i + 1);
        blockCommentDepth -= 1;
        i += 1;
        if (blockCommentDepth === 0) mode = "normal";
        continue;
      }
      mask(i);
      continue;
    }

    if (mode === "single-quote") {
      mask(i);
      if (char === "'" && next === "'") {
        mask(i + 1);
        i += 1;
      } else if (backslashEscapes && char === "\\" && next !== undefined) {
        mask(i + 1);
        i += 1;
      } else if (char === "'") {
        mode = "normal";
        backslashEscapes = false;
      }
      continue;
    }

    if (mode === "double-quote") {
      mask(i);
      if (char === '"' && next === '"') {
        mask(i + 1);
        i += 1;
      } else if (char === '"') {
        mode = "normal";
      }
      continue;
    }

    if (mode === "dollar-quote") {
      if (dollarTag && sql.startsWith(dollarTag, i)) {
        for (let j = 0; j < dollarTag.length; j += 1) mask(i + j);
        i += dollarTag.length - 1;
        dollarTag = null;
        mode = "normal";
      } else {
        mask(i);
      }
      continue;
    }

    if (char === "-" && next === "-") {
      mask(i);
      mask(i + 1);
      mode = "line-comment";
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mask(i);
      mask(i + 1);
      mode = "block-comment";
      blockCommentDepth = 1;
      i += 1;
      continue;
    }
    if (char === "'") {
      mask(i);
      const previous = sql[i - 1];
      const beforePrevious = sql[i - 2];
      backslashEscapes =
        (previous === "e" || previous === "E") &&
        (beforePrevious === undefined || !/[a-zA-Z0-9_$]/.test(beforePrevious));
      mode = "single-quote";
      continue;
    }
    if (char === '"') {
      mask(i);
      mode = "double-quote";
      continue;
    }
    if (char === "$") {
      const tag = sql.slice(i).match(/^(\$\$|\$[a-zA-Z_][a-zA-Z0-9_]*\$)/)?.[1];
      if (tag) {
        for (let j = 0; j < tag.length; j += 1) mask(i + j);
        dollarTag = tag;
        mode = "dollar-quote";
        i += tag.length - 1;
      }
    }
  }

  return masked.join("");
}

function findMatchingParen(sql, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractTopLevelPolicyClause(maskedSql, clause) {
  const clauseRe = clause === "USING" ? /^USING\b\s*\(/i : /^WITH\b\s+CHECK\b\s*\(/i;
  let depth = 0;

  for (let i = 0; i < maskedSql.length; i += 1) {
    const char = maskedSql[i];
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    if (i > 0 && /[a-zA-Z0-9_$]/.test(maskedSql[i - 1])) continue;

    const match = maskedSql.slice(i).match(clauseRe);
    if (!match) continue;
    const openIndex = i + match[0].lastIndexOf("(");
    const closeIndex = findMatchingParen(maskedSql, openIndex);
    if (closeIndex === -1) return null;
    return maskedSql.slice(openIndex + 1, closeIndex);
  }

  return null;
}

function isDirectBooleanTrue(expression) {
  let candidate = expression.trim();
  while (candidate.startsWith("(")) {
    const closeIndex = findMatchingParen(candidate, 0);
    if (closeIndex !== candidate.length - 1) break;
    candidate = candidate.slice(1, -1).trim();
  }
  return /^TRUE$/i.test(candidate);
}

function parsePolicyClauses(stmt) {
  const masked = maskSqlCommentsAndLiterals(stmt);
  return {
    using: extractTopLevelPolicyClause(masked, "USING"),
    withCheck: extractTopLevelPolicyClause(masked, "WITH CHECK"),
  };
}

function parsePolicyOperation(stmt) {
  const masked = maskSqlCommentsAndLiterals(stmt);
  return masked.match(/\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i)?.[1].toUpperCase() ?? "ALL";
}

function parsePolicyTarget(stmt, action) {
  const sql = stripLeadingSqlTrivia(stmt);
  let prefix;
  let betweenNameAndTable = "\\s+";
  if (action === "CREATE") {
    prefix = "^CREATE\\s+POLICY\\s+";
    betweenNameAndTable = "\\s+(?:AS\\s+(?:PERMISSIVE|RESTRICTIVE)\\s+)?";
  } else if (action === "ALTER") {
    prefix = "^ALTER\\s+POLICY\\s+";
  } else {
    prefix = "^DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?";
  }
  const match = sql.match(
    new RegExp(
      `${prefix}(${SQL_IDENTIFIER_SOURCE})${betweenNameAndTable}ON\\s+(?:TABLE\\s+)?(${QUALIFIED_IDENTIFIER_SOURCE})`,
      "i",
    ),
  );
  if (!match) return null;
  const [, name, table] = match;
  return {
    name,
    table,
    key: JSON.stringify([normalizeQualifiedIdentifier(table), normalizeSqlIdentifier(name)]),
  };
}

function buildPermissivePolicyFinding(migration, stmt, name, operation) {
  return {
    scanner: "PERMISSIVE_POLICY",
    migration,
    subject: `${name} FOR ${operation}`,
    snippet: stmt.replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

function scanActivePermissivePolicies(migrations) {
  // Policies are mutable schema objects. Scan their effective final state,
  // rather than permanently reporting a vulnerable CREATE that a later
  // forward migration drops and safely replaces.
  const policyStates = new Map();
  const unkeyedFindings = [];
  let statementOrder = 0;

  for (const migration of migrations) {
    for (const stmt of splitPolicyStatements(migration.sql)) {
      statementOrder += 1;
      const dropped = parsePolicyTarget(stmt, "DROP");
      if (dropped) {
        policyStates.delete(dropped.key);
        continue;
      }

      const created = parsePolicyTarget(stmt, "CREATE");
      if (created) {
        const clauses = parsePolicyClauses(stmt);
        const source = { migration: migration.name, stmt, order: statementOrder };
        policyStates.set(created.key, {
          name: normalizeSqlIdentifier(created.name),
          operation: parsePolicyOperation(stmt),
          using: clauses.using === null ? null : { expression: clauses.using, source },
          withCheck: clauses.withCheck === null ? null : { expression: clauses.withCheck, source },
        });
        continue;
      }

      const altered = parsePolicyTarget(stmt, "ALTER");
      if (altered) {
        const clauses = parsePolicyClauses(stmt);
        if (clauses.using === null && clauses.withCheck === null) continue;
        const source = { migration: migration.name, stmt, order: statementOrder };
        const state = policyStates.get(altered.key) ?? {
          name: normalizeSqlIdentifier(altered.name),
          operation: "ALL",
          using: null,
          withCheck: null,
        };
        if (clauses.using !== null) {
          state.using = { expression: clauses.using, source };
        }
        if (clauses.withCheck !== null) {
          state.withCheck = { expression: clauses.withCheck, source };
        }
        policyStates.set(altered.key, state);
        continue;
      }

      const sql = stripLeadingSqlTrivia(stmt);
      if (!/^CREATE\s+POLICY\b/i.test(sql) && !/^ALTER\s+POLICY\b/i.test(sql)) {
        continue;
      }
      const operation = /^CREATE\s+POLICY\b/i.test(sql) ? parsePolicyOperation(stmt) : "ALL";
      const clauses = parsePolicyClauses(stmt);
      if (
        operation !== "SELECT" &&
        ((clauses.using !== null && isDirectBooleanTrue(clauses.using)) ||
          (clauses.withCheck !== null && isDirectBooleanTrue(clauses.withCheck)))
      ) {
        // A suspicious statement that cannot be keyed must never disappear
        // merely because the scanner could not parse its policy identity.
        unkeyedFindings.push(
          buildPermissivePolicyFinding(migration.name, stmt, "<unnamed>", operation),
        );
      }
    }
  }

  const activeFindings = [];
  for (const state of policyStates.values()) {
    if (state.operation === "SELECT") continue; // intentionally excluded
    const permissiveClauses = [state.using, state.withCheck].filter(
      (clause) => clause !== null && isDirectBooleanTrue(clause.expression),
    );
    if (permissiveClauses.length === 0) continue;
    const latest = permissiveClauses.reduce((current, clause) =>
      clause.source.order > current.source.order ? clause : current,
    );
    activeFindings.push(
      buildPermissivePolicyFinding(
        latest.source.migration,
        latest.source.stmt,
        state.name,
        state.operation,
      ),
    );
  }

  return [...activeFindings, ...unkeyedFindings];
}

function scanTablesWithoutRls(migrations) {
  // Collect all public tables created and all ENABLE ROW LEVEL SECURITY
  // targets across the whole migrations tree. A CREATE TABLE without a
  // matching enable anywhere is flagged against the migration that
  // creates it.
  const created = new Map(); // table -> {migration, snippet}
  const enabled = new Set();
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)/gi;
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
    }
  }
  findings.push(...scanActivePermissivePolicies(migrations));
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
      .sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0)),
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
