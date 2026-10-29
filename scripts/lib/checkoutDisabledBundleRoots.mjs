/**
 * checkoutDisabledBundleRoots
 *
 * Locates the built client and server bundle directories the checkout-disabled
 * rollback verifier scans. The Nitro/Vite output layout has moved between
 * `.output/{public,server}` and `<dist>/{client,server}` (see
 * serverBundleEntryProbe.mjs), so the layout is detected rather than assumed:
 *
 *   1. `publicDir` / `serverEntry` declared by the build's own nitro.json
 *   2. conventional layouts, as a last resort
 *
 * Only directories that exist on disk are returned, each once, in probe order.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string} cwd repository root the build ran in
 * @returns {Array<{ path: string, source: string }>} existing bundle roots, in probe order
 */
export function discoverBundleRoots(cwd = process.cwd()) {
  const raw = [];

  for (const nitroJsonPath of [
    resolve(cwd, ".output", "nitro.json"),
    resolve(cwd, "dist", "nitro.json"),
    resolve(cwd, ".vercel", "output", "nitro.json"),
  ]) {
    const nitro = readJson(nitroJsonPath);
    if (!nitro) continue;
    const base = dirname(nitroJsonPath);
    const resolveDeclared = (value) => (isAbsolute(value) ? value : join(base, value));
    if (typeof nitro.publicDir === "string") {
      raw.push({
        path: resolveDeclared(nitro.publicDir),
        source: `nitro.json publicDir="${nitro.publicDir}" (from ${nitroJsonPath})`,
      });
    }
    if (typeof nitro.serverEntry === "string") {
      raw.push({
        path: dirname(resolveDeclared(nitro.serverEntry)),
        source: `nitro.json serverEntry="${nitro.serverEntry}" (from ${nitroJsonPath})`,
      });
    }
  }

  for (const [relative, label] of [
    [[".output", "public"], "conventional legacy Nitro layout"],
    [[".output", "server"], "conventional legacy Nitro layout"],
    [["dist", "client"], "conventional Vite/Nitro layout"],
    [["dist", "server"], "conventional Vite/Nitro layout"],
    [[".vercel", "output", "static"], "conventional Vercel Nitro layout"],
    [[".vercel", "output", "server"], "conventional Vercel Nitro layout"],
  ]) {
    raw.push({ path: resolve(cwd, ...relative), source: `${label} (${relative.join("/")})` });
  }

  const seen = new Set();
  const roots = [];
  for (const candidate of raw) {
    const absolute = resolve(candidate.path);
    if (seen.has(absolute) || !isDirectory(absolute)) continue;
    seen.add(absolute);
    roots.push({ path: absolute, source: candidate.source });
  }
  return roots;
}
