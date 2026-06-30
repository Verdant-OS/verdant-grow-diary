// Pure helpers for the Verdant batched Vitest runner.
// No I/O, no side effects, no test skipping. Deterministic.

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
 * Split a sorted list into N contiguous, even-ish batches.
 * Earlier batches get the extra item when not evenly divisible.
 * @param {string[]} files - pre-sorted array
 * @param {number} batches - integer >= 1
 * @returns {string[][]}
 */
export function splitIntoBatches(files, batches) {
  if (!Array.isArray(files)) {
    throw new TypeError("splitIntoBatches: files must be an array");
  }
  if (!Number.isInteger(batches) || batches < 1) {
    throw new RangeError("splitIntoBatches: batches must be a positive integer");
  }
  if (files.length === 0) {
    throw new RangeError("splitIntoBatches: no test files to split");
  }
  const n = Math.min(batches, files.length);
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
    throw new RangeError(
      "splitIntoBatchesRoundRobin: batches must be a positive integer",
    );
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
      case "continue-on-fail":
        out.continueOnFail = val === "true" || val === "1";
        break;
      case "strategy": {
        if (val !== "contiguous" && val !== "round-robin") {
          throw new RangeError(
            `--strategy must be "contiguous" or "round-robin" (got ${val})`,
          );
        }
        out.strategy = val;
        break;
      }
      case "chunk-size": {
        const n = Number.parseInt(val, 10);
        if (!Number.isInteger(n) || n < 1) {
          throw new RangeError(
            `--chunk-size must be a positive integer (got ${val})`,
          );
        }
        out.chunkSize = n;
        break;
      }
      case "isolate":
        out.isolate = val === "true" || val === "1";
        break;
      case "pool": {
        if (val !== "forks" && val !== "threads" && val !== "vmThreads") {
          throw new RangeError(
            `--pool must be "forks", "threads", or "vmThreads" (got ${val})`,
          );
        }
        out.pool = val;
        break;
      }
      default:
        // Ignore unknown flags so Vitest forwarding can be layered later.
        break;
    }
  }
  return out;
}
