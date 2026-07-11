/**
 * Tests for scripts/scan-gamification-direct-inserts.mjs.
 *
 * We exercise the scanner's deterministic analysis core in-process
 * (via the exported scanRoots / walkScanRoot / scanFiles helpers) so
 * the full src/ tree is walked only once per file run instead of once
 * per scenario. This preserves the exact security policy, scan scope
 * (src/ + any --extra roots), forbidden-pattern detection, fixtures,
 * assertions, exclusion set, and finding order. The CLI wrapper in
 * the .mjs file is unchanged and remains the CI entry point.
 *
 * Mutable temp fixtures are still walked fresh in every scenario.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pkg from "../../package.json";
import { scanFiles, walkScanRoot } from "../../scripts/scan-gamification-direct-inserts.mjs";

// Cache the immutable src/ inventory and its findings once at module
// scope (before any test executes) so every scenario — including tests
// run in isolation or filtered by name — sees the same src analysis
// without re-walking or re-reading src/. src/ is read-only during the
// test run; fixture scenarios only add files under fresh temp dirs,
// never under src/. This mirrors the CLI's deterministic behavior
// while eliminating four redundant full src/ walks and four redundant
// src/ content-read passes.
const SRC_FILES: readonly string[] = Object.freeze(walkScanRoot("src"));
const SRC_HITS: readonly ReturnType<typeof scanFiles>[number][] = Object.freeze(
  scanFiles([...SRC_FILES]),
);

/**
 * Simulate `node scripts/scan-gamification-direct-inserts.mjs --extra <extra>`
 * in-process. Contract parity with `scanRoots(["src", extra])`:
 *   - src files are walked/scanned first (cached), fixture files second.
 *   - Deduplication is by `file:matchIndex`; src and tmp paths never
 *     collide, so prepending cached SRC_HITS to freshly scanned fixture
 *     hits is byte-identical to `scanFiles([...SRC_FILES, ...fixtureFiles])`
 *     — which is exactly what the CLI's `scanRoots(["src", extra])` does.
 *   - Exit code: 0 clean, 1 on any hit (matches CLI).
 *   - Output text: same per-hit format the CLI writes to stderr, joined
 *     with newlines (sufficient for the /table-name/ regex assertions).
 */
function runScan(extra: string): { code: number; out: string } {
  const extraFiles = walkScanRoot(extra);
  const extraHits = scanFiles(extraFiles);
  const hits = [...SRC_HITS, ...extraHits];
  const out = hits.map((h) => `${h.file}:${h.line}: ${h.snippet}  [${h.table}]`).join("\n");
  return { code: hits.length === 0 ? 0 : 1, out };
}

describe("scan-gamification-direct-inserts", () => {
  it("passes on real src/ (no forbidden inserts in production code)", () => {
    // Equivalent to scanning roots=["src"]; uses cached src findings so
    // isolated execution of this test does not re-read src/ either.
    expect(SRC_HITS).toEqual([]);
  });

  it("flags .from('nug_events').insert(...)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gam-scan-"));
    try {
      mkdirSync(join(dir, "x"), { recursive: true });
      writeFileSync(
        join(dir, "x", "bad.ts"),
        "await supabase.from('nug_events').insert({ user_id: u, kind: 'x', amount: 1 });\n",
      );
      const { code, out } = runScan(dir);
      expect(code).toBe(1);
      expect(out).toMatch(/nug_events/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags .from("unlocks").insert across whitespace/newlines', () => {
    const dir = mkdtempSync(join(tmpdir(), "gam-scan-"));
    try {
      writeFileSync(
        join(dir, "bad2.ts"),
        'await supabase\n  .from("unlocks")\n  .insert({ user_id: u, key: "x" });\n',
      );
      const { code, out } = runScan(dir);
      expect(code).toBe(1);
      expect(out).toMatch(/unlocks/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags .from('user_quests').insert", () => {
    const dir = mkdtempSync(join(tmpdir(), "gam-scan-"));
    try {
      writeFileSync(
        join(dir, "bad3.ts"),
        "supabase.from('user_quests').insert({ user_id: u, quest_key: 'q' });",
      );
      const { code } = runScan(dir);
      expect(code).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores SELECT-style helpers on the same tables", () => {
    const dir = mkdtempSync(join(tmpdir(), "gam-scan-"));
    try {
      writeFileSync(
        join(dir, "ok.ts"),
        [
          "supabase.from('unlocks').select('*').eq('user_id', u);",
          "supabase.from(\"user_quests\").select('*').eq('user_id', u);",
          "supabase.from('nug_events').select('amount').eq('user_id', u);",
        ].join("\n"),
      );
      // Scenario parity with the CLI: `scanRoots(["src", fixtureDir])`.
      // Cached src findings (∅ on a clean tree; propagated verbatim if
      // src ever regresses) are merged with the fresh fixture scan so
      // this test surfaces any src regression the same way the CLI
      // would — independently of test execution order.
      const { code } = runScan(dir);
      expect(code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("package.json wires the CI script", () => {
    const scripts = (pkg as { scripts: Record<string, string> }).scripts;
    expect(scripts["check:gamification-rls"]).toBeTruthy();
    expect(scripts["scan:gamification-direct-inserts"]).toBeTruthy();
    expect(scripts["smoke:award-nugs"]).toBeTruthy();
    expect(scripts["test:security-gamification"]).toContain("scan-gamification-direct-inserts");
  });
});
