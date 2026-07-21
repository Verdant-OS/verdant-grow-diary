#!/usr/bin/env node
/**
 * sync-edge-shared.mjs
 *
 * Generates supabase/functions/_shared/lib/** as a byte-stable mirror of the
 * subset of src/** that edge functions transitively import (limited to
 * src/lib/**, src/constants/**, and src/integrations/supabase/types.ts).
 *
 * Also rewrites imports in every supabase/functions/<fn>/*.ts entry file so
 * they point at the mirror instead of ../../../src/**.
 *
 * Contract:
 *   - src/lib/**, src/constants/**, and src/integrations/supabase/types.ts
 *     are the sources of truth. This script only READS from them.
 *   - _shared/lib/** is 100% generated. Never hand-edit.
 *   - Every mirrored file carries a @generated banner + source sha256.
 *   - A manifest at _shared/lib/.sync-manifest.json enables drift detection.
 *   - Frontend-only imports (@/components, @/hooks, @/pages, @/context,
 *     @/fixtures, react, @/integrations/supabase/client, etc.) are a hard fail.
 *
 * Usage:
 *   node scripts/sync-edge-shared.mjs             # write mirror + rewrite entries
 *   node scripts/sync-edge-shared.mjs --check     # write to tmp; exit 1 on drift
 */
