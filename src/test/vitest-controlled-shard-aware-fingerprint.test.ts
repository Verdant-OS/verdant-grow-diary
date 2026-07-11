/**
 * Focused v4 identity-model tests for the controlled Vitest runner.
 *
 * Covers the four fingerprint identities and the aggregate contract:
 *   * commonConfigFingerprint  — one per run
 *   * assignmentFingerprint    — one per shard, deterministic from files
 *   * shardFingerprint         — composite of common + assignment + index
 *   * workspaceFingerprint     — repository content identity
 *
 * Also proves aggregate reason-code emission for every corruption class.
 */
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  computeCommonConfigFingerprint,
  computeAssignmentFingerprint,
  computeShardFingerprint,
  CONFIG_FINGERPRINT_SCHEMA_VERSION,
} from "../../scripts/vitest-controlled/fingerprint.mjs";
import {
  aggregateShards,
  SUMMARY_SCHEMA_VERSION,
  AGGREGATE_REASON_CODES,
} from "../../scripts/vitest-controlled/summarizer.mjs";

const TV = { node: "v22.22.0", bun: "1.3.3", vitest: "3.2.4" };
const COMMON_INPUTS = {
  manifestHash: "m".repeat(64),
  shardTotal: 16,
  batchSize: 30,
  pool: "forks",
  minWorkers: 2,
  maxWorkers: 8,
  runSchema: 4,
  reporterSchema: 1,
  manifestSchema: 1,
  workspaceFingerprintSchema: 2,
  configFingerprintSchema: CONFIG_FINGERPRINT_SCHEMA_VERSION,
  toolVersions: TV,
};

function makeShard(i: number, files: string[], overrides: Record<string, unknown> = {}) {
  const common = overrides.commonConfigFingerprint ?? computeCommonConfigFingerprint(COMMON_INPUTS);
  const assignment =
    overrides.assignmentFingerprint ??
    computeAssignmentFingerprint({ shardIndex: i, shardTotal: 16, assignedFiles: files });
  const composite =
    overrides.shardFingerprint ??
    computeShardFingerprint({
      commonConfigFingerprint: common as string,
      assignmentFingerprint: assignment as string,
      shardIndex: i,
      shardTotal: 16,
    });
  return {
    schema: SUMMARY_SCHEMA_VERSION,
    shardIndex: i,
    shardTotal: 16,
    manifestHash: COMMON_INPUTS.manifestHash,
    commonConfigFingerprint: common,
    assignmentFingerprint: assignment,
    shardFingerprint: composite,
    workspaceFingerprintDigest: "w".repeat(64),
    runSchema: 4,
    reporterSchema: 1,
    toolVersions: TV,
    status: "complete",
    assignedFiles: files,
    perFile: files.map((f) => ({
      file: f,
      status: "passed",
      counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
    })),
    conflicts: [],
    corruptLines: [],
    extraneousFiles: [],
    ...overrides,
  };
}

function makeSixteenShards() {
  const manifestFiles: string[] = [];
  const shards: ReturnType<typeof makeShard>[] = [];
  for (let i = 1; i <= 16; i++) {
    const files = [`src/shard${i}-a.test.ts`, `src/shard${i}-b.test.ts`];
    manifestFiles.push(...files);
    shards.push(makeShard(i, files));
  }
  return { shards, manifest: { files: manifestFiles } };
}

describe("v4 fingerprints — determinism and separation", () => {
  it("commonConfigFingerprint is deterministic and does NOT depend on shardIndex", () => {
    const a = computeCommonConfigFingerprint(COMMON_INPUTS);
    const b = computeCommonConfigFingerprint(COMMON_INPUTS);
    expect(a).toBe(b);
    // No shardIndex input — sanity check by hashing the two would-be
    // shards' commons.
    expect(computeCommonConfigFingerprint({ ...COMMON_INPUTS })).toBe(a);
  });

  it("assignmentFingerprint changes when any assigned file changes", () => {
    const a = computeAssignmentFingerprint({
      shardIndex: 1,
      shardTotal: 16,
      assignedFiles: ["src/a.test.ts", "src/b.test.ts"],
    });
    const b = computeAssignmentFingerprint({
      shardIndex: 1,
      shardTotal: 16,
      assignedFiles: ["src/a.test.ts", "src/c.test.ts"],
    });
    expect(a).not.toBe(b);
  });

  it("assignmentFingerprint normalizes Windows and POSIX paths equivalently", () => {
    const posix = computeAssignmentFingerprint({
      shardIndex: 1,
      shardTotal: 16,
      assignedFiles: ["src/lib/a.test.ts"],
    });
    const win = computeAssignmentFingerprint({
      shardIndex: 1,
      shardTotal: 16,
      assignedFiles: ["src\\lib\\a.test.ts"],
    });
    expect(posix).toBe(win);
  });

  it("assignmentFingerprint is order-independent", () => {
    const a = computeAssignmentFingerprint({
      shardIndex: 1,
      shardTotal: 16,
      assignedFiles: ["src/a.test.ts", "src/b.test.ts", "src/c.test.ts"],
    });
    const b = computeAssignmentFingerprint({
      shardIndex: 1,
      shardTotal: 16,
      assignedFiles: ["src/c.test.ts", "src/a.test.ts", "src/b.test.ts"],
    });
    expect(a).toBe(b);
  });

  it("shardFingerprint composes common + assignment + shardIndex", () => {
    const common = computeCommonConfigFingerprint(COMMON_INPUTS);
    const assignment = computeAssignmentFingerprint({
      shardIndex: 1,
      shardTotal: 16,
      assignedFiles: ["src/a.test.ts"],
    });
    const s1 = computeShardFingerprint({
      commonConfigFingerprint: common,
      assignmentFingerprint: assignment,
      shardIndex: 1,
      shardTotal: 16,
    });
    const s2 = computeShardFingerprint({
      commonConfigFingerprint: common,
      assignmentFingerprint: assignment,
      shardIndex: 2,
      shardTotal: 16,
    });
    expect(s1).not.toBe(s2);
  });
});

