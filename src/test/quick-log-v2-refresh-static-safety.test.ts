/**
 * Static safety: QuickLog v2 post-save refresh.
 *
 * Ensures the refresh rule and its wiring in QuickLogV2Sheet introduce
 * no schema/RPC/write changes, no alerts/action_queue/ai_doctor_sessions
 * writes, no device-control language, and no live/synced/connected/
 * imported wording.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripped(rel: string): string {
  return (
    read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      // Strip accessibility attributes so words like `aria-live` and
      // `aria-connected` do not trip the forbidden-word scan.
      .replace(/\baria-[a-z]+(?:=(?:"[^"]*"|'[^']*'|\{[^}]*\}))?/g, "")
  );
}

const FORBIDDEN_WORDS = [/\blive\b/i, /\bsynced\b/i, /\bconnected\b/i, /\bimported\b/i];
const DEVICE_WORDS = [
  /\bdevice control\b/i,
  /\bpump\b/i,
  /\bdosing\b/i,
  /\bturn\s+on\b/i,
  /\bturn\s+off\b/i,
];
const SCHEMA_MARKERS = [/CREATE\s+TABLE/i, /ALTER\s+TABLE/i, /DROP\s+TABLE/i];

// Write-call detectors are whitespace-tolerant (`\s` spans newlines), so a
// line-wrapped `supabase\n  .from(` cannot slip past the scan on formatting
// alone. Kept honest by the fixture self-test below.
const DIRECT_TABLE_CALL = /supabase\s*\.\s*from\s*\(/;
const DIRECT_RPC_CALL = /supabase\s*\.\s*rpc\s*\(/;
const EDGE_FUNCTION_CALL = /functions\s*\.\s*invoke/;

const RULE = "lib/quickLogV2RefreshRules.ts";
const SHEET = "components/QuickLogV2Sheet.tsx";

describe("QuickLog v2 refresh — static safety", () => {
  for (const rel of [RULE, SHEET]) {
    it(`${rel}: no live/synced/connected/imported wording`, () => {
      const s = stripped(rel);
      for (const re of FORBIDDEN_WORDS) {
        expect(s).not.toMatch(re);
      }
    });

    it(`${rel}: no device-control language`, () => {
      const s = stripped(rel);
      for (const re of DEVICE_WORDS) {
        expect(s).not.toMatch(re);
      }
    });

    it(`${rel}: no schema markers`, () => {
      const src = read(rel);
      for (const re of SCHEMA_MARKERS) {
        expect(src).not.toMatch(re);
      }
    });
  }

  it("refresh rule is pure — no React, no Supabase, no I/O", () => {
    const src = read(RULE);
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    expect(src).not.toMatch(/\.\s*rpc\s*\(/);
    expect(src).not.toMatch(/\.\s*insert\s*\(/);
    expect(src).not.toMatch(/\.\s*update\s*\(/);
    expect(src).not.toMatch(/\.\s*upsert\s*\(/);
    expect(src).not.toMatch(/\.\s*delete\s*\(/);
  });

  it("refresh rule never emits keys for alerts/action_queue/ai_doctor_sessions", () => {
    const src = stripped(RULE);
    expect(src).not.toMatch(/['"]alerts['"]/);
    expect(src).not.toMatch(/['"]action_queue['"]/);
    expect(src).not.toMatch(/['"]ai_doctor_sessions['"]/);
  });

  it("sheet wiring uses the pure rule, not inlined query keys", () => {
    const src = read(SHEET);
    expect(src).toMatch(/applyQuickLogV2Refresh|buildQuickLogV2RefreshQueryKeys/);
  });

  it("sheet does not introduce new writes beyond the existing RPC save", () => {
    const src = stripped(SHEET);
    // Allowed: supabase.rpc call lives inside useQuickLogV2Save, NOT in the sheet.
    expect(src).not.toMatch(DIRECT_TABLE_CALL);
    expect(src).not.toMatch(DIRECT_RPC_CALL);
    expect(src).not.toMatch(EDGE_FUNCTION_CALL);
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/\.\s*from\s*\(\s*['"]alerts['"]/);
    expect(src).not.toMatch(/\.\s*from\s*\(\s*['"]action_queue['"]/);
    expect(src).not.toMatch(/\.\s*from\s*\(\s*['"]ai_doctor_sessions['"]/);
  });

  it("write detectors catch multi-line formatted calls (guard self-test)", () => {
    // A prettier-wrapped call must be caught: the single-line pattern this
    // replaces (/supabase\.from\(/) let exactly this formatting through.
    const multiLineFrom =
      'const { error } = await supabase\n      .from("diary_entries")\n      .insert({});';
    const multiLineRpc = 'await supabase\n      .rpc("quicklog_save_manual", {});';
    const multiLineInvoke = 'await supabase.functions\n      .invoke("fn");';
    expect(multiLineFrom).toMatch(DIRECT_TABLE_CALL);
    expect(multiLineRpc).toMatch(DIRECT_RPC_CALL);
    expect(multiLineInvoke).toMatch(EDGE_FUNCTION_CALL);
    // Single-line forms stay caught.
    expect('supabase.from("diary_entries")').toMatch(DIRECT_TABLE_CALL);
    expect('supabase.rpc("fn")').toMatch(DIRECT_RPC_CALL);
    // Table-specific detectors tolerate the same wrapping.
    expect('supabase\n      .from("alerts")').toMatch(/\.\s*from\s*\(\s*['"]alerts['"]/);
    // Storage buckets are a different surface (supabase.storage.from) and
    // must not false-positive the table-write detector.
    expect('supabase.storage\n      .from("diary-photos")').not.toMatch(DIRECT_TABLE_CALL);
  });

  it("sheet does not optimistically write fake timeline entries to the cache", () => {
    const src = stripped(SHEET);
    expect(src).not.toMatch(/setQueryData\s*\(/);
  });

  it("preserves the success toast copy (literal or via shared constant)", () => {
    const src = read(SHEET);
    // Manual log path keeps the "Log saved" copy (literal or via successMessage var).
    expect(src).toMatch(/["']Log saved["']/);
    // Feeding path routes through the exported shared constant.
    expect(src).toMatch(/FEEDING_SAVE_SUCCESS_MESSAGE/);
  });
});
