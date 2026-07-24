#!/usr/bin/env node
/**
 * Verify that every already-published Supabase migration file in the
 * current working tree matches the baseline branch byte-for-byte.
 *
 * "Already-published" = the file exists on the baseline ref (default
 * `origin/verdant-grow-diary`). New migration files that only exist on
 * the current branch are reported separately and never fail the gate —
 * they are the correct way to land follow-up changes.
 *
 * A published migration that has been edited (any byte change), deleted,
 * or replaced with a no-op counts as a FAIL. This is the invariant:
 * migration history is append-only.
 *
 * Usage (run from repo root, with git available — i.e. your Windows
 * checkout, not the Lovable sandbox):
 *
 *   node scripts/verify-published-migration-integrity.mjs
 *   node scripts/verify-published-migration-integrity.mjs --baseline=origin/verdant-grow-diary
 *   node scripts/verify-published-migration-integrity.mjs --json
 *   node scripts/verify-published-migration-integrity.mjs --only=20260721
 *
 * Env overrides:
 *   VERDANT_MIGRATION_BASELINE_REF   default baseline ref
 *
 * Exit codes:
 *   0  every published migration matches baseline
 *   1  one or more published migrations were edited / deleted / no-op'd
 *   2  invocation / git / IO error (baseline ref missing, not a git repo)
 *
 * This script performs zero writes, no DB access, no network calls.
 * It only reads git blobs and files on disk.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const DEFAULT_BASELINE =
  process.env.VERDANT_MIGRATION_BASELINE_REF ?? "origin/verdant-grow-diary";

// ─── arg parsing ──────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    baseline: DEFAULT_BASELINE,
    json: false,
    only: null,
    allow: [], // Array<{ path, reason }>
    strictAllowlist: false,
  };
  for (const a of argv.slice(2)) {
    if (a === "--json") out.json = true;
    else if (a.startsWith("--baseline=")) out.baseline = a.slice(11);
    else if (a.startsWith("--only=")) out.only = a.slice(7);
    else if (a === "--strict-allowlist") out.strictAllowlist = true;
    else if (a.startsWith("--allow=")) out.allow.push(parseAllowSpec(a.slice(8)));
    else if (a.startsWith("--allow-file=")) {
      for (const entry of loadAllowFile(a.slice(13))) out.allow.push(entry);
    } else if (a === "--help" || a === "-h") {
      // eslint-disable-next-line no-console
      console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 34).join("\n"));
      process.exit(0);
    } else {
      fail(2, `unknown arg: ${a}`);
    }
  }
  return out;
}

/**
 * Parse a single `--allow=<path>:<reason>` spec. Path is normalized so
 * bare filenames (`20260722100000_foo.sql`) resolve to the canonical
 * `supabase/migrations/<name>` path. Reason is required and cannot be
 * whitespace-only — an unlabeled allowlist is a doctrine violation.
 */
function parseAllowSpec(raw) {
  const idx = raw.indexOf(":");
  if (idx < 0) {
    fail(
      2,
      `--allow requires "<path>:<reason>" (got ${JSON.stringify(raw)}). ` +
        `Example: --allow=supabase/migrations/20260722_foo.sql:"restore missing GRANT"`,
    );
  }
  const path = normalizeAllowPath(raw.slice(0, idx).trim());
  const reason = raw.slice(idx + 1).trim();
  if (!path) fail(2, `--allow spec has empty path: ${JSON.stringify(raw)}`);
  if (!reason) {
    fail(
      2,
      `--allow spec requires a non-empty reason (got ${JSON.stringify(raw)}). ` +
        `Every allowlisted edit MUST be justified in writing.`,
    );
  }
  return { path, reason };
}

function normalizeAllowPath(p) {
  if (!p) return p;
  if (p.startsWith(`${MIGRATIONS_DIR}/`)) return p;
  if (p.includes("/")) return p;
  return `${MIGRATIONS_DIR}/${p}`;
}

/**
 * Load an allowlist JSON file. Accepts either a bare array of entries
 * or `{ "allow": [...] }`. Each entry needs `path` and `reason`.
 */
function loadAllowFile(filePath) {
  const abs = resolve(process.cwd(), filePath);
  if (!existsSync(abs)) fail(2, `--allow-file not found: ${filePath}`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    fail(2, `--allow-file ${filePath} is not valid JSON: ${err.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.allow;
  if (!Array.isArray(list)) {
    fail(
      2,
      `--allow-file ${filePath} must be a JSON array or { "allow": [...] }`,
    );
  }
  return list.map((entry, i) => {
    if (!entry || typeof entry !== "object") {
      fail(2, `--allow-file ${filePath} entry #${i} is not an object`);
    }
    const path = normalizeAllowPath(String(entry.path ?? "").trim());
    const reason = String(entry.reason ?? "").trim();
    if (!path) fail(2, `--allow-file ${filePath} entry #${i} missing "path"`);
    if (!reason) {
      fail(
        2,
        `--allow-file ${filePath} entry #${i} (${path}) missing non-empty "reason"`,
      );
    }
    return { path, reason };
  });
}

function fail(code, msg) {
  // eslint-disable-next-line no-console
  console.error(`[verify-published-migration-integrity] ${msg}`);
  process.exit(code);
}

// ─── git helpers ──────────────────────────────────────────────────────
function git(args, { allowFail = false } = {}) {
  const r = spawnSync("git", args, { encoding: "buffer" });
  if (r.status !== 0 && !allowFail) {
    fail(
      2,
      `git ${args.join(" ")} failed (exit ${r.status}): ${r.stderr?.toString() ?? ""}`,
    );
  }
  return { status: r.status ?? 0, stdout: r.stdout, stderr: r.stderr };
}