import { promises as fs, statSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SRC = path.join(ROOT, "src");
const FUNCTIONS = path.join(ROOT, "supabase", "functions");
const MIRROR_REL = path.join("supabase", "functions", "_shared", "lib");
const MIRROR_ABS = path.join(ROOT, MIRROR_REL);
const CHECK = process.argv.includes("--check");
const DRY_RUN = process.argv.includes("--dry-run");

/** Allowed src-relative roots that may be mirrored. */
const ALLOWED_SRC_ROOTS = ["lib", "constants"];
const ALLOWED_EXACT_FILES = [path.join("integrations", "supabase", "types.ts")];

/** Alias prefixes and their src-relative root. */
const ALLOWED_ALIAS_PREFIXES = [
  { prefix: "@/lib/", srcRoot: "lib" },
  { prefix: "@/constants/", srcRoot: "constants" },
];
const ALLOWED_ALIAS_EXACT = {
  "@/integrations/supabase/types": path.join("integrations", "supabase", "types.ts"),
};

const IMPORT_RE =
  /((?:^|\n)\s*(?:import|export)(?:\s+[\s\S]*?\s+from)?\s*["'])([^"']+)(["'])/g;
const DYNAMIC_IMPORT_RE = /(\bimport\s*\(\s*["'])([^"']+)(["']\s*\))/g;
const INLINE_TYPE_IMPORT_RE = /(import\(\s*["'])([^"']+)(["']\s*\))/g;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function extractSpecifiers(source) {
  const specs = new Set();
  for (const m of source.matchAll(IMPORT_RE)) specs.add(m[2]);
  for (const m of source.matchAll(DYNAMIC_IMPORT_RE)) specs.add(m[2]);
  for (const m of source.matchAll(INLINE_TYPE_IMPORT_RE)) specs.add(m[2]);
  return [...specs];
}

function resolveExtension(p) {
  const candidates = [
    p,
    p + ".ts",
    p + ".tsx",
    p + ".js",
    p + ".mjs",
    path.join(p, "index.ts"),
    path.join(p, "index.tsx"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* keep trying */
    }
  }
  throw new Error(`Cannot resolve module path: ${p}`);
}

/** Absolute src file path -> src-relative path (e.g. "lib/foo/bar.ts"). */
function srcRelOf(absPath) {
  return path.relative(SRC, absPath);
}

function isMirrorable(absPath) {
  const rel = srcRelOf(absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  const top = rel.split(path.sep)[0];
  if (ALLOWED_SRC_ROOTS.includes(top)) return true;
  if (ALLOWED_EXACT_FILES.includes(rel)) return true;
  return false;
}

/**
 * Resolve a specifier to an absolute source path we should mirror,
 * or return null for external specifiers we leave untouched.
 * Throws for forbidden frontend imports.
 */
function resolveSource(spec, fromFile) {
  // Exact alias hits.
  if (ALLOWED_ALIAS_EXACT[spec]) {
    return path.join(SRC, ALLOWED_ALIAS_EXACT[spec]);
  }

  // Alias prefix hits.
  for (const { prefix, srcRoot } of ALLOWED_ALIAS_PREFIXES) {
    if (spec.startsWith(prefix)) {
      return resolveExtension(path.join(SRC, srcRoot, spec.slice(prefix.length)));
    }
  }

  // Any other @/ alias -> forbidden.
  if (spec.startsWith("@/")) {
    throw new Error(
      `Forbidden alias import "${spec}" from ${path.relative(
        ROOT,
        fromFile,
      )} — edge-function code may only reach @/lib/*, @/constants/*, and @/integrations/supabase/types.`,
    );
  }

  // Runtime specifiers.
  if (/^(npm:|jsr:|node:|https?:|deno:)/.test(spec)) return null;

  // Bare specifier (npm-like) — leave alone.
  if (!spec.startsWith(".")) return null;

  const abs = path.resolve(path.dirname(fromFile), spec);
  const resolved = tryResolve(abs);
  if (!resolved) return null;

  // Entry files (post-rewrite) import into the mirror at
  // supabase/functions/_shared/lib/**. Map those references back to the
  // src source so the drift check re-collects the same closure.
  if (resolved === MIRROR_ABS || resolved.startsWith(MIRROR_ABS + path.sep)) {
    const relInMirror = path.relative(MIRROR_ABS, resolved);
    const srcCandidate = path.join(SRC, relInMirror);
    if (isMirrorable(srcCandidate)) return srcCandidate;
    return null;
  }

  if (!isMirrorable(resolved)) {
    if (resolved.startsWith(SRC + path.sep)) {
      throw new Error(
        `Forbidden relative import "${spec}" from ${path.relative(
          ROOT,
          fromFile,
        )} — resolved to ${path.relative(
          ROOT,
          resolved,
        )}, which is outside the mirrorable src roots (${ALLOWED_SRC_ROOTS.join(", ")}).`,
      );
    }
    return null;
  }
  return resolved;
}

function tryResolve(abs) {
  try {
    return resolveExtension(abs);
  } catch {
    return null;
  }
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

/** Mirror-relative path for a mirrorable source file. */
function mirrorRelFromSource(srcAbs) {
  return srcRelOf(srcAbs);
}

async function collectFromEntries(entries) {
  const queue = [];
  const visited = new Map();

  for (const entry of entries) {
    const src = await fs.readFile(entry, "utf8");
    for (const spec of extractSpecifiers(src)) {
      const resolved = resolveSource(spec, entry);
      if (resolved) queue.push(resolved);
    }
  }

  while (queue.length) {
    const p = queue.shift();
    if (visited.has(p)) continue;
    const text = await fs.readFile(p, "utf8");
    visited.set(p, text);
    for (const spec of extractSpecifiers(text)) {
      const resolved = resolveSource(spec, p);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

/**
 * Rewrite import specifiers inside a mirrored file so they reach other
 * mirrored files via correct relative paths. Because the mirror preserves
 * the src/ tree shape exactly under _shared/lib/, any relative specifier
 * that stayed inside a mirrorable root already resolves correctly — but
 * @/... aliases must be rewritten to relatives.
 */
function rewriteMirrorSource(text, srcAbs) {
  const fromMirrorAbs = path.join(MIRROR_ABS, mirrorRelFromSource(srcAbs));

  const remap = (spec) => {
    const target = resolveSource(spec, srcAbs);
    if (!target) return null;
    if (!isMirrorable(target)) return null;
    // If already a relative specifier, keep the original form.
    if (spec.startsWith(".")) return null;
    const targetMirrorAbs = path.join(MIRROR_ABS, mirrorRelFromSource(target));
    let rel = toPosix(path.relative(path.dirname(fromMirrorAbs), targetMirrorAbs));
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
  };

  const apply = (input, re) =>
    input.replace(re, (full, pre, spec, post) => {
      const rewritten = remap(spec);
      return rewritten === null ? full : pre + rewritten + post;
    });

  let out = apply(text, IMPORT_RE);
  out = apply(out, DYNAMIC_IMPORT_RE);
  out = apply(out, INLINE_TYPE_IMPORT_RE);
  return out;
}

function rewriteEntry(text, entryAbs) {
  const remap = (spec) => {
    const target = resolveSource(spec, entryAbs);
    if (!target || !isMirrorable(target)) return null;
    const targetMirrorAbs = path.join(MIRROR_ABS, mirrorRelFromSource(target));
    let rel = toPosix(path.relative(path.dirname(entryAbs), targetMirrorAbs));
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
  };

  const apply = (input, re) =>
    input.replace(re, (full, pre, spec, post) => {
      const rewritten = remap(spec);
      return rewritten === null ? full : pre + rewritten + post;
    });

  let out = apply(text, IMPORT_RE);
  out = apply(out, DYNAMIC_IMPORT_RE);
  out = apply(out, INLINE_TYPE_IMPORT_RE);
  return out;
}

async function findEntryFiles() {
  const out = [];
  const dirents = await fs.readdir(FUNCTIONS, { withFileTypes: true });
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    if (d.name.startsWith(".")) continue;
    const fnPath = path.join(FUNCTIONS, d.name);

    if (d.name === "_shared") {
      // All _shared/*.ts files are entries (except the generated mirror).
      // Shim files that re-export from ./lib/lib/* get their transitive
      // closure re-collected via the entry -> mirror -> src back-map.
      const files = await walk(fnPath);
      for (const f of files) {
        if (!f.endsWith(".ts")) continue;
        const inMirror = f === MIRROR_ABS || f.startsWith(MIRROR_ABS + path.sep);
        if (inMirror) continue;
        out.push(f);
      }
      continue;
    }

    const files = await walk(fnPath);
    for (const f of files) {
      if (f.endsWith(".ts")) out.push(f);
    }
  }
  return out;
}

function banner(srcRel, hash) {
  return (
    `// @generated by scripts/sync-edge-shared.mjs — DO NOT EDIT.\n` +
    `// Source: ${srcRel}\n` +
    `// sha256: ${hash}\n` +
    `// To regenerate: bun run sync-edge-shared\n\n`
  );
}

async function main() {
  // In --check mode, callers (e.g. the drift annotator) can pin the tmp
  // output dir via SYNC_TMP_OUT so they can diff committed mirror files
  // against the freshly generated content to compute a real line number.
  const outRoot = CHECK
    ? (process.env.SYNC_TMP_OUT
        ? (await fs.mkdir(process.env.SYNC_TMP_OUT, { recursive: true }),
          process.env.SYNC_TMP_OUT)
        : await fs.mkdtemp(path.join(os.tmpdir(), "edge-shared-")))
    : MIRROR_ABS;


  const entries = await findEntryFiles();
  const collected = await collectFromEntries(entries);

  const mirrorFiles = new Map();
  const sourceHashes = {};
  for (const [srcAbs, srcText] of collected) {
    const relInMirror = mirrorRelFromSource(srcAbs);
    const outAbs = path.join(outRoot, relInMirror);
    const rewritten = rewriteMirrorSource(srcText, srcAbs);
    const hash = sha256(srcText);
    const srcRel = toPosix(path.relative(ROOT, srcAbs));
    const withBanner = banner(srcRel, hash) + rewritten;
    mirrorFiles.set(outAbs, withBanner);
    sourceHashes[srcRel] = hash;
  }

  const manifest = {
    generator: "scripts/sync-edge-shared.mjs",
    sourceCount: mirrorFiles.size,
    sourceHashes,
  };

  if (CHECK) {
    // When a caller pinned SYNC_TMP_OUT, materialize the freshly
    // generated mirror there so downstream tools (annotator,
    // human-readable drift report) can diff/hash expected vs actual
    // without re-running the generator themselves.
    if (process.env.SYNC_TMP_OUT) {
      for (const [outAbs, content] of mirrorFiles) {
        await fs.mkdir(path.dirname(outAbs), { recursive: true });
        await fs.writeFile(outAbs, content, "utf8");
      }
      await fs.writeFile(
        path.join(outRoot, ".sync-manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
        "utf8",
      );
    }
    const drift = [];
    for (const [outAbs, content] of mirrorFiles) {
      const rel = path.relative(outRoot, outAbs);
      const committedAbs = path.join(MIRROR_ABS, rel);
      let committed = null;
      try {
        committed = await fs.readFile(committedAbs, "utf8");
      } catch {
        drift.push(`MISSING committed mirror: ${MIRROR_REL}/${rel}`);
        continue;
      }
      if (committed !== content) {
        drift.push(`DRIFT: ${MIRROR_REL}/${rel} differs from generator output`);
      }
    }
    const committedFiles = await walk(MIRROR_ABS);
    for (const f of committedFiles) {
      const rel = path.relative(MIRROR_ABS, f);
      if (rel === ".sync-manifest.json") continue;
      const expectedAbs = path.join(outRoot, rel);
      if (!mirrorFiles.has(expectedAbs)) {
        drift.push(
          `STALE committed mirror: ${MIRROR_REL}/${rel} — not referenced by any entry file`,
        );
      }
    }
    try {
      const committedManifest = JSON.parse(
        await fs.readFile(path.join(MIRROR_ABS, ".sync-manifest.json"), "utf8"),
      );
      if (
        JSON.stringify(committedManifest.sourceHashes) !==
        JSON.stringify(sourceHashes)
      ) {
        drift.push("DRIFT: .sync-manifest.json sourceHashes differ");
      }
    } catch {
      drift.push("MISSING .sync-manifest.json");
    }
    for (const entry of entries) {
      const text = await fs.readFile(entry, "utf8");
      for (const spec of extractSpecifiers(text)) {
        const badAlias =
          spec.startsWith("@/lib/") ||
          spec.startsWith("@/constants/") ||
          spec === "@/integrations/supabase/types";
        const badRelative =
          spec.startsWith(".") &&
          (() => {
            const abs = path.resolve(path.dirname(entry), spec);
            const resolved = tryResolve(abs);
            return resolved !== null && isMirrorable(resolved);
          })();
        if (badAlias || badRelative) {
          drift.push(
            `ENTRY not rewritten: ${path.relative(ROOT, entry)} still imports "${spec}"`,
          );
          break;
        }
      }
    }
    if (drift.length) {
      console.error("Edge shared-lib mirror is out of sync:\n");
      for (const d of drift) console.error("  - " + d);
      console.error("\nRun `bun run sync-edge-shared` and commit the result.");
      process.exit(1);
    }
    console.log(`OK — ${mirrorFiles.size} mirrored files in sync with src/.`);
    return;
  }

  if (DRY_RUN) {
    const planned = { create: [], update: [], unchanged: 0, deleteStale: [] };
    for (const [outAbs, content] of mirrorFiles) {
      let existing = null;
      try {
        existing = await fs.readFile(outAbs, "utf8");
      } catch {}
      const rel = path.relative(ROOT, outAbs);
      if (existing === null) planned.create.push(rel);
      else if (existing !== content) planned.update.push(rel);
      else planned.unchanged++;
    }
    try {
      const committedFiles = await walk(MIRROR_ABS);
      for (const f of committedFiles) {
        const rel = path.relative(MIRROR_ABS, f);
        if (rel === ".sync-manifest.json") continue;
        const expectedAbs = path.join(MIRROR_ABS, rel);
        if (!mirrorFiles.has(expectedAbs)) {
          planned.deleteStale.push(path.join(MIRROR_REL, rel));
        }
      }
    } catch {}

    const entryChanges = [];
    for (const entry of entries) {
      const before = await fs.readFile(entry, "utf8");
      const after = rewriteEntry(before, entry);
      if (after !== before) entryChanges.push(path.relative(ROOT, entry));
    }

    console.log("DRY RUN — no files written.\n");
    console.log(`Mirror target: ${MIRROR_REL}`);
    console.log(`  create:    ${planned.create.length}`);
    for (const f of planned.create) console.log(`    + ${f}`);
    console.log(`  update:    ${planned.update.length}`);
    for (const f of planned.update) console.log(`    ~ ${f}`);
    console.log(`  unchanged: ${planned.unchanged}`);
    console.log(`  stale (would be removed by mirror rewrite): ${planned.deleteStale.length}`);
    for (const f of planned.deleteStale) console.log(`    - ${f}`);
    console.log(`\nEntry files to rewrite: ${entryChanges.length}`);
    for (const f of entryChanges) console.log(`    ~ ${f}`);
    console.log(
      `\nRun without --dry-run to apply. Total mirrored files planned: ${mirrorFiles.size}.`,
    );
    return;
  }

  await fs.rm(MIRROR_ABS, { recursive: true, force: true });
  for (const [outAbs, content] of mirrorFiles) {
    await fs.mkdir(path.dirname(outAbs), { recursive: true });
    await fs.writeFile(outAbs, content, "utf8");
  }
  await fs.writeFile(
    path.join(MIRROR_ABS, ".sync-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  let rewrittenCount = 0;
  for (const entry of entries) {
    const before = await fs.readFile(entry, "utf8");
    const after = rewriteEntry(before, entry);
    if (after !== before) {
      await fs.writeFile(entry, after, "utf8");
      rewrittenCount++;
    }
  }

  console.log(
    `Mirror: ${mirrorFiles.size} file(s) written to ${MIRROR_REL}. Entries rewritten: ${rewrittenCount}.`,
  );
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
