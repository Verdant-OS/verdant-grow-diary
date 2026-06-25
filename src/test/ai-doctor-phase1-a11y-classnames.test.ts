/**
 * AI Doctor Phase 1 — shared a11y classnames tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES,
  AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES,
  AI_DOCTOR_PHASE1_SKIP_LINK_CLASSES,
  aiDoctorPhase1InteractiveClassName,
} from "@/lib/aiDoctorPhase1A11yClassNames";

describe("AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES", () => {
  it("includes the expected focus-visible ring tokens", () => {
    expect(AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES).toMatch(
      /\bfocus-visible:outline-none\b/,
    );
    expect(AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES).toMatch(
      /\bfocus-visible:ring-2\b/,
    );
    expect(AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES).toMatch(
      /\bfocus-visible:ring-offset-2\b/,
    );
  });

  it("never hides outlines without a focus replacement", () => {
    expect(AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES).not.toMatch(
      /\boutline-none\b(?!.*focus-visible:ring)/,
    );
  });
});

describe("AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES", () => {
  it("includes a thumb-friendly min height", () => {
    expect(AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES).toMatch(/\bmin-h-10\b/);
  });
});

describe("AI_DOCTOR_PHASE1_SKIP_LINK_CLASSES", () => {
  it("uses sr-only with focus-visible override and shared focus ring", () => {
    expect(AI_DOCTOR_PHASE1_SKIP_LINK_CLASSES).toMatch(/\bsr-only\b/);
    expect(AI_DOCTOR_PHASE1_SKIP_LINK_CLASSES).toMatch(/\bfocus:not-sr-only\b/);
    expect(AI_DOCTOR_PHASE1_SKIP_LINK_CLASSES).toMatch(
      /\bfocus-visible:ring-2\b/,
    );
  });
});

describe("aiDoctorPhase1InteractiveClassName", () => {
  it("returns the focus ring + touch target by default", () => {
    const out = aiDoctorPhase1InteractiveClassName();
    expect(out).toContain(AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES);
    expect(out).toContain(AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES);
  });

  it("appends caller-supplied extras", () => {
    const out = aiDoctorPhase1InteractiveClassName("rounded-md bg-secondary");
    expect(out).toContain("rounded-md bg-secondary");
    expect(out).toContain(AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES);
  });

  it("ignores empty/whitespace extras safely", () => {
    expect(aiDoctorPhase1InteractiveClassName("   ")).toBe(
      aiDoctorPhase1InteractiveClassName(),
    );
  });
});

describe("static safety — aiDoctorPhase1A11yClassNames", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/aiDoctorPhase1A11yClassNames.ts"),
    "utf8",
  );

  it("no Supabase/fetch/model/write/device-control surface", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway/i);
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
    expect(SRC).not.toMatch(/service_role|bridge[_-]?token/i);
  });
});
