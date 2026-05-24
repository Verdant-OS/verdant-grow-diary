/**
 * Static guardrail: the Relative Cultivation Timeline foundation must
 * remain pure rules + docs + tests. It must not introduce:
 *
 *   - calendar_events / notifications tables
 *   - email provider integrations
 *   - drag-and-drop calendar libraries
 *   - automatic plant.stage mutation
 *   - device control surfaces
 *   - service_role usage
 *   - fake live data
 *   - forbidden marketing wording
 *
 * The test inspects:
 *   - docs/relative-cultivation-timeline.md
 *   - src/lib/relativeStageTimelineRules.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const RULES = readFileSync(
  resolve(ROOT, "src/lib/relativeStageTimelineRules.ts"),
  "utf8",
);
const DOC = readFileSync(
  resolve(ROOT, "docs/relative-cultivation-timeline.md"),
  "utf8",
);

describe("relative cultivation timeline — static guardrails (rules module)", () => {
  it("does not reference calendar_events / notifications / reminders tables", () => {
    expect(RULES).not.toMatch(/calendar_events/);
    expect(RULES).not.toMatch(/\bnotifications\b/);
    expect(RULES).not.toMatch(/\breminders\b/);
  });

  it("does not call Supabase / service_role / RPC", () => {
    expect(RULES).not.toMatch(/supabase/i);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/\.rpc\(/);
    expect(RULES).not.toMatch(/\.(insert|update|delete|upsert|select)\s*\(/);
  });

  it("does not call email / push providers", () => {
    expect(RULES).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio|firebase[-_ ]?messaging/i);
  });

  it("does not import drag-and-drop calendar libraries", () => {
    expect(RULES).not.toMatch(
      /react-dnd|dnd-kit|fullcalendar|react-big-calendar|react-beautiful-dnd/i,
    );
  });

  it("does not contain device control / automation surfaces", () => {
    expect(RULES).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|fan|pump|valve|dehumidifier|humidifier/i,
    );
  });

  it("does not generate dummy tasks or fake live data", () => {
    expect(RULES).not.toMatch(/dummy/i);
    expect(RULES).not.toMatch(/fake[\s_-]?live/i);
  });

  it("does not auto-mutate plant.stage", () => {
    // No write to a plant.stage field anywhere.
    expect(RULES).not.toMatch(/plant\.stage\s*=/);
    expect(RULES).not.toMatch(/plants?\.stage\s*=/);
    // autoApply must remain false.
    expect(RULES).toMatch(/autoApply:\s*false/);
  });

  it("locks stage shift drafts to approval-required", () => {
    expect(RULES).toMatch(/requiresApproval:\s*true/);
  });

  it("does not use forbidden marketing wording", () => {
    for (const word of [/\bperfect\b/i, /\bcompleted\b/i, /guaranteed healthy/i]) {
      expect(RULES).not.toMatch(word);
      expect(DOC).not.toMatch(word);
    }
  });
});

describe("relative cultivation timeline — doc contract", () => {
  it("documents anchors and approval-required stage shifts", () => {
    expect(DOC).toMatch(/plantStartedAt/);
    expect(DOC).toMatch(/stageStartedAt/);
    expect(DOC).toMatch(/grower-approved/i);
    expect(DOC).toMatch(/approval/i);
  });

  it("documents autoflower flexibility and no dummy tasks", () => {
    expect(DOC).toMatch(/autoflower/i);
    expect(DOC).toMatch(/dummy tasks/i);
  });

  it("documents QuickLog Gate 1 as the prerequisite for visual timeline", () => {
    expect(DOC).toMatch(/QuickLog/);
    expect(DOC).toMatch(/Gate 1/);
  });

  it("lists all six stage presets and color directions", () => {
    for (const label of ["Seedling", "Clone", "Vegetation", "Flower", "Dry", "Cure"]) {
      expect(DOC).toContain(label);
    }
    expect(DOC).toMatch(/Soft Mint Green/);
    expect(DOC).toMatch(/Vibrant Teal/);
    expect(DOC).toMatch(/Lush Emerald Green/);
    expect(DOC).toMatch(/Deep Ultraviolet/);
    expect(DOC).toMatch(/Amber/);
    expect(DOC).toMatch(/Rich Earthy Brown/);
  });
});
