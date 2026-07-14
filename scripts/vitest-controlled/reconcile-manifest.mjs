// Independent manifest reconciliation.
//
// Independently walks src/**, matches the controlled test suffix, and
// compares against the controlled runner's own manifest output. Does not
// import controlled manifest discovery — that is the whole point.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const TEST_SUFFIX_RE = /\.(test|spec)\.(ts|tsx)$/i;

/** Independent, controlled-manifest-free walker. */
export function walkIndependentManifest(repoRoot, { fsImpl = fs } = {}) {
  const root = path.resolve(repoRoot, "src");
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fsImpl.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === "ENOENT") continue;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        stack.push(full);
      } else if (entry.isFile() && TEST_SUFFIX_RE.test(entry.name)) {
        const rel = path.relative(repoRoot, full).split(path.sep).join("/");
        out.push(rel);
      }
    }
  }
  return out.sort();
}

/** Sha256 over sorted paths — content-independent. */
export function hashPaths(paths) {
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    h.update(p);
    h.update("\n");
  }
  return h.digest("hex");
}

/** Compare two path sets (arrays). */
export function reconcile(independent, controlled) {
  const indSet = new Set(independent);
  const conSet = new Set(controlled);
  const seen = new Set();
  const dupes = [];
  for (const p of controlled) {
    if (seen.has(p)) dupes.push(p);
    seen.add(p);
  }
  const missing = [...indSet].filter((p) => !conSet.has(p)).sort();
  const extra = [...conSet].filter((p) => !indSet.has(p)).sort();
  return {
    independentCount: independent.length,
    controlledCount: controlled.length,
    independentHash: hashPaths([...indSet].sort()),
    missing,
    extra,
    duplicates: dupes,
    inSync: missing.length === 0 && extra.length === 0 && dupes.length === 0,
  };
}

/** Invoke `node scripts/vitest-controlled/cli.mjs manifest` and parse it. */
export function loadControlledManifest({ repoRoot = process.cwd(), spawnImpl = spawnSync } = {}) {
  const cli = path.join(repoRoot, "scripts/vitest-controlled/cli.mjs");
  const res = spawnImpl("node", [cli, "manifest"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0) {
    throw new Error(
      `controlled manifest CLI exited ${res.status}: ${res.stderr || res.stdout || ""}`,
    );
  }
  return JSON.parse(res.stdout);
}

function parseArgv(argv) {
  const out = { repoRoot: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo-root") out.repoRoot = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

export async function main(argv) {
  const args = parseArgv(argv);
  const independent = walkIndependentManifest(args.repoRoot);
  const controlled = loadControlledManifest({ repoRoot: args.repoRoot });
  const report = reconcile(independent, controlled.files);
  const full = {
    ...report,
    declaredControlledCount: controlled.count,
    controlledManifestHash: controlled.hash,
  };
  if (args.json) process.stdout.write(JSON.stringify(full, null, 2) + "\n");
  else {
    process.stdout.write(
      `independent=${full.independentCount} controlled=${full.controlledCount} declared=${full.declaredControlledCount}\n`,
    );
    process.stdout.write(`independentHash=${full.independentHash}\n`);
    process.stdout.write(`controlledHash =${full.controlledManifestHash}\n`);
    if (full.missing.length) process.stdout.write(`MISSING: ${full.missing.length}\n`);
    if (full.extra.length) process.stdout.write(`EXTRA:   ${full.extra.length}\n`);
    if (full.duplicates.length) process.stdout.write(`DUPES:   ${full.duplicates.length}\n`);
  }
  const ok = full.inSync && full.declaredControlledCount === full.controlledCount;
  return ok ? 0 : 2;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(String(err?.stack || err) + "\n");
      process.exit(1);
    },
  );
}

// Re-export for tests that need to resolve this file.
export const __filename = fileURLToPath(import.meta.url);
