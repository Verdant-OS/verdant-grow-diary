// Tranche B+ slice B3a — recovery parity wiring on the grow-scoped surfaces.
//
// Plant Detail already ships the calm "No recent check-in" prompt; the
// Dashboard and Grow Detail empty states did not. This pins the wiring that
// closes that gap while preserving every rule the review established:
//   - the SHIPPED rules module decides (no second engine, no forked copy)
//   - only real check-ins count (Action Queue / alert rows never suppress it)
//   - unknown ("unavailable") never renders as measured absence
//   - the CTA opens the existing Quick Log grow-scoped and writes nothing
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PROMPT = readFileSync("src/components/GrowRecoveryPrompt.tsx", "utf8");
const DASHBOARD = readFileSync("src/pages/Dashboard.tsx", "utf8");
const GROW_DETAIL = readFileSync("src/pages/GrowDetail.tsx", "utf8");

describe("GrowRecoveryPrompt — reuses the shipped engine", () => {
  it("delegates the decision and the copy to noRecentLogRecoveryRules", () => {
    expect(PROMPT).toContain("buildNoRecentLogRecovery");
    expect(PROMPT).toContain("noRecentLogRecoveryRules");
    // No forked copy: the strings come from the module's result.
    expect(PROMPT).toContain("{recovery.headline}");
    expect(PROMPT).toContain("{recovery.body}");
    expect(PROMPT).toContain("{recovery.ctaLabel}");
    expect(PROMPT).not.toMatch(/No recent check-in\.|10-second status/);
  });

  it("narrows merged activity to real check-ins first", () => {
    expect(PROMPT).toContain("selectRecoveryCheckInRows");
    expect(PROMPT).toMatch(/rows:\s*selectRecoveryCheckInRows\(items\)/);
  });

  it("opens the existing Quick Log grow-scoped and performs no write", () => {
    expect(PROMPT).toContain("PLANT_QUICKLOG_PREFILL_EVENT");
    expect(PROMPT).toMatch(/detail:\s*\{\s*growId\s*\}/);
    // Read-only: no Supabase verbs anywhere in the presenter.
    expect(PROMPT).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    // Never guesses a plant from a grow-scoped surface.
    expect(PROMPT).not.toMatch(/plantId/);
  });

  it("renders nothing without a grow or a prompt-worthy state", () => {
    expect(PROMPT).toMatch(/if \(!recovery\.showPrompt \|\| !growId\) return null;/);
  });

  it("keeps the clock injectable for deterministic tests", () => {
    expect(PROMPT).toMatch(/now\?:\s*number/);
    expect(PROMPT).toMatch(/typeof now === "number" \? now : Date\.now\(\)/);
  });
});

describe("page wiring — Dashboard and Grow Detail", () => {
  it("mounts the prompt on both grow-scoped surfaces", () => {
    expect(DASHBOARD).toContain("GrowRecoveryPrompt");
    expect(DASHBOARD).toContain('testId="dashboard-no-recent-check-in-recovery"');
    expect(GROW_DETAIL).toContain("GrowRecoveryPrompt");
    expect(GROW_DETAIL).toContain('testId="grow-detail-no-recent-check-in-recovery"');
  });

  it("gates the prompt on a successful read — unknown is never absence", () => {
    expect(DASHBOARD).toMatch(/recent\.status === "ok" && \(\s*<GrowRecoveryPrompt/);
    expect(GROW_DETAIL).toMatch(/recent\.status === "ok" && \(\s*<GrowRecoveryPrompt/);
  });

  it("preserves the pinned empty-state literals", () => {
    expect(DASHBOARD).toContain("No recent activity yet.");
    expect(GROW_DETAIL).toContain("No recent activity yet.");
    expect(DASHBOARD).toContain("Recent activity unavailable.");
    expect(GROW_DETAIL).toContain("Recent activity unavailable.");
  });

  it("keeps the Grow Detail read-only fence intact", () => {
    // grow-detail-recent pins that this page never gains a Supabase verb.
    expect(GROW_DETAIL).not.toMatch(/\.insert\(|\.upsert\(|\.rpc\(/);
  });
});
