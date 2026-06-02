/**
 * Static safety guards for the QuickLog v2 → AI Doctor context adapter.
 * Source-honest, read-only, no automation language.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/quickLogV2ManualSnapshotAdapter.ts",
];

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("QuickLog v2 context adapter — static safety", () => {
  for (const f of FILES) {
    it(`${f}: no Supabase / RPC / writes / device control / live language`, () => {
      const src = read(f);
      // No Supabase client or RPC usage in pure lib + its tests.
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
      expect(src).not.toMatch(/\.rpc\s*\(/);
      expect(src).not.toMatch(/\.insert\s*\(/);
      expect(src).not.toMatch(/\.upsert\s*\(/);
      expect(src).not.toMatch(/\.delete\s*\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/bridge_tokens/);
      // No forbidden target-table writes from this adapter slice.
      expect(src).not.toMatch(/from\(['"]alerts['"]\)/);
      expect(src).not.toMatch(/from\(['"]action_queue['"]\)/);
      expect(src).not.toMatch(/from\(['"]ai_doctor_sessions['"]\)/);
      expect(src).not.toMatch(/from\(['"]sensor_readings['"]\)/);
      // No device-control or automation language.
      expect(src).not.toMatch(/\b(turn\s+on|turn\s+off|actuate|dose|pump|valve|relay|automation|autopilot)\b/i);
      // Source-honest: never describe manual readings as live/synced/connected/imported.
      expect(src).not.toMatch(/\b(live|synced|connected|imported)\b/i);
    });
  }
});
