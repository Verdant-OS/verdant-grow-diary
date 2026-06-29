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
 * Return the slice for a specific 0-indexed batch.
 * @param {string[]} files - pre-sorted array
 * @param {number} batches
 * @param {number} batchIndex - 0-indexed
 * @returns {string[]}
 */
export function selectBatch(files, batches, batchIndex) {
  if (!Number.isInteger(batchIndex) || batchIndex < 0) {
    throw new RangeError("selectBatch: batchIndex must be a non-negative integer");
  }
  const split = splitIntoBatches(files, batches);
  if (batchIndex >= split.length) {
    throw new RangeError(
      `selectBatch: batchIndex ${batchIndex} out of range (have ${split.length} batches)`,
    );
  }
  return split[batchIndex];
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
      default:
        // Ignore unknown flags so Vitest forwarding can be layered later.
        break;
    }
  }
  return out;
}
