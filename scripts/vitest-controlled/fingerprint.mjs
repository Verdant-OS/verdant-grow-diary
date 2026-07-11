// Source fingerprint for resume safety.
//
// Rules:
//   * Fingerprint must change when any input that affects test outcomes
//     changes, but must NOT include secrets or source contents.
//   * We hash: manifest hash, vitest.config.ts bytes, package.json bytes,
//     bun.lock/bun.lockb bytes (if present), shard settings, worker settings,
//     pool, reporter schema version.
//   * We do NOT record source file contents in the artifact — only a
//     single aggregated dirty-tree hash so resume can detect drift.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const FINGERPRINT_SCHEMA_VERSION = 1;

function hashFileIfExists(hash, absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (stat.isFile()) {
      const bytes = fs.readFileSync(absPath);
      hash.update(`${path.basename(absPath)}:${bytes.length}:`);
      hash.update(crypto.createHash("sha256").update(bytes).digest());
      return true;
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  hash.update(`${path.basename(absPath)}:absent:`);
  return false;
}

/** Aggregate hash of every test source file in the manifest (contents,
 *  but only the digest is retained — file bodies are never stored).
 */
export function computeDirtyTreeHash(repoRoot, manifestFiles) {
  const h = crypto.createHash("sha256");
  h.update(`dirty-tree:v${FINGERPRINT_SCHEMA_VERSION}\n`);
  for (const rel of manifestFiles) {
    const abs = path.resolve(repoRoot, rel);
    h.update(`${rel}:`);
    try {
      const bytes = fs.readFileSync(abs);
      h.update(crypto.createHash("sha256").update(bytes).digest());
    } catch (err) {
      if (err.code === "ENOENT") {
        h.update("MISSING");
      } else {
        throw err;
      }
    }
    h.update("\n");
  }
  return h.digest("hex");
}

/** Compute a full source fingerprint for a run configuration. */
export function computeSourceFingerprint(repoRoot, params) {
  const {
    manifestHash,
    shardIndex,
    shardTotal,
    batchSize,
    maxWorkers,
    minWorkers,
    pool,
    reporterSchemaVersion,
  } = params;
  const h = crypto.createHash("sha256");
  h.update(`v${FINGERPRINT_SCHEMA_VERSION}\n`);
  h.update(`manifest:${manifestHash}\n`);
  h.update(`shard:${shardIndex}/${shardTotal}\n`);
  h.update(`batch:${batchSize}\n`);
  h.update(`workers:${minWorkers}-${maxWorkers}\n`);
  h.update(`pool:${pool}\n`);
  h.update(`reporterSchema:${reporterSchemaVersion}\n`);
  hashFileIfExists(h, path.resolve(repoRoot, "vitest.config.ts"));
  hashFileIfExists(h, path.resolve(repoRoot, "package.json"));
  hashFileIfExists(h, path.resolve(repoRoot, "bun.lock"));
  hashFileIfExists(h, path.resolve(repoRoot, "bun.lockb"));
  return h.digest("hex");
}

/** Compare a stored fingerprint with a freshly computed one. Returns
 *  null on match or a human-readable diff summary otherwise.
 */
export function fingerprintMismatch(previous, current) {
  if (previous === current) return null;
  return `fingerprint drift: previous=${previous.slice(0, 12)}… current=${current.slice(0, 12)}…`;
}
