/**
 * Static safety guards for the operator GGS real-payload ingest surface.
 *
 * Asserts the panel + page source code:
 *   - never renders raw_payload bodies
 *   - never emits `ggs_live` / `ggs_csv` source values
 *   - never imports AI / Action Queue / alert / device control modules
 *   - routes writes only through `pi_ingest_commit_batch` (no direct
 *     `.from("sensor_readings").insert(...)`)
 *   - requires the operator role check before rendering the panel
 *   - attestation checkbox is wired before commit
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

// Strip /** ... */ block comments so safety regexes don't match documentation
// that intentionally references the forbidden patterns.
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

const PANEL = stripBlockComments(read("src/components/GgsRealPayloadIngestPanel.tsx"));
const PAGE = stripBlockComments(read("src/pages/OperatorGgsRealPayloadIngest.tsx"));
const COMMIT = stripBlockComments(read("src/lib/ggsRealPayloadCommit.ts"));
const VM = stripBlockComments(read("src/lib/ggsRealPayloadIngestViewModel.ts"));

describe("operator GGS real-payload ingest — static safety", () => {
  it("panel never renders raw_payload body fields", () => {
    expect(PANEL).not.toMatch(/raw_payload\.payload/);
    expect(PANEL).not.toMatch(/JSON\.stringify\(.*raw_payload/);
    expect(PANEL).not.toMatch(/preview\.payload/);
  });

  it("nothing emits ggs_live or ggs_csv source values", () => {
    for (const src of [PANEL, PAGE, COMMIT, VM]) {
      expect(src).not.toMatch(/"ggs_live"/);
      expect(src).not.toMatch(/"ggs_csv"/);
    }
  });

  it("commit wrapper only calls pi_ingest_commit_batch, not direct sensor_readings inserts", () => {
    expect(COMMIT).toMatch(/pi_ingest_commit_batch/);
    expect(COMMIT).not.toMatch(/\.from\(\s*["']sensor_readings["']\s*\)/);
  });

  it("panel does not import AI / alerts / Action Queue / device control modules", () => {
    const forbidden = [
      "ai-doctor",
      "aiDoctor",
      "ActionQueue",
      "action-queue",
      "alerts/",
      "deviceControl",
      "device-control",
    ];
    for (const f of forbidden) {
      expect(PANEL.includes(f), `panel must not import ${f}`).toBe(false);
      expect(PAGE.includes(f), `page must not import ${f}`).toBe(false);
    }
  });

  it("page guards on useHasRole('operator') before rendering the panel", () => {
    expect(PAGE).toMatch(/useHasRole\(\s*["']operator["']\s*\)/);
    // Panel render is gated on granted status.
    expect(PAGE).toMatch(/role\.status\s*===\s*["']granted["']/);
  });

  it("panel disables commit unless attestation is checked", () => {
    expect(PANEL).toMatch(/attested/);
    // Button is disabled unless vm.canCommit is true.
    expect(PANEL).toMatch(/disabled=\{[^}]*canCommit/);
  });

  it("panel goes through the commitGgsRealPayload helper, never raw RPC", () => {
    expect(PANEL).toMatch(/commitGgsRealPayload/);
    expect(PANEL).not.toMatch(/rpc\(\s*["']pi_ingest_commit_batch["']/);
  });
});
