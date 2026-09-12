/**
 * serverBundleEntryProbe
 *
 * Single source of truth for locating the built SSR server bundle used by the
 * postbuild SEO stage. The Nitro/Vite output layout has moved between
 * `.output/server/index.mjs`, `<dist>/server/index.mjs`, and the Vercel Nitro
 * preset's `.vercel/output/` tree, so the path is detected automatically rather
 * than hard-coded:
 *
 *   1. explicit override (argv / SEO_SERVER_BUNDLE_ENTRY)
 *   2. `serverEntry` declared by the build itself in nitro.json
 *   3. `main` declared by the emitted wrangler.json (worker presets)
 *   4. known conventional layouts, as a last resort
 *
 * Callers get the full probe table so a BLOCKED failure can show exactly what
 * was checked and how each expected path was derived. Detection never guesses
 * past a missing file: a location is only used when it exists on disk.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Candidates declared by the build output itself (nitro.json / wrangler.json).
 * These are authoritative for the preset that actually ran, so they are probed
 * before the conventional fallbacks.
 *
 * @param {string} absoluteDist
 * @returns {Array<{ path: string, source: string }>}
 */
function detectDeclaredCandidates(absoluteDist) {
  const detected = [];

  for (const nitroJsonPath of [
    join(absoluteDist, "nitro.json"),
    resolve(".output", "nitro.json"),
    // Vercel TanStack Start / Nitro preset writes nitro.json under Build Output API.
    resolve(".vercel", "output", "nitro.json"),
  ]) {
    const nitro = readJson(nitroJsonPath);
    const serverEntry = typeof nitro?.serverEntry === "string" ? nitro.serverEntry : null;
    if (!serverEntry) continue;
    const base = dirname(nitroJsonPath);
    detected.push({
      path: isAbsolute(serverEntry) ? serverEntry : join(base, serverEntry),
      source: `nitro.json serverEntry="${serverEntry}" (preset=${nitro.preset ?? "unknown"}, from ${nitroJsonPath})`,
    });
  }

  for (const wranglerJsonPath of [
    join(absoluteDist, "server", "wrangler.json"),
    resolve(".output", "server", "wrangler.json"),
    resolve(".vercel", "output", "server", "wrangler.json"),
    resolve(".vercel", "output", "wrangler.json"),
  ]) {
    const wrangler = readJson(wranglerJsonPath);
    const main = typeof wrangler?.main === "string" ? wrangler.main : null;
    if (!main) continue;
    const base = dirname(wranglerJsonPath);
    detected.push({
      path: isAbsolute(main) ? main : join(base, main),
      source: `wrangler.json main="${main}" (worker entry, from ${wranglerJsonPath})`,
    });
  }

  return detected;
}

/**
 * @param {string} distDir absolute or relative dist directory
 * @param {string | undefined} explicitEntry optional explicit override path
 * @returns {{ candidates: Array<{ path: string, source: string, exists: boolean }>, entry: string | null, detectedFrom: string | null }}
 */
export function probeServerBundleEntry(distDir, explicitEntry) {
  const absoluteDist = resolve(distDir ?? "dist");
  const raw = [
    explicitEntry
      ? {
          path: explicitEntry,
          source: "explicit override (argv[3] / SEO_SERVER_BUNDLE_ENTRY)",
        }
      : null,
    ...detectDeclaredCandidates(absoluteDist),
    {
      path: join(absoluteDist, "server", "index.mjs"),
      source: `conventional Vite/Nitro layout (<dist>/server/index.mjs, dist=${absoluteDist})`,
    },
    {
      path: resolve(".output", "server", "index.mjs"),
      source: "conventional legacy Nitro layout (.output/server/index.mjs, relative to cwd)",
    },
    {
      path: resolve(".vercel", "output", "server", "index.mjs"),
      source: "conventional Vercel Nitro layout (.vercel/output/server/index.mjs, relative to cwd)",
    },
  ].filter(Boolean);

  // Preserve probe order while dropping duplicate absolute paths, so a
  // declared entry that matches the conventional layout is reported once.
  const seen = new Set();
  const candidates = [];
  for (const candidate of raw) {
    const absolute = resolve(candidate.path);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    candidates.push({ path: absolute, source: candidate.source, exists: existsSync(absolute) });
  }

  const found = candidates.find((candidate) => candidate.exists);
  return {
    candidates,
    entry: found ? found.path : null,
    detectedFrom: found ? found.source : null,
  };
}

/**
 * Human-readable probe table. Used both for the informational log line before
 * capture and for the BLOCKED diagnostic when nothing resolved.
 *
 * @param {ReturnType<typeof probeServerBundleEntry>} probe
 * @param {string} prefix log-line prefix (script name)
 */
export function formatServerBundleProbe(probe, prefix) {
  const lines = probe.candidates.map(
    (candidate, index) =>
      `  ${index + 1}. [${candidate.exists ? "FOUND  " : "MISSING"}] ${candidate.path}\n` +
      `       resolved from: ${candidate.source}`,
  );
  const resolution = probe.entry
    ? `${prefix}: resolved server bundle -> ${probe.entry}\n       detected via: ${probe.detectedFrom}`
    : `${prefix}: BLOCKED — no server bundle found at any probed location.`;

  return [`${prefix}: probed server bundle locations (in order):`, ...lines, resolution].join("\n");
}
