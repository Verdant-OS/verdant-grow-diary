/**
 * Static safety: QuickLogGroupedTimelineSection wiring.
 *
 * Ensures the new presenter + hook do not introduce writes, schema changes,
 * RPC calls, alerts/action_queue/ai_doctor_sessions writes, device-control
 * language, or live/synced/connected/imported wording.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const FORBIDDEN_WORDS = [
  /\blive\b/i,
  /\bsynced\b/i,
  /\bconnected\b/i,
  /\bimported\b/i,
];
const FORBIDDEN_WRITES_HOOK = [
  /\.insert\(/,
  /\.upsert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.rpc\(/,
  /functions\.invoke/,
  /service_role/i,
  /\.from\(\s*['"]alerts['"]/,
  /\.from\(\s*['"]action_queue['"]/,
  /\.from\(\s*['"]ai_doctor_sessions['"]/,
];
const FORBIDDEN_WRITES_PRESENTER = [
  /from\s+["']@\/integrations\/supabase\/client["']/,
  /\.rpc\(/,
  /service_role/i,
];
const DEVICE_WORDS = [
  /\bdevice control\b/i,
  /\bpump\b/i,
  /\bdosing\b/i,
  /\bturn\s+on\b/i,
  /\bturn\s+off\b/i,
];
const SCHEMA_MARKERS = [/CREATE\s+TABLE/i, /ALTER\s+TABLE/i, /DROP\s+TABLE/i];

const PRESENTER = "components/QuickLogGroupedTimelineSection.tsx";
const HOOK = "hooks/useQuickLogGroupedTimeline.ts";
const ADAPTER = "lib/quickLogGroupedTimelineRowAdapter.ts";

describe("QuickLogGroupedTimelineSection — static safety", () => {
  for (const rel of [PRESENTER, HOOK, ADAPTER]) {
    it(`${rel}: no live/synced/connected/imported wording`, () => {
      const stripped = read(rel).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const re of FORBIDDEN_WORDS) {
        expect(stripped).not.toMatch(re);
      }
    });

    it(`${rel}: no device-control language`, () => {
      const stripped = read(rel).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const re of DEVICE_WORDS) {
        expect(stripped).not.toMatch(re);
      }
    });

    it(`${rel}: no schema migration markers`, () => {
      const src = read(rel);
      for (const re of SCHEMA_MARKERS) {
        expect(src).not.toMatch(re);
      }
    });
  }

  it("hook: no writes / RPC / forbidden tables", () => {
    const src = read(HOOK).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const re of FORBIDDEN_WRITES_HOOK) {
      expect(src).not.toMatch(re);
    }
  });

  it("presenter: no Supabase client / RPC / service_role", () => {
    const src = read(PRESENTER);
    for (const re of FORBIDDEN_WRITES_PRESENTER) {
      expect(src).not.toMatch(re);
    }
  });

  it("adapter: no React, no Supabase, no I/O", () => {
    const src = read(ADAPTER);
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("presenter does not duplicate grouping logic — delegates to view-model", () => {
    const src = read(PRESENTER);
    expect(src).toMatch(/useQuickLogGroupedTimeline/);
    // Should not implement its own nearest-neighbour pairing.
    expect(src).not.toMatch(/nearest/i);
    expect(src).not.toMatch(/GROUPING_WINDOW_MS/);
  });
});
