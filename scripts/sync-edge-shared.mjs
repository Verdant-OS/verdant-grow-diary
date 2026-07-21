#!/usr/bin/env node
/**
 * sync-edge-shared.mjs
 *
 * Generates supabase/functions/_shared/lib/** as a byte-stable mirror of the
 * subset of src/lib/** (plus the auto-generated Supabase types file) that
 * edge functions transitively import. Also rewrites imports in every
 * supabase/functions/<fn>/*.ts entry file so they point at the mirror
 * instead of ../../../src/**.
 *
 * Contract:
 *   - src/lib/** and src/integrations/supabase/types.ts are the sources of truth.
 *     This script only READS from them.
 *   - _shared/lib/** is 100% generated. Never hand-edit.
 *   - Every mirrored file carries a @generated banner + source sha256.
 *   - A manifest at _shared/lib/.sync-manifest.json enables drift detection.
 *   - Frontend-only imports (@/components, @/hooks, @/pages, react, supabase
 *     client, etc.) are a hard fail.
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
const SRC_LIB = path.join(SRC, "lib");
const SUPABASE_TYPES_SRC = path.join(SRC, "integrations", "supabase", "types.ts");
const FUNCTIONS = path.join(ROOT, "supabase", "functions");
const MIRROR_REL = path.join("supabase", "functions", "_shared", "lib");
const CHECK = process.argv.includes("--check");

const FRONTEND_FORBIDDEN = [
  /^@\/components(\/|$)/,
  /^@\/hooks(\/|$)/,
  /^@\/pages(\/|$)/,
  /^react(\/|$|-dom)/,
  /^@\/integrations\/supabase\/client$/,
];

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

/**
 * Resolve a specifier to an absolute source path we should mirror,
 * or return null for external specifiers we leave untouched.
 * Throws for forbidden frontend imports.
 */
function resolveSource(spec, fromFile) {
  for (const rx of FRONTEND_FORBIDDEN) {
    if (rx.test(spec)) {
      throw new Error(
        `Forbidden frontend import "${spec}" reached from ${path.relative(
          ROOT,
          fromFile,
        )} — edge-function code cannot depend on browser-only modules.`,
      );
    }
  }
  if (/^(npm:|jsr:|node:|https?:|deno:)/.test(spec)) return null;

  if (spec === "@/integrations/supabase/types") return SUPABASE_TYPES_SRC;

  if (spec.startsWith("@/")) {
    if (!spec.startsWith("@/lib/")) {
      throw new Error(
        `Non-lib alias import "${spec}" from ${path.relative(
          ROOT,
          fromFile,
        )} — only @/lib/* and @/integrations/supabase/types may cross into edge code.`,
      );
    }
    return resolveExtension(path.join(SRC_LIB, spec.slice("@/lib/".length)));
  }

  if (spec.startsWith(".")) {
    const abs = path.resolve(path.dirname(fromFile), spec);
    // Only follow relative imports that land inside a mirrored source tree.
    if (abs === SRC_LIB || abs.startsWith(SRC_LIB + path.sep)) {
      return resolveExtension(abs);
    }
    if (abs === SUPABASE_TYPES_SRC) return SUPABASE_TYPES_SRC;
    return null;
  }

  return null; // bare npm/deno specifier
}

/**
 * Map a source absolute path to its mirror-relative path (relative to the
 * mirror root at supabase/functions/_shared/lib/).
 */
