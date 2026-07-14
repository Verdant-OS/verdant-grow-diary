// Deterministic sharding for the controlled Vitest runner.
//
// Contract:
//   * 1-based shard numbers ("--shard 1/16")
//   * Union of all shards == manifest (exact coverage)
//   * Pairwise intersection == empty
//   * Membership is stable across runs when the manifest is unchanged
//   * Invalid inputs fail closed with descriptive errors
//   * Shard count is part of the run fingerprint (see fingerprint.mjs)
import crypto from "node:crypto";

/** Parse "1/16" style shard specifier. */
export function parseShardSpec(spec) {
  if (typeof spec !== "string") {
    throw new Error(`Invalid shard spec (not a string): ${String(spec)}`);
  }
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(spec);
  if (!match) throw new Error(`Invalid shard spec: "${spec}" (expected "N/M")`);
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    total < 1 ||
    index < 1 ||
    index > total
  ) {
    throw new Error(`Invalid shard spec: "${spec}" (index=${index}, total=${total})`);
  }
  return { index, total };
}

/** Contiguous, ordered slice assignment — matches Vitest's own scheme
 *  but is computed locally so we can persist exact membership.
 */
export function assignShard(files, index, total) {
  if (!Array.isArray(files)) throw new Error("files must be an array");
  if (total < 1) throw new Error("shard total must be >= 1");
  if (index < 1 || index > total) throw new Error(`shard index ${index} out of range 1..${total}`);
  const n = files.length;
  const start = Math.floor(((index - 1) * n) / total);
  const end = Math.floor((index * n) / total);
  return files.slice(start, end);
}

/** Compute every shard's membership (for coverage validation). */
export function assignAllShards(files, total) {
  const out = [];
  for (let i = 1; i <= total; i++) out.push(assignShard(files, i, total));
  return out;
}

/** Split an ordered file list into bounded batches. Stable, no shuffle. */
export function splitIntoBatches(files, batchSize) {
  if (!Array.isArray(files)) throw new Error("files must be an array");
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`invalid batch size: ${batchSize}`);
  }
  const out = [];
  for (let i = 0; i < files.length; i += batchSize) {
    out.push(files.slice(i, i + batchSize));
  }
  return out;
}

/** Prove all-shards coverage: exact union, empty pairwise intersections. */
export function assertShardCoverage(manifestFiles, shards) {
  const expected = new Set(manifestFiles);
  const seen = new Set();
  const dupes = [];
  for (const shard of shards) {
    for (const f of shard) {
      if (seen.has(f)) dupes.push(f);
      seen.add(f);
    }
  }
  if (dupes.length) {
    throw new Error(`Shard membership overlap: ${dupes.slice(0, 5).join(", ")}`);
  }
  const missing = [...expected].filter((f) => !seen.has(f));
  const extra = [...seen].filter((f) => !expected.has(f));
  if (missing.length)
    throw new Error(`Shard coverage missing files: ${missing.slice(0, 5).join(", ")}`);
  if (extra.length) throw new Error(`Shard coverage extra files: ${extra.slice(0, 5).join(", ")}`);
  return true;
}

/** Fingerprint component contribution for a shard configuration. */
export function shardFingerprint(index, total, manifestHash) {
  return crypto
    .createHash("sha256")
    .update(`shard:${index}/${total}:${manifestHash}`)
    .digest("hex");
}
