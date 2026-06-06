/**
 * Tests for scripts/scan-gamification-direct-inserts.mjs.
 *
 * We exercise the script as a black box against a temp directory so the
 * pattern stays honest: forbidden inserts must be caught, SELECT-style
 * helpers must be ignored. Also asserts the corresponding package.json
 * script wiring exists so CI keeps invoking the scan.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pkg from "../../package.json";

function runScan(extra: string): { code: number; out: string } {
  try {
    const out = execFileSync(
      "node",
      ["scripts/scan-gamification-direct-inserts.mjs", "--extra", extra],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

describe("scan-gamification-direct-inserts", () => {
  it("passes on real src/ (no forbidden inserts in production code)", () => {
    const { code } = runScan("src");
    expect(code).toBe(0);
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
    expect(scripts["test:security-gamification"]).toContain(
      "scan-gamification-direct-inserts",
    );
  });
});
