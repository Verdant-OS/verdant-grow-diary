// Pure helpers for the Verdant batched Vitest runner.
// No I/O, no side effects, no test skipping. Deterministic.

/**
 * Supported batching strategies.
 * - "contiguous": even-ish adjacent slices of the sorted file list (default,
 *   backward compatible).
 * - "round-robin": deal files across batches by index modulo N, so
 *   alphabetically clustered files (e.g. the heavy `ecowitt-*` jsdom suite)
 *   are spread across batches instead of piling into one slice.
 */
export const BATCH_STRATEGIES = Object.freeze(["contiguous", "round-robin"]);

/**
 * Vitest worker pools accepted by `--pool`. Validated so a typo fails fast
 * instead of silently falling back.
 */
export const VITEST_POOLS = Object.freeze(["forks", "threads", "vmForks", "vmThreads"]);

/**
 * Deterministically sort test file paths (ascending, locale-independent).
 * @param {string[]} files
 * @returns {string[]}
 */
export function sortTestFiles(files) {
  if (!Array.isArray(files)) {
    throw new TypeError("sortTestFiles: files must be an array");
  }
  return [...files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Split a sorted list into N even-ish batches using the given strategy.
 *
 * - "contiguous" (default): adjacent slices; earlier batches get the extra
 *   item when not evenly divisible. Preserves the original behavior.
 * - "round-robin": file index `i` goes to batch `i % n`. Each batch stays
 *   internally ascending because the pre-sorted list is dealt in order.
 *
 * In both strategies the batch count is clamped to the file count so no
 * empty batches are produced (an empty batch would make Vitest error with
 * "no test files found").
 *
 * @param {string[]} files - pre-sorted array
 * @param {number} batches - integer >= 1
 * @param {"contiguous"|"round-robin"} [strategy="contiguous"]
 * @returns {string[][]}
 */
export function splitIntoBatches(files, batches, strategy = "contiguous") {
  if (!Array.isArray(files)) {
    throw new TypeError("splitIntoBatches: files must be an array");
  }
  if (!Number.isInteger(batches) || batches < 1) {
    throw new RangeError("splitIntoBatches: batches must be a positive integer");
  }
  if (files.length === 0) {
    throw new RangeError("splitIntoBatches: no test files to split");
  }
  if (!BATCH_STRATEGIES.includes(strategy)) {
    throw new RangeError(
      `splitIntoBatches: unknown strategy "${strategy}" ` +
        `(expected one of: ${BATCH_STRATEGIES.join(", ")})`,
    );
  }
  const n = Math.min(batches, files.length);

  if (strategy === "round-robin") {
    const out = Array.from({ length: n }, () => []);
    for (let i = 0; i < files.length; i++) {
      out[i % n].push(files[i]);
    }
    return out;
  }

  // contiguous (default)
  const base = Math.floor(files.length / n);
  const remainder = files.length % n;
  const out = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < remainder ? 1 : 0);
    out.push(files.slice(cursor, cursor + size));
    cursor += size;
  }
  return out;
}

/**
 * Split a sorted list into N round-robin batches.
 * File at index i goes to batch (i % N). Spreads heavy/light files evenly.
 * @param {string[]} files - pre-sorted array
 * @param {number} batches - integer >= 1
 * @returns {string[][]}
 */
export function splitIntoBatchesRoundRobin(files, batches) {
  if (!Array.isArray(files)) {
    throw new TypeError("splitIntoBatchesRoundRobin: files must be an array");
  }
  if (!Number.isInteger(batches) || batches < 1) {
    throw new RangeError("splitIntoBatchesRoundRobin: batches must be a positive integer");
  }
  if (files.length === 0) {
    throw new RangeError("splitIntoBatchesRoundRobin: no test files to split");
  }
  const n = Math.min(batches, files.length);
  const out = Array.from({ length: n }, () => []);
  for (let i = 0; i < files.length; i++) {
    out[i % n].push(files[i]);
  }
  return out;
}

