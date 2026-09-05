/**
 * QUICKLOG_NAMED_PHOTO_SLOTS_V0 — stamp/parse + V0 visibility.
 * Pure rules only; no I/O.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EVIDENCE_PHOTO_SLOTS,
  V0_VISIBLE_SLOTS,
  parseSlot,
  stampSlot,
} from "@/lib/evidencePhotoSlotRules";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const RULES = stripSourceComments(
  readFileSync(resolve(ROOT, "src/lib/evidencePhotoSlotRules.ts"), "utf8"),
);
const PANEL = stripSourceComments(
  readFileSync(resolve(ROOT, "src/components/GuidedGrowWalkPanel.tsx"), "utf8"),
);
const BANNER = stripSourceComments(
  readFileSync(resolve(ROOT, "src/components/PendingCheckpointBanner.tsx"), "utf8"),
);

describe("EVIDENCE_PHOTO_SLOTS frozen catalog", () => {
  it("pins the four slot ids in order", () => {
    expect(EVIDENCE_PHOTO_SLOTS).toEqual(["same-angle", "canopy", "runoff", "underside"]);
  });
});

describe("V0_VISIBLE_SLOTS", () => {
  it("exposes only same-angle", () => {
    expect(V0_VISIBLE_SLOTS).toEqual(["same-angle"]);
  });

  it("does not include canopy, runoff, or underside", () => {
    expect(V0_VISIBLE_SLOTS).not.toContain("canopy");
    expect(V0_VISIBLE_SLOTS).not.toContain("runoff");
    expect(V0_VISIBLE_SLOTS).not.toContain("underside");
  });
});

describe("stampSlot / parseSlot", () => {
  it("stamps an empty caption as [same-angle]", () => {
    expect(stampSlot("", "same-angle")).toBe("[same-angle]");
    expect(stampSlot("   ", "same-angle")).toBe("[same-angle]");
  });

  it("prefixes a non-empty caption and remains parseable", () => {
    const stamped = stampSlot("Follow-up: Recheck tips", "same-angle");
    expect(stamped).toBe("[same-angle] Follow-up: Recheck tips");
    expect(parseSlot(stamped)).toBe("same-angle");
  });

  it("is idempotent for the same slot", () => {
    const once = stampSlot("leaf curl", "same-angle");
    expect(stampSlot(once, "same-angle")).toBe(once);
  });

  it("replaces a different leading slot stamp", () => {
    expect(stampSlot("[canopy] overhead", "same-angle")).toBe("[same-angle] overhead");
  });

  it("parses known leading stamps and rejects unknown / missing", () => {
    expect(parseSlot("[same-angle]")).toBe("same-angle");
    expect(parseSlot("[canopy] x")).toBe("canopy");
    expect(parseSlot("[runoff]")).toBe("runoff");
    expect(parseSlot("[underside] tip")).toBe("underside");
    expect(parseSlot("[unknown] x")).toBeNull();
    expect(parseSlot("no stamp")).toBeNull();
    expect(parseSlot("")).toBeNull();
  });

  it("stamps every frozen slot deterministically", () => {
    for (const slot of EVIDENCE_PHOTO_SLOTS) {
      expect(stampSlot("", slot)).toBe(`[${slot}]`);
      expect(parseSlot(stampSlot("body", slot))).toBe(slot);
    }
  });
});

describe("wiring (static)", () => {
  it("rules module has no I/O", () => {
    expect(RULES).not.toMatch(/supabase|fetch\(|localStorage|action_queue|migration/i);
  });

  it("GuidedGrowWalkPanel offers V0 same-angle chip on deep evidence path", () => {
    expect(PANEL).toMatch(/V0_VISIBLE_SLOTS/);
    expect(PANEL).toMatch(/evidence-photo-slot-\$\{slot\}/);
    expect(PANEL).toMatch(/deep_evidence_walk/);
    expect(PANEL).toMatch(/stampSlot/);
    expect(PANEL).not.toMatch(/evidence-photo-slot-canopy/);
  });

  it("PendingCheckpointBanner Same-angle uses stampSlot same-angle", () => {
    expect(BANNER).toMatch(/stampSlot\(/);
    expect(BANNER).toMatch(/"same-angle"/);
    expect(BANNER).toMatch(/PLANT_QUICKLOG_PREFILL_EVENT|verdant:open-quicklog/);
  });
});
