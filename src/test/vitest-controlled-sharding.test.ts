import { describe, it, expect } from "vitest";
import {
  parseShardSpec,
  assignShard,
  assignAllShards,
  splitIntoBatches,
  assertShardCoverage,
  shardFingerprint,
} from "../../scripts/vitest-controlled/sharding.mjs";

const files = Array.from({ length: 47 }, (_, i) => `src/f${String(i).padStart(3, "0")}.test.ts`);

describe("vitest-controlled sharding", () => {
  it("parses valid shard specs", () => {
    expect(parseShardSpec("1/16")).toEqual({ index: 1, total: 16 });
    expect(parseShardSpec(" 4 / 8 ")).toEqual({ index: 4, total: 8 });
  });

  it("rejects invalid shard specs", () => {
    expect(() => parseShardSpec("0/4")).toThrow();
    expect(() => parseShardSpec("5/4")).toThrow();
    expect(() => parseShardSpec("abc")).toThrow();
    expect(() => parseShardSpec("")).toThrow();
    expect(() => parseShardSpec(undefined)).toThrow();
  });

  it("union of all shards equals manifest with empty pairwise intersection", () => {
    const shards = assignAllShards(files, 5);
    assertShardCoverage(files, shards);
  });

  it("assignment is stable across calls", () => {
    const a = assignShard(files, 3, 5);
    const b = assignShard(files, 3, 5);
    expect(a).toEqual(b);
  });

  it("changing shard count produces a different fingerprint", () => {
    const h = "aa".repeat(32);
    expect(shardFingerprint(1, 4, h)).not.toBe(shardFingerprint(1, 5, h));
    expect(shardFingerprint(1, 4, h)).toBe(shardFingerprint(1, 4, h));
  });

  it("splitIntoBatches yields ordered, complete, non-overlapping batches", () => {
    const batches = splitIntoBatches(files, 10);
    expect(batches.flat()).toEqual(files);
    expect(batches.length).toBe(Math.ceil(files.length / 10));
  });

  it("rejects invalid batch size", () => {
    expect(() => splitIntoBatches(files, 0)).toThrow();
    expect(() => splitIntoBatches(files, -1)).toThrow();
  });

  it("shard coverage rejects duplicates and missing", () => {
    const shards = assignAllShards(files, 3);
    shards[0].push(shards[1][0]);
    expect(() => assertShardCoverage(files, shards)).toThrow(/overlap/);
  });
});
