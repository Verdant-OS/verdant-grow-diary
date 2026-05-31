/**
 * Coach page — thread the persisted AI Doctor session id into
 * StructuredDiagnosisCard.
 *
 * Read-only state/data-threading slice. All assertions are static-source
 * checks against `src/pages/Coach.tsx` because the wiring is purely
 * declarative (no new fetch, no new mutation path). Behavior properties
 * (race-safety, reset on new ask, failure passthrough) are encoded as
 * source-level invariants so they cannot regress without being noticed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");

describe("Coach — persisted AI Doctor session id threading", () => {
  it("declares persistedSessionId state and a diagnosis sequence ref", () => {
    expect(COACH).toMatch(/const\s+\[persistedSessionId,\s*setPersistedSessionId\]\s*=\s*useState<string\s*\|\s*null>\(null\)/);
    expect(COACH).toMatch(/const\s+diagnosisSeqRef\s*=\s*useRef\(0\)/);
  });

  it("ask() resets the persisted session id and increments the sequence before issuing a new request", () => {
    const askBlock = COACH.split(/async\s+function\s+ask\(/)[1] ?? "";
    expect(askBlock).toMatch(/\+\+diagnosisSeqRef\.current/);
    expect(askBlock).toMatch(/setPersistedSessionId\(null\)/);
    // Reset must happen before the edge function call so a stale id is
    // never visible while the new diagnosis is loading.
    const idxReset = askBlock.indexOf("setPersistedSessionId(null)");
    const idxInvoke = askBlock.indexOf("functions.invoke");
    expect(idxReset).toBeGreaterThan(-1);
    expect(idxInvoke).toBeGreaterThan(idxReset);
  });

  it("applies the persisted id only when persistence succeeded AND the diagnosis is still current", () => {
    // Race guard: seq === diagnosisSeqRef.current must gate setPersistedSessionId.
    expect(COACH).toMatch(
      /persistAiDoctorSession\(supabase,[\s\S]*?\)\.then\(\(res\)\s*=>\s*\{[\s\S]*?if\s*\(res\.ok\)[\s\S]*?seq\s*===\s*diagnosisSeqRef\.current[\s\S]*?setPersistedSessionId\(res\.id\)/,
    );
  });

  it("preserves the soft-warning toast on persistence failure and does NOT set a fake session id", () => {
    const thenBlock =
      COACH.split("persistAiDoctorSession(supabase,")[1]?.split("});")[0] ?? "";
    expect(thenBlock).toMatch(/toast\.warning\(/);
    // The only setter call lives behind the res.ok branch.
    const setterMatches = thenBlock.match(/setPersistedSessionId\(/g) ?? [];
    expect(setterMatches.length).toBe(1);
    expect(thenBlock).not.toMatch(/setPersistedSessionId\([^)]*res\.error/);
  });

  it("passes aiDoctorSessionId into StructuredDiagnosisCard from state (undefined when null)", () => {
    expect(COACH).toMatch(
      /<StructuredDiagnosisCard[\s\S]{0,400}aiDoctorSessionId=\{persistedSessionId\s*\?\?\s*undefined\}/,
    );
  });

  it("diagnosis card renders independently of persistedSessionId (failure path still shows diagnosis)", () => {
    // The mount guard is `{diagnosis && (`, NOT `{diagnosis && persistedSessionId`.
    expect(COACH).toMatch(/\{diagnosis\s*&&\s*\(\s*<div[^>]*>\s*<StructuredDiagnosisCard/);
    expect(COACH).not.toMatch(/persistedSessionId\s*&&\s*<StructuredDiagnosisCard/);
  });

  it("does not introduce new action_queue write paths for the threading", () => {
    // Existing inserts: action_queue (Add to Action Queue) + action_queue_events.
    // No new write surface should appear around persistedSessionId.
    const aqInserts =
      COACH.match(/\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(/g) ?? [];
    expect(aqInserts.length).toBe(1);
  });

  it("does not introduce new functions.invoke or service_role usage", () => {
    const invokeCount = (COACH.match(/functions\.invoke\(/g) ?? []).length;
    // The only invoke is the existing ai-coach call.
    expect(invokeCount).toBe(1);
    expect(COACH.toLowerCase()).not.toContain("service_role");
  });

  it("does not introduce automation, device-control, or auto-execution verbs", () => {
    const lower = COACH.toLowerCase();
    for (const tok of [
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home_assistant",
      "home-assistant",
      "smart plug",
      "mqtt",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it("does not leak [session:<id>] tokens or target_device into Coach JSX", () => {
    expect(COACH).not.toMatch(/\[session:/);
    expect(COACH).not.toMatch(/target_device\s*:/);
  });

  it("eligibility/queue mutation logic for AI Doctor suggestions is unchanged in shape", () => {
    expect(COACH).toMatch(/async\s+function\s+addDoctorSuggestionToQueue/);
    expect(COACH).toMatch(/status\s*:\s*["']pending_approval["']/);
    expect(COACH).toMatch(/ACTION_QUEUE_SOURCE_VALUES\.AI_DOCTOR/);
  });
});
