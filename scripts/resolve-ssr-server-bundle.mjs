#!/usr/bin/env node
/**
 * Resolve the Nitro / SSR server bundle for postbuild snapshot capture.
 *
 * Current Nitro (TanStack Start) emits:  .output/server/index.mjs
 * Legacy layout (if present):            dist/server/index.mjs
 *
 * Prefer an explicit CLI / env override, then the current Nitro path,
 * then the legacy dist path. Never treat a directory as a bundle.
 */
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** @typedef {{ ok: true, path: string, source: string } | { ok: false, checked: string[], reason: string }} ResolveResult */

/**
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string} [options.explicitPath] - CLI/env override
 * @param {string} [options.distDir] - legacy dist root (default: dist)
 * @returns {ResolveResult}
 */
export function resolveSsrServerBundle(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const distDir = resolve(cwd, options.distDir ?? "dist");
  const candidates = [];

  if (options.explicitPath) {
    candidates.push({
      path: resolve(cwd, options.explicitPath),
      source: "explicit",
    });
  }

  candidates.push(
    { path: resolve(cwd, ".output/server/index.mjs"), source: "nitro_output" },
    { path: resolve(distDir, "server/index.mjs"), source: "legacy_dist" },
  );

  const checked = [];
  for (const { path: filePath, source } of candidates) {
    checked.push(filePath);
    if (!existsSync(filePath)) continue;
    let st;
    try {
      st = statSync(filePath);
    } catch {
      continue;
    }
    if (!st.isFile()) {
      return {
        ok: false,
        checked,
        reason: `path exists but is not a file: ${filePath}`,
      };
    }
    return { ok: true, path: filePath, source };
  }

  return {
    ok: false,
    checked,
    reason: "no SSR server bundle found at any known path",
  };
}

// CLI: print resolved path or exit 1 with checked list
if (
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))
) {
  // only run when executed directly — vitest imports skip this via fragile check
}

export function formatBlockedMessage(result) {
  if (result.ok) return "";
  const lines = [
    `resolve-ssr-server-bundle: BLOCKED — ${result.reason}`,
    "Checked:",
    ...result.checked.map((p) => `  - ${p}`),
  ];
  return lines.join("\n");
}
