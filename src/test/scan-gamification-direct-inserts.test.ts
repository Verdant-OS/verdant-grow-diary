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
import {
  scanFiles,
  scanRoots,
  walkScanRoot,
} from "../../scripts/scan-gamification-direct-inserts.mjs";

// Cache the immutable src/ inventory once for this test file. src/ is
// read-only during the test run; fixture scenarios only ever add files
// under fresh temp directories, never under src/. This mirrors the
// deterministic behavior of the CLI while eliminating four redundant
// full src/ walks (one per fixture scenario).
const SRC_FILES: readonly string[] = Object.freeze(walkScanRoot("src"));

/**
 * Simulate `node scripts/scan-gamification-direct-inserts.mjs --extra <extra>`
 * in-process: scan roots = ["src", extra], dedupe hits, translate to the
 * CLI's exit-code contract (0 clean, 1 on any hit). Output text is the
 * concatenation of hit snippets (sufficient for the /table-name/ regex
 * assertions the tests use).
 */
function runScan(extra: string): { code: number; out: string } {
  // Fresh walk of the mutable fixture dir every call; reuse cached src walk.
  const extraFiles = walkScanRoot(extra);
  const srcHits = scanFiles([...SRC_FILES]);
  const extraHits = scanFiles(extraFiles);
  const hits = [...srcHits, ...extraHits];
  const out = hits
    .map((h) => `${h.file}:${h.line}: ${h.snippet}  [${h.table}]`)
    .join("\n");
  return { code: hits.length === 0 ? 0 : 1, out };
}

describe("scan-gamification-direct-inserts", () => {
  it("passes on real src/ (no forbidden inserts in production code)", () => {
    // Uses cached src inventory; equivalent to scanning roots=["src"].
    const hits = scanFiles([...SRC_FILES]);
    expect(hits).toEqual([]);
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

  it("flags .from(\"unlocks\").insert across whitespace/newlines", () => {
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
      // scenario-scoped: only scan the fixture dir so we prove SELECTs
      // are ignored regardless of the (already-clean) src tree.
      const hits = scanRoots([dir]);
      expect(hits).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("package.json wires the CI script", () => {
    const scripts = (pkg as { scripts: Record<string, string> }).scripts;
    expect(scripts["check:gamification-rls"]).toBeTruthy();
    expect(scripts["scan:gamification-direct-inserts"]).toBeTruthy();
    expect(scripts["smoke:award-nugs"]).toBeTruthy();
    expect(scripts["test:security-gamification"]).toContain(
      "scan-gamification-direct-inserts",
    );
  });
});
