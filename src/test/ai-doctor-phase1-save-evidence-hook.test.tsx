/**
 * Static-source safety guardrail for the AI Doctor Phase 1 save-to-timeline
 * slice. Verifies the new files do not introduce forbidden behavior.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/aiDoctorPhase1TimelineDraft.ts",
  "src/hooks/useSaveAiDoctorPhase1TimelineEvidence.ts",
  "src/components/AiDoctorPhase1SaveEvidenceButton.tsx",
];

function read(p: string) {
  return readFileSync(resolve(__dirname, "../..", p), "utf8");
}

describe("AI Doctor Phase 1 save-evidence slice — static safety", () => {
  it("does not write to action_queue / alerts and does not call edge functions or live AI", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src, f).not.toMatch(/from\(["']alerts["']\)/);
      expect(src, f).not.toMatch(/functions\.invoke/);
      expect(src, f).not.toMatch(/service_role/i);
      expect(src, f).not.toMatch(/bridge_token/i);
      expect(src, f).not.toMatch(/openai\.com|anthropic\.com|googleapis\.com\/v1beta\/models/i);
    }
  });

  it("only uses the approved quicklog_save_manual RPC for persistence", () => {
    const hook = read("src/hooks/useSaveAiDoctorPhase1TimelineEvidence.ts");
    expect(hook).toMatch(/quicklog_save_manual/);
    // No other rpc names introduced.
    const matches = hook.match(/supabase\.rpc\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("button component has no approve/execute/send copy", () => {
    const btn = read("src/components/AiDoctorPhase1SaveEvidenceButton.tsx");
    expect(btn).not.toMatch(/\bapprove\b/i);
    expect(btn).not.toMatch(/\bexecute\b/i);
    expect(btn).not.toMatch(/send to device/i);
  });

  it("does not auto-save (save is only invoked from a user onClick)", () => {
    const btn = read("src/components/AiDoctorPhase1SaveEvidenceButton.tsx");
    expect(btn).toMatch(/onClick=\{onClick\}/);
    // No useEffect that triggers save.
    expect(btn).not.toMatch(/useEffect\([^)]*save\(/);
  });
});
