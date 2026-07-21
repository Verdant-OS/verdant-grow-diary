#!/usr/bin/env node
/**
 * sync-edge-shared.mjs
 *
 * Generates supabase/functions/_shared/lib/** as a byte-stable mirror of the
 * subset of src/lib/** that edge functions transitively import. Also rewrites
 * imports in every supabase/functions/<fn>/*.ts entry file so they point at
 * the mirror instead of ../../../src/lib/**.
 *
 * Contract:
 *   - src/lib/** is the single source of truth. This script only READS from it.
 *   - _shared/lib/** is 100% generated. Never hand-edit.
 *   - Every mirrored file carries a @generated banner + source sha256.
 *   - A manifest at _shared/lib/.sync-manifest.json enables drift detection.
 *   - Frontend-only imports (@/components, @/hooks, @/pages, react) are a hard fail.
 *
 * Usage:
 *   node scripts/sync-edge-shared.mjs             # write mirror + rewrite entries
 *   node scripts/sync-edge-shared.mjs --check     # write to tmp; exit 1 on drift
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SRC_LIB = path.join(ROOT, "src", "lib");
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

// Match: import ... from "X"; export ... from "X"; import("X")
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)(?:\s+[\s\S]*?\s+from)?\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function extractSpecifiers(source) {
  const specs = new Set();
  for (const m of source.matchAll(IMPORT_RE)) specs.add(m[1]);
  for (const m of source.matchAll(DYNAMIC_IMPORT_RE)) specs.add(m[1]);
  return [...specs];
}

/**
 * Resolve a specifier from a file inside src/lib to an absolute path,
 * returning null for external specifiers (npm:, https:, jsr:, node:, bare).
 * Throws for forbidden frontend specifiers.
 */
function resolveSrcLibSpecifier(spec, fromFile) {
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
  if (spec.startsWith("@/")) {
    // Only @/lib/* is allowed transitively.
    if (!spec.startsWith("@/lib/")) {
      throw new Error(
        `Non-lib alias import "${spec}" from ${path.relative(
          ROOT,
          fromFile,
        )} — only @/lib/* aliases may cross into edge code.`,
      );
    }
    const rel = spec.slice("@/lib/".length);
    return resolveExtension(path.join(SRC_LIB, rel));
  }
  if (spec.startsWith(".")) {
    const abs = path.resolve(path.dirname(fromFile), spec);
    // Only follow if the resolved path is inside src/lib.
    const inLib = abs === SRC_LIB || abs.startsWith(SRC_LIB + path.sep);
    if (!inLib) return null;
    return resolveExtension(abs);
  }
  // Bare specifier — external. Ignore.
  return null;
}

function resolveExtension(p) {
  // Explicit .ts / .tsx / .js / .mjs / index.ts fallbacks.
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
      // sync-ish existence via require of fs is fine here; use lstat later.
      // We only need to return the first that plausibly exists; caller stats it.
      // Use a synchronous existence probe via fs.statSync would break in this ESM
      // context without import, so return the first .ts guess and let the caller
      // verify with fs.stat.
      // But we need real existence — mirror correctness matters. Do a sync fs read:
      // eslint-disable-next-line no-undef
      const s = require("node:fs").statSync(c);
      if (s.isFile()) return c;
    } catch {
      /* keep trying */
    }
  }
  throw new Error(`Cannot resolve module path: ${p}`);
}

