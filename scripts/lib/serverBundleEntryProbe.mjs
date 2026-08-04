/**
 * serverBundleEntryProbe
 *
 * Single source of truth for locating the built SSR server bundle used by the
 * postbuild SEO stage. The Nitro/Vite output layout has moved between
 * `.output/server/index.mjs` and `<dist>/server/index.mjs`, so both locations
 * are probed. Callers get the full probe table so a BLOCKED failure can show
 * exactly what was checked and how the expected path was derived.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * @param {string} distDir absolute or relative dist directory
 * @param {string | undefined} explicitEntry optional explicit override path
 * @returns {{ candidates: Array<{ path: string, source: string, exists: boolean }>, entry: string | null }}
 */
export function probeServerBundleEntry(distDir, explicitEntry) {
  const absoluteDist = resolve(distDir ?? "dist");
  const raw = [
    explicitEntry
      ? { path: explicitEntry, source: "explicit argument (argv[3] / caller override)" }
      : null,
    {
      path: join(absoluteDist, "server", "index.mjs"),
      source: `current Vite/Nitro layout (<dist>/server/index.mjs, dist=${absoluteDist})`,
    },
    {
      path: ".output/server/index.mjs",
      source: "legacy Nitro layout (.output/server/index.mjs, relative to cwd)",
    },
  ].filter(Boolean);

  const candidates = raw.map((candidate) => {
    const absolute = resolve(candidate.path);
    return { path: absolute, source: candidate.source, exists: existsSync(absolute) };
  });

  const found = candidates.find((candidate) => candidate.exists);
  return { candidates, entry: found ? found.path : null };
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
    ? `${prefix}: resolved server bundle -> ${probe.entry}`
    : `${prefix}: BLOCKED — no server bundle found at any probed location.`;
  return [`${prefix}: probed server bundle locations (in order):`, ...lines, resolution].join("\n");
}
