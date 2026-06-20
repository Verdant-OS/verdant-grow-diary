/**
 * Cached recursive text scan helper for static-safety vitest specs.
 *
 * Purpose: several static-safety tests (notably the pi-ingest secret
 * resolution and server-secret resolver implementation-plan guards)
 * walk the entire `src/` tree and read every .ts/.tsx file multiple
 * times per run. Under sharded full-suite execution this filesystem
 * pressure is enough to push individual tests past Vitest's default
 * timeout — even though every assertion passes deterministically in
 * isolation.
 *
 * This helper keeps the *exact* coverage (same roots, same file
 * extensions, same skipped directories) but memoizes the file list
 * and file contents on `globalThis`, so repeated calls within the
 * same vitest worker reuse the work. It does not change which files
 * are scanned, does not weaken assertions, and never swallows errors.
 *
 * Skip rules mirror the original inline walkers:
 *   - node_modules
 *   - .git
 *   - dist
 *   - coverage
 *   - build
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "build"]);

type Cache = {
  files: Map<string, string[]>;
  text: Map<string, string>;
};

function getCache(): Cache {
  const g = globalThis as unknown as { __verdantSrcScanCache?: Cache };
  if (!g.__verdantSrcScanCache) {
    g.__verdantSrcScanCache = { files: new Map(), text: new Map() };
  }
  return g.__verdantSrcScanCache;
}

/**
 * Recursively list every file under `root`, skipping known heavy
 * directories. Cached per-root for the lifetime of the worker.
 */
export function listFilesCached(root: string): string[] {
  const cache = getCache();
  const cached = cache.files.get(root);
  if (cached) return cached;

  const acc: string[] = [];
  if (existsSync(root)) {
    const stack: string[] = [root];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const p = resolve(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) stack.push(p);
        else acc.push(p);
      }
    }
  }
  cache.files.set(root, acc);
  return acc;
}

/**
 * Convenience: list all .ts / .tsx files under `root`.
 */
export function listTsFilesCached(root: string): string[] {
  return listFilesCached(root).filter((p) => /\.(ts|tsx)$/.test(p));
}

/**
 * Read a file as utf8, memoized per absolute path.
 */
export function readFileCached(path: string): string {
  const cache = getCache();
  const cached = cache.text.get(path);
  if (cached !== undefined) return cached;
  const text = readFileSync(path, "utf8");
  cache.text.set(path, text);
  return text;
}