function assertGitRepo() {
  const r = git(["rev-parse", "--is-inside-work-tree"], { allowFail: true });
  if (r.status !== 0) fail(2, "not inside a git working tree");
}

function assertBaselineExists(ref) {
  const r = git(["rev-parse", "--verify", `${ref}^{commit}`], {
    allowFail: true,
  });
  if (r.status !== 0) {
    fail(
      2,
      `baseline ref '${ref}' does not exist. Fetch it first (e.g. \`git fetch origin verdant-grow-diary\`) or pass --baseline=<ref>.`,
    );
  }
}

function listBaselineMigrations(ref) {
  const r = git(["ls-tree", "-r", "--name-only", ref, "--", MIGRATIONS_DIR]);
  return r.stdout
    .toString("utf8")
    .split("\n")
    .filter((p) => p.endsWith(".sql"));
}

function baselineBlobBytes(ref, path) {
  // -p prints raw blob; encoding: buffer preserves bytes exactly.
  const r = git(["show", `${ref}:${path}`]);
  return r.stdout;
}

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// ─── classification ───────────────────────────────────────────────────
/**
 * Heuristic for reporting: files whose current body is empty or just
 * comments/whitespace are almost certainly a no-op stub. This is not the
 * pass/fail signal — a byte-mismatch already fails — but it labels the
 * failure precisely in the report ("no-op stub" vs "edited").
 */
function looksLikeNoop(bytes) {
  const text = bytes.toString("utf8");
  const stripped = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("--"))
    .join("\n")
    .trim();
  return stripped.length === 0;
}

// ─── main ─────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  assertGitRepo();
  assertBaselineExists(args.baseline);

  const baselineFiles = listBaselineMigrations(args.baseline).filter((p) =>
    args.only ? p.includes(args.only) : true,
  );

  const results = {
    baseline: args.baseline,
    checked: 0,
    matched: [],
    edited: [],
    deleted: [],
    noop_stubs: [],
    new_on_branch: [],
  };

  // Every migration on baseline must exist unchanged on the current tree.
  for (const path of baselineFiles) {
    results.checked += 1;
    const abs = resolve(process.cwd(), path);
    const baselineBytes = baselineBlobBytes(args.baseline, path);
    const baselineHash = sha256Bytes(baselineBytes);
    if (!existsSync(abs)) {
      results.deleted.push({ path, baseline_sha256: baselineHash });
      continue;
    }
    const currentBytes = readFileSync(abs);
    const currentHash = sha256Bytes(currentBytes);
    if (currentHash === baselineHash) {
      results.matched.push(path);
      continue;
    }
    const entry = {
      path,
      baseline_sha256: baselineHash,
      current_sha256: currentHash,
      baseline_bytes: baselineBytes.length,
      current_bytes: currentBytes.length,
    };
    if (looksLikeNoop(currentBytes)) results.noop_stubs.push(entry);
    else results.edited.push(entry);
  }

  // Report new-on-branch migrations (informational, not a failure).
  const baselineSet = new Set(baselineFiles);
  try {
    const localList = git(["ls-files", "--", `${MIGRATIONS_DIR}/*.sql`]);
    for (const p of localList.stdout.toString("utf8").split("\n")) {
      if (!p.endsWith(".sql")) continue;
      if (args.only && !p.includes(args.only)) continue;
      if (!baselineSet.has(p)) results.new_on_branch.push(p);
    }
  } catch {
    // Non-fatal — fall back to filesystem scan.
    const dir = resolve(process.cwd(), MIGRATIONS_DIR);
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      for (const name of readFileSync(dir).toString().split("\n")) {
        const p = `${MIGRATIONS_DIR}/${name}`;
        if (name.endsWith(".sql") && !baselineSet.has(p)) {
          if (args.only && !p.includes(args.only)) continue;
          results.new_on_branch.push(p);
        }
      }
    }
  }

  const failures =
    results.edited.length + results.deleted.length + results.noop_stubs.length;

  if (args.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: failures === 0, ...results }, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `\n[verify-published-migration-integrity] baseline=${args.baseline}`,
    );
    // eslint-disable-next-line no-console
    console.log(`  checked:        ${results.checked} published migrations`);
    // eslint-disable-next-line no-console
    console.log(`  matched:        ${results.matched.length}`);
    // eslint-disable-next-line no-console
    console.log(`  edited:         ${results.edited.length}`);
    // eslint-disable-next-line no-console
    console.log(`  no-op stubs:    ${results.noop_stubs.length}`);
    // eslint-disable-next-line no-console
    console.log(`  deleted:        ${results.deleted.length}`);
    // eslint-disable-next-line no-console
    console.log(
      `  new on branch:  ${results.new_on_branch.length} (additive, ok)\n`,
    );
    for (const e of results.edited) {
      console.log(
        `  EDITED   ${e.path}\n    baseline sha256: ${e.baseline_sha256} (${e.baseline_bytes} B)\n    current  sha256: ${e.current_sha256} (${e.current_bytes} B)`,
      );
    }
    for (const e of results.noop_stubs) {
      console.log(
        `  NO-OP    ${e.path}\n    baseline sha256: ${e.baseline_sha256} (${e.baseline_bytes} B)\n    current  sha256: ${e.current_sha256} (${e.current_bytes} B) — body is empty/comments only`,
      );
    }
    for (const e of results.deleted) {
      console.log(`  DELETED  ${e.path}`);
    }
    for (const p of results.new_on_branch) {
      console.log(`  new      ${p}`);
    }
    console.log(
      failures === 0
        ? "\nOK — every published migration matches baseline.\n"
        : `\nFAIL — ${failures} published migration(s) diverge from baseline. Restore with:\n  git checkout ${args.baseline} -- <path>\n`,
    );
  }

  process.exit(failures === 0 ? 0 : 1);
}

main();