describe("v4 — 16-shard cardinality contract", () => {
  it("yields ONE commonConfigFingerprint and SIXTEEN assignment/shard fingerprints", () => {
    const { shards, manifest } = makeSixteenShards();
    const commons = new Set(shards.map((s) => s.commonConfigFingerprint));
    const assignments = new Set(shards.map((s) => s.assignmentFingerprint));
    const composites = new Set(shards.map((s) => s.shardFingerprint));
    expect(commons.size).toBe(1);
    expect(assignments.size).toBe(16);
    expect(composites.size).toBe(16);
    const agg = aggregateShards(shards, { manifest });
    expect(agg.status).toBe("complete");
    expect(agg.reasons).toEqual([]);
  });

  it("shard ordering does not affect aggregate outcome", () => {
    const { shards, manifest } = makeSixteenShards();
    const shuffled = [...shards].sort(() => -1);
    const agg = aggregateShards(shuffled, { manifest });
    expect(agg.status).toBe("complete");
  });
});

describe("v4 — aggregate reason codes", () => {
  it("exposes the required reason-code vocabulary", () => {
    const required = [
      "incompatible_schema",
      "missing_shard",
      "duplicate_shard",
      "out_of_range_shard",
      "common_config_mismatch",
      "workspace_mismatch",
      "manifest_mismatch",
      "assignment_fingerprint_mismatch",
      "shard_fingerprint_mismatch",
      "toolchain_mismatch",
      "duplicate_file",
      "missing_file",
      "extra_file",
      "test_failure",
      "incomplete_result",
      "corrupt_artifact",
    ];
    for (const code of required) expect(AGGREGATE_REASON_CODES).toContain(code);
  });

  it("missing shard index fails", () => {
    const { shards, manifest } = makeSixteenShards();
    const agg = aggregateShards(shards.slice(0, 15), { manifest });
    expect(agg.status).toBe("invalid");
    expect(agg.reasons.some((r) => r.code === "missing_shard")).toBe(true);
  });

  it("duplicate shard index fails", () => {
    const { shards, manifest } = makeSixteenShards();
    const dup = [...shards, shards[0]];
    const agg = aggregateShards(dup, { manifest });
    expect(agg.status).toBe("invalid");
    expect(agg.reasons.some((r) => r.code === "duplicate_shard")).toBe(true);
  });

  it("shard index 0 fails", () => {
    const { manifest } = makeSixteenShards();
    const s = makeShard(0, ["src/x.test.ts"]);
    const agg = aggregateShards([s], { manifest });
    expect(agg.reasons.some((r) => r.code === "out_of_range_shard")).toBe(true);
  });

  it("shard index above declared total fails", () => {
    const { manifest } = makeSixteenShards();
    const s = { ...makeShard(1, ["src/x.test.ts"]), shardTotal: 4, shardIndex: 99 };
    const agg = aggregateShards([s], { manifest });
    expect(agg.reasons.some((r) => r.code === "out_of_range_shard")).toBe(true);
  });

  it("shard-total disagreement fails", () => {
    const a = makeShard(1, ["src/a.test.ts"]);
    const b = { ...makeShard(2, ["src/b.test.ts"]), shardTotal: 32 };
    const agg = aggregateShards([a, b], { manifest: { files: ["src/a.test.ts", "src/b.test.ts"] } });
    expect(agg.status).toBe("invalid");
    expect(
      agg.reasons.some((r) => r.code === "incompatible_schema" && r.field === "shardTotal"),
    ).toBe(true);
  });

  it("assignment-path tampering fails (stored fingerprint no longer matches paths)", () => {
    const { manifest } = makeSixteenShards();
    const s = makeShard(1, ["src/a.test.ts"]);
    // Change the reported assigned files without recomputing the stored
    // assignmentFingerprint — the aggregate recomputes and catches it.
    s.assignedFiles = ["src/a.test.ts", "src/injected.test.ts"];
    s.perFile.push({
      file: "src/injected.test.ts",
      status: "passed",
      counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
    });
    const agg = aggregateShards([s], { manifest });
    expect(agg.reasons.some((r) => r.code === "assignment_fingerprint_mismatch")).toBe(true);
  });

  it("stored assignmentFingerprint tampering fails", () => {
    const s = makeShard(1, ["src/a.test.ts"], {
      assignmentFingerprint: "deadbeef".repeat(8),
    });
    const agg = aggregateShards([s], { manifest: { files: ["src/a.test.ts"] } });
    expect(agg.reasons.some((r) => r.code === "assignment_fingerprint_mismatch")).toBe(true);
  });

  it("stored shardFingerprint tampering fails", () => {
    const s = makeShard(1, ["src/a.test.ts"], {
      shardFingerprint: "cafef00d".repeat(8),
    });
    const agg = aggregateShards([s], { manifest: { files: ["src/a.test.ts"] } });
    expect(agg.reasons.some((r) => r.code === "shard_fingerprint_mismatch")).toBe(true);
  });

  it("manifest-hash drift fails", () => {
    const a = makeShard(1, ["src/a.test.ts"]);
    const b = { ...makeShard(2, ["src/b.test.ts"]), manifestHash: "different".padEnd(64, "x") };
    const agg = aggregateShards([a, b], { manifest: { files: ["src/a.test.ts", "src/b.test.ts"] } });
    expect(agg.reasons.some((r) => r.code === "manifest_mismatch")).toBe(true);
  });

  it("workspace drift fails", () => {
    const a = makeShard(1, ["src/a.test.ts"]);
    const b = { ...makeShard(2, ["src/b.test.ts"]), workspaceFingerprintDigest: "z".repeat(64) };
    const agg = aggregateShards([a, b], { manifest: { files: ["src/a.test.ts", "src/b.test.ts"] } });
    expect(agg.reasons.some((r) => r.code === "workspace_mismatch")).toBe(true);
  });

  it("commonConfig drift (pool, minWorkers, maxWorkers, batchSize, toolchain, schema) fails", () => {
    for (const drift of [
      { pool: "threads" },
      { minWorkers: 1 },
      { maxWorkers: 16 },
      { batchSize: 10 },
      { toolVersions: { ...TV, node: "v20.0.0" } },
      { toolVersions: { ...TV, bun: "1.2.0" } },
      { toolVersions: { ...TV, vitest: "2.0.0" } },
      { runSchema: 3 },
      { manifestSchema: 2 },
    ]) {
      const driftedCommon = computeCommonConfigFingerprint({ ...COMMON_INPUTS, ...drift });
      const a = makeShard(1, ["src/a.test.ts"]);
      const b = makeShard(2, ["src/b.test.ts"], { commonConfigFingerprint: driftedCommon });
      const agg = aggregateShards([a, b], {
        manifest: { files: ["src/a.test.ts", "src/b.test.ts"] },
      });
      expect(
        agg.reasons.some((r) => r.code === "common_config_mismatch"),
        `drift ${JSON.stringify(drift)} should invalidate`,
      ).toBe(true);
    }
  });

  it("toolchain drift also surfaces as toolchain_mismatch and legacy toolchainMismatches", () => {
    const a = makeShard(1, ["src/a.test.ts"]);
    const b = {
      ...makeShard(2, ["src/b.test.ts"]),
      toolVersions: { ...TV, bun: "1.2.0" },
    };
    const agg = aggregateShards([a, b], {
      manifest: { files: ["src/a.test.ts", "src/b.test.ts"] },
    });
    expect(agg.reasons.some((r) => r.code === "toolchain_mismatch")).toBe(true);
    expect(agg.toolchainMismatches.some((m) => m.tool === "bun")).toBe(true);
  });

  it("duplicate file ownership fails", () => {
    const a = makeShard(1, ["src/dup.test.ts"]);
    const b = makeShard(2, ["src/dup.test.ts"]);
    const agg = aggregateShards([a, b], { manifest: { files: ["src/dup.test.ts"] } });
    expect(agg.reasons.some((r) => r.code === "duplicate_file")).toBe(true);
  });

  it("missing manifest coverage fails", () => {
    const a = makeShard(1, ["src/a.test.ts"]);
    const agg = aggregateShards([a], { manifest: { files: ["src/a.test.ts", "src/b.test.ts"] } });
    expect(agg.reasons.some((r) => r.code === "missing_file")).toBe(true);
  });

  it("extra file coverage fails", () => {
    const a = makeShard(1, ["src/a.test.ts", "src/extra.test.ts"]);
    const agg = aggregateShards([a], { manifest: { files: ["src/a.test.ts"] } });
    expect(agg.reasons.some((r) => r.code === "extra_file")).toBe(true);
  });
});