/**
 * Return the slice for a specific 0-indexed batch under the given strategy.
 * @param {string[]} files
 * @param {number} batches
 * @param {number} batchIndex
 * @param {"contiguous"|"round-robin"} [strategy="contiguous"]
 * @returns {string[]}
 */
export function selectBatch(files, batches, batchIndex, strategy = "contiguous") {
  if (!Number.isInteger(batchIndex) || batchIndex < 0) {
    throw new RangeError("selectBatch: batchIndex must be a non-negative integer");
  }
  const split =
    strategy === "round-robin"
      ? splitIntoBatchesRoundRobin(files, batches)
      : splitIntoBatches(files, batches);
  if (batchIndex >= split.length) {
    throw new RangeError(
      `selectBatch: batchIndex ${batchIndex} out of range (have ${split.length} batches)`,
    );
  }
  return split[batchIndex];
}

/**
 * Split a list of files into contiguous chunks of at most `chunkSize`.
 * Preserves order. If chunkSize >= files.length, returns one chunk.
 * @param {string[]} files
 * @param {number} chunkSize - positive integer
 * @returns {string[][]}
 */
export function splitIntoChunks(files, chunkSize) {
  if (!Array.isArray(files)) {
    throw new TypeError("splitIntoChunks: files must be an array");
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError("splitIntoChunks: chunkSize must be a positive integer");
  }
  if (files.length === 0) return [];
  const out = [];
  for (let i = 0; i < files.length; i += chunkSize) {
    out.push(files.slice(i, i + chunkSize));
  }
  return out;
}

/**
 * Back-compat alias for splitIntoChunks. Some callers/tests import `chunkArray`
 * (the original Worker Isolation v1 name); behavior is identical — split a list
 * into contiguous chunks of at most `chunkSize`. Restored after a merge from
 * `verdant-grow-diary` dropped the export and broke the batch-utils self-test.
 */
export const chunkArray = splitIntoChunks;

/**
 * Parse simple --key=value / --flag CLI args. No side effects.
 * @param {string[]} argv
 */
export function parseBatchArgs(argv) {
  const out = {
    batches: 8,
    batch: null,
    reporter: "dot",
    continueOnFail: false,
    strategy: "contiguous",
    chunkSize: null,
    isolate: false,
    pool: null,
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    const key = eq === -1 ? raw.slice(2) : raw.slice(2, eq);
    const val = eq === -1 ? "true" : raw.slice(eq + 1);
    switch (key) {
      case "batches": {
        const n = Number.parseInt(val, 10);
        if (!Number.isInteger(n) || n < 1) {
          throw new RangeError(`--batches must be a positive integer (got ${val})`);
        }
        out.batches = n;
        break;
      }
      case "batch": {
        const n = Number.parseInt(val, 10);
        if (!Number.isInteger(n) || n < 0) {
          throw new RangeError(`--batch must be a non-negative integer (got ${val})`);
        }
        out.batch = n;
        break;
      }
      case "reporter":
        out.reporter = val;
        break;
      case "strategy": {
        if (!BATCH_STRATEGIES.includes(val)) {
          throw new RangeError(
            `--strategy must be one of: ${BATCH_STRATEGIES.join(", ")} (got ${val})`,
          );
        }
        out.strategy = val;
        break;
      }
      case "chunk-size": {
        const n = Number.parseInt(val, 10);
        if (!Number.isInteger(n) || n < 1) {
          throw new RangeError(`--chunk-size must be a positive integer (got ${val})`);
        }
        out.chunkSize = n;
        break;
      }
      case "isolate":
        out.isolate = val === "true" || val === "1";
        break;
      case "pool": {
        if (!VITEST_POOLS.includes(val)) {
          throw new RangeError(`--pool must be one of: ${VITEST_POOLS.join(", ")} (got ${val})`);
        }
        out.pool = val;
        break;
      }
      case "continue-on-fail":
        out.continueOnFail = val === "true" || val === "1";
        break;
      default:
        // Ignore unknown flags so Vitest forwarding can be layered later.
        break;
    }
  }
  return out;
}