async function collectFromEntries(entries) {
  const queue = [];
  const visited = new Map(); // abs src/lib path -> source text

  for (const entry of entries) {
    const src = await fs.readFile(entry, "utf8");
    for (const spec of extractSpecifiers(src)) {
      const resolved = resolveSrcLibSpecifier(spec, entry);
      if (resolved) queue.push(resolved);
    }
  }

  while (queue.length) {
    const p = queue.shift();
    if (visited.has(p)) continue;
    const text = await fs.readFile(p, "utf8");
    visited.set(p, text);
    for (const spec of extractSpecifiers(text)) {
      const resolved = resolveSrcLibSpecifier(spec, p);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

/**
 * Rewrite the source of a mirrored file so that its imports stay valid
 * inside _shared/lib. Relative imports keep the same shape (mirror tree
 * matches src/lib tree); @/lib/* aliases become relative paths.
 */
function rewriteMirrorSource(text, srcAbs) {
  return text.replace(
    /((?:^|\n)\s*(?:import|export)(?:\s+[\s\S]*?\s+from)?\s*["'])([^"']+)(["'])/g,
    (full, pre, spec, post) => {
      if (spec.startsWith("@/lib/")) {
        const targetAbs = resolveExtension(
          path.join(SRC_LIB, spec.slice("@/lib/".length)),
        );
        const rel = relSpec(srcAbs, targetAbs);
        return pre + rel + post;
      }
      return full;
    },
  ).replace(
    /(\bimport\s*\(\s*["'])([^"']+)(["']\s*\))/g,
    (full, pre, spec, post) => {
      if (spec.startsWith("@/lib/")) {
        const targetAbs = resolveExtension(
          path.join(SRC_LIB, spec.slice("@/lib/".length)),
        );
        const rel = relSpec(srcAbs, targetAbs);
        return pre + rel + post;
      }
      return full;
    },
  );
}

function relSpec(fromSrcAbs, toSrcAbs) {
  const fromDir = path.dirname(fromSrcAbs);
  let rel = path.relative(fromDir, toSrcAbs).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

async function findEntryFiles() {
  const fnDir = FUNCTIONS;
  const entries = [];
  const dirents = await fs.readdir(fnDir, { withFileTypes: true });
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    if (d.name === "_shared") continue;
    if (d.name.startsWith(".")) continue;
    const fnPath = path.join(fnDir, d.name);
    // Include all .ts files directly under the function dir (index + tests + helpers).
    const files = await walk(fnPath);
    for (const f of files) {
      if (f.endsWith(".ts")) entries.push(f);
    }
  }
  // Also treat existing _shared/*.ts files that reach ../../../src/lib as entries
  // (they get rewritten to point at _shared/lib/*).
  const sharedFiles = await walk(path.join(fnDir, "_shared")).catch(() => []);
  for (const f of sharedFiles) {
    if (!f.endsWith(".ts")) continue;
    // Skip files inside _shared/lib itself (mirror). We rewrite the manifest below.
    if (f.startsWith(path.join(fnDir, "_shared", "lib") + path.sep)) continue;
    const text = await fs.readFile(f, "utf8");
    if (/(\.\.\/){3}src\/lib\//.test(text)) entries.push(f);
  }
  return entries;
}

function computeEntryRewrite(entryAbs, mirrorRootAbs) {
  // For an entry file, rewrite spec "../../../src/lib/X" or "@/lib/X" to a
  // relative path into _shared/lib/X.
  return (text) =>
    text
      .replace(
        /((?:^|\n)\s*(?:import|export)(?:\s+[\s\S]*?\s+from)?\s*["'])([^"']+)(["'])/g,
        (full, pre, spec, post) => {
          const rewritten = rewriteEntrySpec(spec, entryAbs, mirrorRootAbs);
          return rewritten === null ? full : pre + rewritten + post;
        },
      )
      .replace(
        /(\bimport\s*\(\s*["'])([^"']+)(["']\s*\))/g,
        (full, pre, spec, post) => {
          const rewritten = rewriteEntrySpec(spec, entryAbs, mirrorRootAbs);
          return rewritten === null ? full : pre + rewritten + post;
        },
      );
}

function rewriteEntrySpec(spec, entryAbs, mirrorRootAbs) {
  let target = null;
  if (spec.startsWith("@/lib/")) {
    target = resolveExtension(path.join(SRC_LIB, spec.slice("@/lib/".length)));
  } else if (spec.startsWith(".")) {
    const abs = path.resolve(path.dirname(entryAbs), spec);
    if (abs === SRC_LIB || abs.startsWith(SRC_LIB + path.sep)) {
      target = resolveExtension(abs);
    }
  }
  if (!target) return null;
  const relInLib = path.relative(SRC_LIB, target);
  const mirrorAbs = path.join(mirrorRootAbs, relInLib);
  let rel = path
    .relative(path.dirname(entryAbs), mirrorAbs)
    .split(path.sep)
    .join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function banner(srcRel, hash) {
  return (
    `// @generated by scripts/sync-edge-shared.mjs — DO NOT EDIT.\n` +
    `// Source: ${srcRel}\n` +
    `// sha256: ${hash}\n` +
    `// Run \`bun run sync-edge-shared\` from src/lib to regenerate.\n\n`
  );
}

async function main() {
  const outRoot = CHECK
    ? await fs.mkdtemp(path.join(os.tmpdir(), "edge-shared-"))
    : path.join(ROOT, MIRROR_REL);

  const entries = await findEntryFiles();
  const collected = await collectFromEntries(entries);

  // Prepare mirror writes.
  const mirrorFiles = new Map(); // outAbs -> content
  const sourceHashes = {};
  for (const [srcAbs, srcText] of collected) {
    const relInLib = path.relative(SRC_LIB, srcAbs);
    const outAbs = path.join(outRoot, relInLib);
    const rewritten = rewriteMirrorSource(srcText, srcAbs);
    const hash = sha256(srcText);
    const withBanner = banner(`src/lib/${relInLib.split(path.sep).join("/")}`, hash) + rewritten;
    mirrorFiles.set(outAbs, withBanner);
    sourceHashes[`src/lib/${relInLib.split(path.sep).join("/")}`] = hash;
  }

  const manifest = {
    generator: "scripts/sync-edge-shared.mjs",
    generatedAt: CHECK ? "check-mode" : new Date().toISOString().slice(0, 10),
    sourceCount: mirrorFiles.size,
    sourceHashes,
  };

  const mirrorRootAbs = path.join(ROOT, MIRROR_REL);

  if (CHECK) {
    // Compare tmp mirror to committed mirror.
    const drift = [];
    // 1. missing/mismatched mirror files.
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
    // 2. extra committed files not in generator output.
    let committedFiles = [];
    try {
      committedFiles = await walk(mirrorRootAbs);
    } catch {
      // committed mirror missing entirely.
    }
    for (const f of committedFiles) {
      const rel = path.relative(mirrorRootAbs, f);
      if (rel === ".sync-manifest.json") continue;
      const expectedAbs = path.join(outRoot, rel);
      if (!mirrorFiles.has(expectedAbs)) {
        drift.push(`STALE committed mirror: ${MIRROR_REL}/${rel} — not referenced by any entry file`);
      }
    }
    // 3. manifest.
    try {
      const committedManifest = JSON.parse(
        await fs.readFile(path.join(mirrorRootAbs, ".sync-manifest.json"), "utf8"),
      );
      // Ignore generatedAt.
      if (
        JSON.stringify(committedManifest.sourceHashes) !==
        JSON.stringify(sourceHashes)
      ) {
        drift.push("DRIFT: .sync-manifest.json sourceHashes differ");
      }
    } catch {
      drift.push("MISSING .sync-manifest.json");
    }
    // 4. Entry files must not still contain ../../../src/lib/ references.
    for (const entry of entries) {
      const text = await fs.readFile(entry, "utf8");
      if (/(\.\.\/){3}src\/lib\//.test(text) || /@\/lib\//.test(text)) {
        drift.push(
          `ENTRY not rewritten: ${path.relative(ROOT, entry)} still imports src/lib directly`,
        );
      }
    }
    if (drift.length) {
      console.error("Edge shared-lib mirror is out of sync:\n");
      for (const d of drift) console.error("  - " + d);
      console.error(
        "\nRun `bun run sync-edge-shared` and commit the result.",
      );
      process.exit(1);
    }
    console.log(`OK — ${mirrorFiles.size} mirrored files in sync with src/lib.`);
    return;
  }

  // Write mode: nuke existing mirror, then write fresh.
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

  // Rewrite entry files (in place).
  let rewrittenCount = 0;
  for (const entry of entries) {
    const before = await fs.readFile(entry, "utf8");
    const after = computeEntryRewrite(entry, mirrorRootAbs)(before);
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
