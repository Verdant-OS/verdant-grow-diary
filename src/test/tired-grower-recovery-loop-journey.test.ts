/**
 * Tired Grower Recovery Loop v1 — end-to-end journey proof (Slice 5).
 *
 * Lovable's per-module unit tests cover each rule in isolation. This suite
 * proves the CHAINED journey and the cross-cutting boundary / failure /
 * safety invariants that only emerge when the pieces run together:
 *
 *   missed-log recovery → status chip → authoritative save draft →
 *   immediate-Timeline contract → Stabilize guidance
 *
 * Pure composition over the real shipped modules (no duplication of their
 * unit tests) plus a static-safety scan of the recovery-loop surface.
 * Additive: new file only, no edits to the in-flight shared components.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildNoRecentLogRecovery } from "../lib/noRecentLogRecoveryRules";
import {
  applyResponseCheck,
  applyQuickLogActionChip,
  buildResponseCheckLine,
  hasResponseCheck,
  RESPONSE_CHECK_STATUSES,
} from "../lib/tenSecondQuickCheckRules";
import { buildQuickLogInsertDraft } from "../lib/quickLogRules";
import { evaluateStabilizeMode } from "../lib/stabilizeModeRules";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const NOW = Date.parse("2026-07-11T18:00:00Z");
const HOUR = 60 * 60 * 1000;

const PLANT = { plantId: "plant-1", growId: "grow-1", tentId: "tent-1" };
// A chip-only check-in enters no sensor values (10-second, no typing).
const NO_SENSORS = { temp: "", humidity: "", ph: "", ec: "" };

// ---------------------------------------------------------------------------
// A. The chained happy-path journey
// ---------------------------------------------------------------------------

describe("journey — missed log → status chip → save draft → Timeline → Stabilize", () => {
  it("a tired grower with no recent check-in completes the whole loop without typing", () => {
    // 1) Missed-log recovery surfaces a calm prompt (no punishment).
    const recovery = buildNoRecentLogRecovery({ rows: [], now: NOW });
    expect(recovery.showPrompt).toBe(true);
    expect(recovery.reason).toBe("no_activity");
    expect(recovery.headline).toBe("No recent check-in.");
    expect(recovery.body).toBe("Add a 10-second status: Better, Same, or Worse.");
    // Copy is a calm invitation, never a warning / streak-loss / catch-up form.
    const recoveryText = `${recovery.headline} ${recovery.body} ${recovery.ctaLabel}`;
    expect(recoveryText).not.toMatch(/\bstreak\b|\bmissed\b|\boverdue\b|\bpenalt|\bcatch up\b/i);

    // 2) Grower taps a status chip — no sentence typing.
    const note = applyResponseCheck("", "Worse");
    expect(note).toBe("Response check: Worse.");
    expect(hasResponseCheck(note)).toBe(true);

    // 3) Save through the ONE authoritative diary path (never a second path).
    const result = buildQuickLogInsertDraft({ ...PLANT, note, sensors: NO_SENSORS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.details.event_type).toBe("quick_log");
    expect(result.draft.note).toContain("Response check: Worse.");
    // user_id is never in the draft (DB default auth.uid() is the truth).
    expect(Object.keys(result.draft)).not.toContain("user_id");
    // Manual-only: no live/csv provenance leaks in from a chip-only check-in.
    expect(JSON.stringify(result.draft)).not.toMatch(/"source"\s*:\s*"(live|csv)"/);
  });

  it("an optional action chip and status coexist in one note without duplication", () => {
    let note = applyResponseCheck("", "Same");
    note = applyQuickLogActionChip(note, "Photo only");
    note = applyQuickLogActionChip(note, "Photo only"); // idempotent
    expect(note.match(/Photo only\./g)).toHaveLength(1);
    expect(note).toContain("Response check: Same.");
    // Re-tapping a different status replaces, never stacks, the response line.
    note = applyResponseCheck(note, "Better");
    expect(note.match(/Response check:/g)).toHaveLength(1);
    expect(note).toContain("Response check: Better.");
  });

  it("every status chip produces a valid, saveable draft", () => {
    for (const status of RESPONSE_CHECK_STATUSES) {
      const note = applyResponseCheck("", status);
      expect(note).toBe(buildResponseCheckLine(status));
      const r = buildQuickLogInsertDraft({ ...PLANT, note, sensors: NO_SENSORS });
      expect(r.ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// B. Boundary cases
// ---------------------------------------------------------------------------

describe("boundary — recovery prompt only fires when genuinely behind", () => {
  it("recent activity suppresses the prompt (no nagging)", () => {
    const r = buildNoRecentLogRecovery({
      rows: [{ occurredAt: new Date(NOW - 2 * HOUR).toISOString() }],
      now: NOW,
    });
    expect(r.showPrompt).toBe(false);
    expect(r.reason).toBe("recent_activity");
  });

  it("stale activity (older than the window) re-invites a check-in", () => {
    const r = buildNoRecentLogRecovery({
      rows: [{ occurredAt: new Date(NOW - 100 * HOUR).toISOString() }],
      now: NOW,
    });
    expect(r.showPrompt).toBe(true);
    expect(r.reason).toBe("stale_activity");
  });

  it("an invalid clock fails closed — never shows a broken prompt", () => {
    const r = buildNoRecentLogRecovery({ rows: [], now: Number.NaN });
    expect(r.showPrompt).toBe(false);
    expect(r.reason).toBe("invalid_now");
  });

  it("a failed/empty capture cannot become a saved draft", () => {
    expect(buildQuickLogInsertDraft({ ...PLANT, note: "   ", sensors: NO_SENSORS })).toEqual({
      ok: false,
      reason: "missing_note",
    });
    expect(
      buildQuickLogInsertDraft({ plantId: "", growId: "g", note: "x", sensors: NO_SENSORS }).ok,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. Stabilize Mode — cautious, evidence-backed, never causal / never healthy
// ---------------------------------------------------------------------------

describe("stabilize — too many changes trigger calm, non-causal guidance", () => {
  const base = {
    now: NOW,
    active_alert_count: 0,
    sensor_source_summary: "manual" as const,
    has_stale_or_invalid_sensor_data: false,
    has_demo_or_manual_only_sensor_data: true,
  };

  it("3+ interventions in 48h enters stabilize with a 'what not to do' and a safe next step", () => {
    const r = evaluateStabilizeMode({
      ...base,
      recent_action_count_48h: 3,
      recent_major_change_count_48h: 0,
    });
    expect(r.level).toBe("stabilize");
    expect(r.what_not_to_do.length).toBeGreaterThan(0);
    expect(r.safe_next_log_prompt.length).toBeGreaterThan(0);
    expect(r.action_queue_policy).toBe("review_only");
    expect(r.safety_flags).toContain("no_device_control");
    expect(r.safety_flags).toContain("approval_required_for_actions");
  });

  it("2+ major changes in 48h also enters stabilize", () => {
    const r = evaluateStabilizeMode({
      ...base,
      recent_action_count_48h: 0,
      recent_major_change_count_48h: 2,
    });
    expect(r.level).toBe("stabilize");
  });

  it("weak/stale/manual sensor context is never rendered as healthy or live, never high-confidence", () => {
    const r = evaluateStabilizeMode({
      ...base,
      sensor_source_summary: "stale",
      has_stale_or_invalid_sensor_data: true,
      recent_action_count_48h: 1,
      recent_major_change_count_48h: 0,
      ai_doctor_confidence_level: "low",
    });
    expect(r.confidence).not.toBe("high");
    expect(r.limitations.length).toBeGreaterThan(0);
    const blob = JSON.stringify(r).toLowerCase();
    expect(blob).not.toContain("healthy");
    expect(blob).not.toMatch(/\bdefinitely\b|\bguaranteed\b|\bcaused\b|\bcure\b/);
  });

  it("a stressed/recovering plant biases toward the low-stress path, never aggressive correction", () => {
    const r = evaluateStabilizeMode({
      ...base,
      plant_status: "recovering",
      recent_action_count_48h: 3,
      recent_major_change_count_48h: 0,
    });
    expect(r.safety_flags).toContain("prefer_low_stress_path");
    expect(r.what_not_to_do.join(" ")).toMatch(/defoliation|transplant|high-stress|nutrient|equipment/i);
  });

  it("a calm, well-evidenced context stays OFF (no false alarm)", () => {
    const r = evaluateStabilizeMode({
      now: NOW,
      last_log_at: new Date(NOW - 2 * HOUR).toISOString(),
      recent_action_count_48h: 0,
      recent_major_change_count_48h: 0,
      active_alert_count: 0,
      sensor_source_summary: "live",
      has_stale_or_invalid_sensor_data: false,
      has_demo_or_manual_only_sensor_data: false,
      ai_doctor_confidence_level: "high",
    });
    expect(r.level).toBe("off");
    expect(r.what_not_to_do).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D. Determinism (repeat interaction is safe)
// ---------------------------------------------------------------------------

describe("determinism — identical input yields byte-equivalent output", () => {
  it("stabilize + recovery are stable under repeat evaluation", () => {
    const input = {
      now: NOW,
      recent_action_count_48h: 4,
      recent_major_change_count_48h: 2,
      active_alert_count: 1,
      sensor_source_summary: "manual" as const,
      has_stale_or_invalid_sensor_data: true,
      has_demo_or_manual_only_sensor_data: true,
    };
    expect(JSON.stringify(evaluateStabilizeMode(input))).toBe(
      JSON.stringify(evaluateStabilizeMode(input)),
    );
    const rin = { rows: [], now: NOW };
    expect(JSON.stringify(buildNoRecentLogRecovery(rin))).toBe(
      JSON.stringify(buildNoRecentLogRecovery(rin)),
    );
  });
});

// ---------------------------------------------------------------------------
// E. Static safety over the recovery-loop surface (failed-save + no writes)
// ---------------------------------------------------------------------------

describe("static safety — recovery-loop surface", () => {
  const QUICK_LOG = read("src/components/PlantQuickLog.tsx");
  const RECAP = read("src/components/PlantDetailRecentActivityRecap.tsx");
  const RULE_FILES = [
    "src/lib/noRecentLogRecoveryRules.ts",
    "src/lib/tenSecondQuickCheckRules.ts",
    "src/lib/stabilizeModeRules.ts",
    "src/lib/plantStabilizeModeViewModel.ts",
  ];

  it("FAILED saves stay failed: the Timeline signal only fires after a successful insert", () => {
    // The success dispatch must appear AFTER the insert-error guard, and the
    // error branch must return before any success dispatch/toast.
    const insertIdx = QUICK_LOG.indexOf('.from("diary_entries").insert');
    const errorGuardIdx = QUICK_LOG.indexOf("if (insErr)");
    const dispatchIdx = QUICK_LOG.indexOf('"verdant:entry-created"');
    expect(insertIdx).toBeGreaterThan(-1);
    expect(errorGuardIdx).toBeGreaterThan(insertIdx);
    expect(dispatchIdx).toBeGreaterThan(errorGuardIdx);
    // The error path surfaces a calm message and returns (no success side effects).
    const errorBlock = QUICK_LOG.slice(errorGuardIdx, dispatchIdx);
    expect(errorBlock).toMatch(/setError\(/);
    expect(errorBlock).toMatch(/return;/);
  });

  it("reuses the single diary path — no second persistence path or grow_events write", () => {
    for (const src of [QUICK_LOG, RECAP]) {
      expect(src).not.toMatch(/quicklog_save_manual|quicklog_save_event/);
      expect(src).not.toMatch(/\.from\(["']grow_events["']\)/);
    }
  });

  it("no Action Queue / alert writes, no device control, no automation anywhere in the loop", () => {
    for (const rel of [
      "src/components/PlantQuickLog.tsx",
      "src/components/PlantDetailRecentActivityRecap.tsx",
      ...RULE_FILES,
    ]) {
      const src = stripSourceComments(read(rel));
      expect(src).not.toMatch(/\.from\(["'](action_queue|alerts)["']\)/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/mqtt|webhook|\bactuator\b|\brelay\b|device_command|dispatchCommand/i);
      expect(src).not.toMatch(/\bauto[-_ ]?execute\b|\bautopilot\b/i);
      expect(src).not.toMatch(/openai|anthropic|gemini/i);
    }
  });

  it("guidance copy is conservative and non-causal (never 'definitely', never causal claims)", () => {
    for (const rel of RULE_FILES) {
      const src = read(rel);
      expect(src).not.toMatch(/\bdefinitely\b|\bguaranteed\b|\bwill fix\b|\bcaused the\b|\bcures?\b/i);
    }
  });
});

// ---------------------------------------------------------------------------
// F. Prefocus wiring — the recovery CTA lands the grower on the status chips
// ---------------------------------------------------------------------------

describe("prefocus — status-check CTA opens Quick Log focused on Better/Same/Worse", () => {
  const QUICK_LOG = read("src/components/PlantQuickLog.tsx");
  const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

  it("PlantQuickLog exposes an opt-in focus flag and focuses the response section on open", () => {
    expect(QUICK_LOG).toMatch(/focusResponseCheckOnOpen\?:\s*boolean/);
    // The effect keys on (open, focusResponseCheckOnOpen) and focuses the
    // response section ref — focus only, never a chip selection.
    expect(QUICK_LOG).toMatch(/responseSectionRef/);
    expect(QUICK_LOG).toMatch(/\[open,\s*focusResponseCheckOnOpen\]/);
    expect(QUICK_LOG).toMatch(/responseSectionRef\.current/);
    // The response section is the focus target and is programmatically focusable.
    const sectionIdx = QUICK_LOG.indexOf('data-testid="plant-quick-log-response-section"');
    const refBlock = QUICK_LOG.slice(sectionIdx - 400, sectionIdx);
    expect(refBlock).toMatch(/ref=\{responseSectionRef\}/);
    expect(refBlock).toMatch(/tabIndex=\{-1\}/);
    // Focus, not selection: no chip is pre-clicked.
    expect(QUICK_LOG).not.toMatch(/handleResponseCheck\((["'])(Better|Same|Worse)\1\).*onOpen/);
  });

  it("PlantDetail wires the flag ONLY through the status-check CTA and resets it on close", () => {
    // The missed-log recovery / follow-up CTA sets the focus intent.
    expect(PLANT_DETAIL).toMatch(/onAddQuickCheck=\{[\s\S]*setQuickLogFocusResponse\(true\)[\s\S]*setQuickLogOpen\(true\)/);
    // The sheet receives the flag and clears it on close (so unrelated opens
    // — photo upload, sensor update — never hijack focus to the chips).
    expect(PLANT_DETAIL).toMatch(/focusResponseCheckOnOpen=\{quickLogFocusResponse\}/);
    expect(PLANT_DETAIL).toMatch(/if \(!o\) setQuickLogFocusResponse\(false\)/);
    // The non-status open triggers do NOT set the focus flag.
    expect(PLANT_DETAIL).toMatch(/onUploadPhoto=\{\(\) => setQuickLogOpen\(true\)\}/);
  });
});
