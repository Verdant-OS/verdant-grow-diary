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
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const FORBIDDEN_WORDS = [
  /\blive\b/i,
  /\bsynced\b/i,
  /\bconnected\b/i,
  /\bimported\b/i,
];
const DEVICE_WORDS = [
  /\bdevice control\b/i,
  /\bpump\b/i,
  /\bdosing\b/i,
  /\bturn\s+on\b/i,
  /\bturn\s+off\b/i,
];
const SCHEMA_MARKERS = [/CREATE\s+TABLE/i, /ALTER\s+TABLE/i, /DROP\s+TABLE/i];

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
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.delete\(/);
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
    expect(src).not.toMatch(/supabase\.from\(/);
    expect(src).not.toMatch(/supabase\.rpc\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/\.from\(\s*['"]alerts['"]/);
    expect(src).not.toMatch(/\.from\(\s*['"]action_queue['"]/);
    expect(src).not.toMatch(/\.from\(\s*['"]ai_doctor_sessions['"]/);
  });

  it("sheet does not optimistically write fake timeline entries to the cache", () => {
    const src = stripped(SHEET);
    expect(src).not.toMatch(/setQueryData\(/);
  });

  it("preserves the success toast copy exactly", () => {
    const src = read(SHEET);
    expect(src).toMatch(/toast\.success\(\s*["']Log saved["']\s*\)/);
  });
});
