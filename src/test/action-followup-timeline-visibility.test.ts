/**
 * action_followup timeline visibility.
 *
 * Verifies that action_followup diary entries are distinguishable from
 * generic observations in the Timeline and badge components.
 *
 * No live DB. No automation. No device control. No alert mutation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getEventType, EVENT_TYPES, EVENT_TYPE_MAP } from "@/lib/diary";

const ROOT = resolve(__dirname, "../..");
const BADGES_SRC = readFileSync(resolve(ROOT, "src/components/DiaryEntryBadges.tsx"), "utf8");

describe("action_followup timeline visibility", () => {
  describe("EVENT_TYPES registry", () => {
    it("includes action_followup as a distinct entry", () => {
      const entry = EVENT_TYPES.find((e) => e.value === "action_followup");
      expect(entry).toBeDefined();
      expect(entry!.label).toBe("Follow-up");
      expect(entry!.tone).toBe("bg-orange-500/15 text-orange-300 border-orange-500/30");
    });

    it("getEventType('action_followup') returns Follow-up, not observation fallback", () => {
      const result = getEventType("action_followup");
      expect(result.value).toBe("action_followup");
      expect(result.label).toBe("Follow-up");
      expect(result).not.toBe(EVENT_TYPE_MAP.observation);
    });

    it("getEventType(undefined) still returns observation as default", () => {
      const result = getEventType(undefined);
      expect(result.value).toBe("observation");
    });
  });

  describe("DiaryEntryBadges PRIMARY_TAGS", () => {
    it("includes action_followup in PRIMARY_TAGS array", () => {
      expect(BADGES_SRC).toContain('"action_followup"');
    });

    it("TAG_LABELS maps action_followup to 'Follow-up'", () => {
      expect(BADGES_SRC).toMatch(/action_followup:\s*"Follow-up"/);
    });
  });
});