function mirrorRelFromSource(srcAbs) {
  if (srcAbs === SUPABASE_TYPES_SRC) {
    return path.join("_supabase", "types.ts");
  }
  return path.relative(SRC_LIB, srcAbs);
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

function toPosix(p) {
  return p.split(path.sep).join("/");
}

/**
 * For an already-mirrored file at srcAbs, rewrite import specifiers so they
 * reach other mirrored files via relative paths. Relative specifiers that
 * already stay inside a mirrored tree resolve to the same tree in the mirror
 * (because we preserve the src/lib tree shape) — but supabase types lives
 * elsewhere in the mirror, so relative imports into it get rewritten too.
 */
function rewriteMirrorSource(text, srcAbs, mirrorRootAbs) {
  const fromMirrorAbs = path.join(mirrorRootAbs, mirrorRelFromSource(srcAbs));

  const remap = (spec) => {
    const target = resolveSource(spec, srcAbs);
    if (!target) return null;
    const targetMirrorAbs = path.join(mirrorRootAbs, mirrorRelFromSource(target));
    let rel = toPosix(
      path.relative(path.dirname(fromMirrorAbs), targetMirrorAbs),
    );
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
  };

  const apply = (input, re) =>
    input.replace(re, (full, pre, spec, post) => {
      // Skip if this is a relative import that stays inside src/lib AND the
      // mirror tree shape matches — relative form still resolves correctly,
      // but we always call remap so cross-tree jumps (into _supabase) work.
      const isRelInsideSameTree =
        spec.startsWith(".") &&
        srcAbs !== SUPABASE_TYPES_SRC &&
        (() => {
          try {
            const abs = path.resolve(path.dirname(srcAbs), spec);
            return abs.startsWith(SRC_LIB + path.sep) || abs === SRC_LIB;
          } catch {
            return false;
          }
        })();
      const remapped = remap(spec);
      if (remapped === null) return full;
      if (isRelInsideSameTree) {
        // Keep the original relative specifier — preserves diff-friendliness.
        return full;
      }
      return pre + remapped + post;
    });

  let out = apply(text, IMPORT_RE);
  out = apply(out, DYNAMIC_IMPORT_RE);
  out = apply(out, INLINE_TYPE_IMPORT_RE);
  return out;
}

/**
 * For an entry file inside supabase/functions/<fn>/, rewrite any specifier
 * that reaches a mirrored source into a relative path into the mirror.
 * Never touches specifiers that resolve outside the mirror set.
 */
function rewriteEntry(text, entryAbs, mirrorRootAbs) {
  const remap = (spec) => {
    let target = null;
    try {
      target = resolveSource(spec, entryAbs);
    } catch (err) {
      // Bubble frontend-import errors up.
      throw err;
    }
    if (!target) return null;
    const targetMirrorAbs = path.join(mirrorRootAbs, mirrorRelFromSource(target));
    let rel = toPosix(
      path.relative(path.dirname(entryAbs), targetMirrorAbs),
    );
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
      // Entry-eligible: existing _shared/*.ts files that reach into src/**.
      // Skip anything inside the generated mirror.
      const files = await walk(fnPath);
      for (const f of files) {
        if (!f.endsWith(".ts")) continue;
        const inMirror =
          f === path.join(ROOT, MIRROR_REL) ||
          f.startsWith(path.join(ROOT, MIRROR_REL) + path.sep);
        if (inMirror) continue;
        const text = await fs.readFile(f, "utf8");
        if (
          /(\.\.\/){2,}src\//.test(text) ||
          /@\/lib\//.test(text) ||
          /@\/integrations\/supabase\/types/.test(text)
        ) {
          out.push(f);
        }
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
  const outRoot = CHECK
    ? await fs.mkdtemp(path.join(os.tmpdir(), "edge-shared-"))
    : path.join(ROOT, MIRROR_REL);
  const mirrorRootAbs = path.join(ROOT, MIRROR_REL);

  const entries = await findEntryFiles();
  const collected = await collectFromEntries(entries);

  const mirrorFiles = new Map();
  const sourceHashes = {};
  for (const [srcAbs, srcText] of collected) {
    const relInMirror = mirrorRelFromSource(srcAbs);
    const outAbs = path.join(outRoot, relInMirror);
    const rewritten = rewriteMirrorSource(srcText, srcAbs, mirrorRootAbs);
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
    const drift = [];
    for (const [outAbs, content] of mirrorFiles) {
      const rel = path.relative(outRoot, outAbs);
      const committedAbs = path.join(mirrorRootAbs, rel);
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
    const committedFiles = await walk(mirrorRootAbs);
    for (const f of committedFiles) {
      const rel = path.relative(mirrorRootAbs, f);
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
        await fs.readFile(
          path.join(mirrorRootAbs, ".sync-manifest.json"),
          "utf8",
        ),
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
      if (
        /(\.\.\/){2,}src\//.test(text) ||
        /@\/lib\//.test(text) ||
        /@\/integrations\/supabase\/types/.test(text)
      ) {
        drift.push(
          `ENTRY not rewritten: ${path.relative(
            ROOT,
            entry,
          )} still imports src/** directly`,
        );
      }
    }
    if (drift.length) {
      console.error("Edge shared-lib mirror is out of sync:\n");
      for (const d of drift) console.error("  - " + d);
      console.error("\nRun `bun run sync-edge-shared` and commit the result.");
      process.exit(1);
    }
    console.log(
      `OK — ${mirrorFiles.size} mirrored files in sync with src/lib.`,
    );
    return;
  }

  await fs.rm(mirrorRootAbs, { recursive: true, force: true });
  for (const [outAbs, content] of mirrorFiles) {
    await fs.mkdir(path.dirname(outAbs), { recursive: true });
    await fs.writeFile(outAbs, content, "utf8");
  }
  await fs.writeFile(
    path.join(mirrorRootAbs, ".sync-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  let rewrittenCount = 0;
  for (const entry of entries) {
    const before = await fs.readFile(entry, "utf8");
    const after = rewriteEntry(before, entry, mirrorRootAbs);
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
