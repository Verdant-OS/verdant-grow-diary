/**
 * Timeline must not head a group with the machine token "unknown"
 * or print an empty em dash beside Observation when stage was not stored.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stageLabel } from "@/lib/grow";
import { timelineStagePresentationLabel } from "@/lib/timelineStagePresentationRules";

const TIMELINE = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

describe("timeline unresolved stage copy", () => {
  it("replaces the empty dash and the unknown token", () => {
    expect(stageLabel(null)).toBe("—");
    expect(stageLabel("unknown")).toBe("unknown");
    expect(timelineStagePresentationLabel(null)).toBe("Stage not recorded");
    expect(timelineStagePresentationLabel("unknown")).toBe("Stage not recorded");
    expect(timelineStagePresentationLabel("veg")).toBe("Vegetative");
  });

  it("uses the presentation label for the group header and the card", () => {
    expect(TIMELINE).not.toContain('?? "unknown"');
    expect(TIMELINE).toContain("timelineStagePresentationLabel");
  });
});
