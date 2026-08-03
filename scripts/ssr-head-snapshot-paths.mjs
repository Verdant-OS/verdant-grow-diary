import { join, resolve } from "node:path";

export function resolveSsrHeadSnapshotPaths(distArg = "dist", serverEntryArg, cwd = process.cwd()) {
  const distDir = resolve(cwd, distArg);
  const serverEntry = resolve(cwd, serverEntryArg ?? join(".output", "server", "index.mjs"));

  return {
    distDir,
    serverEntry,
    manifestPath: join(distDir, "seo-manifest.json"),
  };
}
