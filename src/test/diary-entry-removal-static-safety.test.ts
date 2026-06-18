/**
 * Static safety scan for the diary entry removal slice.
 *
 * Guards against accidental scope creep into sensors, AI, alerts,
 * Action Queue, device control, bulk delete, or secret exposure.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const RULES = read("src/lib/diaryEntryRemovalRules.ts");
const INVALIDATION = read("src/lib/diaryEntryRemovalInvalidationRules.ts");
const HOOK = read("src/hooks/useRemoveDiaryEntry.ts");
const COMPONENT = read("src/components/DiaryEntryRemoveButton.tsx");
const FILES = [
  { name: "rules", src: RULES },
  { name: "invalidation", src: INVALIDATION },
  { name: "hook", src: HOOK },
  { name: "component", src: COMPONENT },
];

describe("diary removal slice — static safety", () => {
  it("rules module is pure (no React, no supabase, no toast)", () => {
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/sonner/);
  });

  it("invalidation module is pure (no React, no supabase, no toast, no react-query runtime)", () => {
    expect(INVALIDATION).not.toMatch(/from\s+["']react["']/);
    expect(INVALIDATION).not.toMatch(/@\/integrations\/supabase/);
    expect(INVALIDATION).not.toMatch(/sonner/);
    expect(INVALIDATION).not.toMatch(/@tanstack\/react-query/);
  });

  it("does not touch sensor_readings", () => {
    for (const f of FILES) {
      expect(f.src, f.name).not.toMatch(/sensor_readings/);
    }
  });

  it("does not import AI / model helpers", () => {
    for (const f of FILES) {
      expect(f.src, f.name).not.toMatch(/aiDoctor|ai-coach|ai_coach|aiCoach|callModel|openai|anthropic/i);
    }
  });

  it("does not import alerts or action_queue", () => {
    for (const f of FILES) {
      expect(f.src, f.name).not.toMatch(/action_queue/);
      expect(f.src, f.name).not.toMatch(/from\s+["'][^"']*\/alerts?["']/);
    }
  });

  it("does not import device-control helpers", () => {
    for (const f of FILES) {
      expect(f.src, f.name).not.toMatch(/device[-_ ]?control/i);
      expect(f.src, f.name).not.toMatch(/relay|smart[-_ ]?plug/i);
    }
  });

  it("no service role or token exposure", () => {
    for (const f of FILES) {
      expect(f.src, f.name).not.toMatch(/service_role|SERVICE_ROLE|bridge_token/);
    }
  });

  it("delete path is scoped by id only — no bulk delete", () => {
    // Hook deletes by .eq('id', id); no .in(, .neq(, or unconditional .delete()
    expect(HOOK).toMatch(/\.delete\(\)[\s\S]*?\.eq\(["']id["']/);
    expect(HOOK).not.toMatch(/\.delete\(\)\s*\.in\(/);
    expect(HOOK).not.toMatch(/\.delete\(\)\s*\.neq\(/);
  });

  it("hook does not touch storage buckets", () => {
    expect(HOOK).not.toMatch(/supabase\.storage/);
  });

  it("component refuses customer/public/report views via rules", () => {
    expect(COMPONENT).toMatch(/canRemoveDiaryEntry/);
  });
});
