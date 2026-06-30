#!/usr/bin/env node
/**
 * scripts/test-release-receipt-ci-artifact.mjs
 *
 * Node-level test runner for `build-release-receipt-input.mjs`.
 *
 * Validates that the structured-input → artifact path is deterministic,
 * round-trips through the parser, and produces the expected overall status
 * for the pass / fail / blocked fixtures.
 *
 * SAFETY
 *  - Pure local checks. No network, no Supabase, no GitHub API.
 *  - Reads only files under `scripts/fixtures/` and writes only to a temp
 *    output path inside `node:os.tmpdir()`.
 *  - Does NOT unlock Release GO.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildEmitterInput } from "./build-release-receipt-input.mjs";

async function loadEmitter() {
  const mod = await import(
    pathToFileURL(resolve(process.cwd(), "src/lib/releaseReceiptEmitter.ts"))
      .href
  );
  return mod.emitReleaseReceiptArtifact;
}

async function loadParser() {
  const mod = await import(
    pathToFileURL(resolve(process.cwd(), "src/lib/releaseReceiptParser.ts")).href
  );
  return mod.parseReleaseReceiptArtifact;
}

const FIX_DIR = resolve("scripts/fixtures");

function loadCommands(name) {
  return JSON.parse(
    readFileSync(join(FIX_DIR, `release-receipt-ci-artifact-input.${name}.json`), "utf8"),
  );
}

function baseFlags(overrides = {}) {
  return {
    artifactId: "ci-full-suite-test-001",
    generatedAt: "2026-06-30T12:00:00.000Z",
    source: "github_actions",
    receiptKind: "ci_full_suite",
    sourceRunId: "1234",
    commitSha: "abcdef0123456789abcdef0123456789abcdef01",
    branch: "main",
    workflowName: "Verdant CI — Full Suite",
    summary: "Test run.",
    ...overrides,
  };
}

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, err: e?.message ?? String(e) });
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, err: e?.message ?? String(e) });
  }
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

async function main() {
  const emit = await loadEmitter();
  const parse = await loadParser();

  // 1. pass fixture → status pass
  await checkAsync("pass fixture emits status=pass", async () => {
    const input = buildEmitterInput(baseFlags(), loadCommands("pass"), [], {
      runner_os: "ubuntu-22.04",
    });
    const r = emit(input);
    if (!r.ok) throw new Error(`emitter rejected: ${r.errors.join("; ")}`);
    assertEq(r.artifact.status, "pass", "status");
    assertEq(r.artifact.receipt_kind, "ci_full_suite", "kind");
    assertEq(r.artifact.counts.failed, 0, "counts.failed");
    const round = parse(r.artifact);
    if (round.ok !== true) throw new Error("parser rejected emitter output");
  });

  // 2. fail fixture → status fail
  await checkAsync("fail fixture emits status=fail", async () => {
    const input = buildEmitterInput(baseFlags(), loadCommands("fail"), [], {});
    const r = emit(input);
    if (!r.ok) throw new Error(`emitter rejected: ${r.errors.join("; ")}`);
    assertEq(r.artifact.status, "fail", "status");
    if (r.artifact.counts.failed <= 0) throw new Error("expected counts.failed > 0");
  });

  // 3. blocked fixture (passing commands + active release_blocker) → blocked
  await checkAsync("blocked fixture emits status=blocked", async () => {
    const blockers = JSON.parse(
      readFileSync(
        join(FIX_DIR, "release-receipt-ci-artifact-input.blocked.blockers.json"),
        "utf8",
      ),
    );
    const input = buildEmitterInput(
      baseFlags(),
      loadCommands("blocked"),
      blockers,
      {},
    );
    const r = emit(input);
    if (!r.ok) throw new Error(`emitter rejected: ${r.errors.join("; ")}`);
    assertEq(r.artifact.status, "blocked", "status");
  });

  // 4. Deterministic — same input twice → identical artifact JSON
  await checkAsync("deterministic output", async () => {
    const input = buildEmitterInput(baseFlags(), loadCommands("pass"), [], {});
    const a = emit(input);
    const b = emit(input);
    if (!a.ok || !b.ok) throw new Error("emitter rejected");
    assertEq(
      JSON.stringify(a.artifact),
      JSON.stringify(b.artifact),
      "deterministic",
    );
  });

  // 5. Invalid flags rejected
  check("rejects invalid --source", () => {
    let threw = false;
    try {
      buildEmitterInput(
        baseFlags({ source: "not_a_source" }),
        loadCommands("pass"),
        [],
        {},
      );
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected throw for invalid source");
  });

  // 6. Unsafe metadata is rejected by emitter/parser
  await checkAsync("rejects unsafe metadata key", async () => {
    const input = buildEmitterInput(baseFlags(), loadCommands("pass"), [], {
      api_key: "leak",
    });
    const r = emit(input);
    if (r.ok) throw new Error("expected emitter to reject unsafe metadata");
  });

  // 7. Round-trip file write/read
  await checkAsync("file write round-trips", async () => {
    const input = buildEmitterInput(baseFlags(), loadCommands("pass"), [], {});
    const r = emit(input);
    if (!r.ok) throw new Error("emitter rejected");
    const dir = mkdtempSync(join(tmpdir(), "release-receipt-test-"));
    const out = join(dir, "artifact.json");
    writeFileSync(out, `${JSON.stringify(r.artifact, null, 2)}\n`, "utf8");
    const parsed = JSON.parse(readFileSync(out, "utf8"));
    const round = parse(parsed);
    if (round.ok !== true) throw new Error("file round-trip rejected by parser");
  });

  // Report
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      process.stdout.write(`  ✓ ${r.name}\n`);
    } else {
      failed += 1;
      process.stdout.write(`  ✗ ${r.name}\n    ${r.err}\n`);
    }
  }
  process.stdout.write(
    `\nbuild-release-receipt-input: ${results.length - failed}/${results.length} checks passed\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  process.stderr.write(`test-release-receipt-ci-artifact: ${e?.message ?? e}\n`);
  process.exit(1);
});
