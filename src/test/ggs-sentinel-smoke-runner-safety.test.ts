/**
 * Static safety guards for the GGS Sentinel smoke runner.
 *
 * Asserts the panel + pure helper source code:
 *   - never inserts / updates / deletes / upserts
 *   - never invokes edge functions, AI, alerts, Action Queue, device control
 *   - never renders raw_payload bodies
 *   - never references forbidden non-canonical source labels in app code
 *   - only calls the read-only `get_latest_tent_sensor_snapshot` RPC
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

const PANEL = stripBlockComments(read("src/components/GgsSentinelSmokeRunnerPanel.tsx"));
const RUNNER = stripBlockComments(read("src/lib/ggsSentinelSmokeRunner.ts"));

describe("GGS Sentinel smoke runner — static safety", () => {
  it("panel performs no writes (no insert/update/delete/upsert)", () => {
    for (const verb of ["\\.insert\\(", "\\.update\\(", "\\.delete\\(", "\\.upsert\\("]) {
      expect(PANEL).not.toMatch(new RegExp(verb));
    }
  });

  it("panel does not invoke edge functions or write RPCs", () => {
    expect(PANEL).not.toMatch(/functions\.invoke/);
    // The ONLY RPC allowed is the read-only snapshot lookup.
    const rpcCalls = PANEL.match(/\.rpc\(\s*["']([a-z_]+)["']/g) ?? [];
    for (const c of rpcCalls) {
      expect(c).toContain("get_latest_tent_sensor_snapshot");
    }
  });

  it("panel does not import AI / alerts / Action Queue / device control modules", () => {
    const forbidden = [
      "ai-doctor", "aiDoctor",
      "ActionQueue", "action-queue",
      "alerts/", "deviceControl", "device-control",
      "quicklog_save_event", "quicklog_save_manual",
    ];
    for (const f of forbidden) {
      expect(PANEL.includes(f), `panel must not import ${f}`).toBe(false);
    }
  });

  it("panel never renders raw_payload body fields", () => {
    expect(PANEL).not.toMatch(/raw_payload\.payload/);
    expect(PANEL).not.toMatch(/JSON\.stringify\(.*raw_payload/);
  });

  it("pure runner is dependency-free of Supabase / React / fetch", () => {
    expect(RUNNER).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RUNNER).not.toMatch(/from\s+["']react["']/);
    expect(RUNNER).not.toMatch(/\bfetch\(/);
  });

  it("non-canonical source strings only appear inside the forbidden-set constant", () => {
    // It's fine for the runner to KNOW the strings, but they must not be
    // assigned to a row's source anywhere.
    expect(RUNNER).not.toMatch(/source:\s*["']ggs_live["']/);
    expect(RUNNER).not.toMatch(/source:\s*["']ggs_csv["']/);
    expect(PANEL).not.toMatch(/"ggs_live"/);
    expect(PANEL).not.toMatch(/"ggs_csv"/);
  });
});
