import { describe, it, expect } from "vitest";
import {
  buildEcowittDiaryAttachPreview,
  ECOWITT_DIARY_PREVIEW_DISABLED_LABEL,
  ECOWITT_DIARY_PREVIEW_NOTICE,
} from "@/lib/ecowittDiaryAttachPreview";
import { normalizeEcowittTentPayload } from "@/lib/ecowittTentNormalizerRouter";
import { loadEcowittEvidenceSample } from "@/lib/ecowittLocalEvidence";

const NOW = new Date("2026-06-16T12:00:00.000Z");

function snap(tentKey: "flower" | "seedling" | "vegetation", sampleKey: Parameters<typeof loadEcowittEvidenceSample>[0]) {
  const loaded = loadEcowittEvidenceSample(sampleKey, { now: NOW });
  return normalizeEcowittTentPayload(loaded.sample.payload, tentKey, {
    now: NOW,
    captured_at_ms: loaded.captured_at_ms,
  });
}

describe("EcoWitt diary attach preview", () => {
  it("valid Flower snapshot builds a preview-only draft (no writes)", () => {
    const s = snap("flower", "valid");
    const p = buildEcowittDiaryAttachPreview(s);
    expect(p.notice).toBe(ECOWITT_DIARY_PREVIEW_NOTICE);
    expect(p.title).toBe("EcoWitt snapshot preview — Flower Tent");
    expect(p.source_label).toBe("LIVE");
    expect(p.attach_button_disabled).toBe(true);
    expect(p.disabled_label).toBe(ECOWITT_DIARY_PREVIEW_DISABLED_LABEL);
    expect(p.body).toContain("No database write has occurred.");
    expect(p.body).toContain("Flower Tent");
  });

  it("degraded Seedling snapshot includes degraded warning", () => {
    const s = snap("seedling", "degraded");
    const p = buildEcowittDiaryAttachPreview(s, { is_stale: true });
    expect(p.source_label).toMatch(/DEGRADED|INVALID/);
    expect(p.warnings.join(" ")).toMatch(/DEGRADED|stale/i);
  });

  it("invalid Vegetation snapshot includes invalid warning", () => {
    const s = snap("vegetation", "invalid");
    const p = buildEcowittDiaryAttachPreview(s);
    expect(p.source_label).toBe("INVALID");
    expect(p.warnings.some((w) => /INVALID/i.test(w))).toBe(true);
  });

  it("preview contains source/provider/captured_at/tent label", () => {
    const s = snap("flower", "valid");
    const p = buildEcowittDiaryAttachPreview(s);
    expect(p.provider).toBe("ecowitt");
    expect(p.tent_label).toBe("Flower Tent");
    expect(typeof p.captured_at).toBe("string");
  });

  it("preview body does not include cultivation recommendations", () => {
    const s = snap("flower", "valid");
    const body = buildEcowittDiaryAttachPreview(s).body.toLowerCase();
    for (const banned of [
      "increase ",
      "decrease ",
      "feed ",
      "nutrient",
      "irrigat",
      "defoliat",
      "transplant",
      "ppm",
      "ec ",
      "ph ",
      "raise the",
      "lower the",
      "turn on",
      "turn off",
    ]) {
      expect(body.includes(banned)).toBe(false);
    }
  });

  it("disabled attach button + disabled label render", () => {
    const s = snap("flower", "valid");
    const p = buildEcowittDiaryAttachPreview(s);
    expect(p.attach_button_label).toBe("Attach to diary");
    expect(p.attach_button_disabled).toBe(true);
    expect(p.disabled_label).toBe("Save disabled in preview");
  });

  it("never renders private fields in the diary preview JSON", () => {
    const s = snap("flower", "valid");
    const json = JSON.stringify(buildEcowittDiaryAttachPreview(s)).toLowerCase();
    for (const banned of [
      "passkey",
      "token",
      "password",
      "station",
      "secret",
      "private_ip",
      "remote_ip",
      "client_ip",
      '"mac"',
    ]) {
      expect(json.includes(banned)).toBe(false);
    }
  });
});
