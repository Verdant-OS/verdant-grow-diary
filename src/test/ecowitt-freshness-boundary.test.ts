import { describe, it, expect } from "vitest";
import {
  ECOWITT_EVIDENCE_FRESHNESS_WINDOW_MS,
  ECOWITT_PREVIEW_SAMPLES,
  getEcowittPreviewSample,
} from "@/fixtures/ecowitt-preview-samples";
import {
  ECOWITT_EVIDENCE_FRESHNESS_MS,
  isEcowittEvidenceStale,
  loadEcowittEvidenceSample,
} from "@/lib/ecowittLocalEvidence";
import { buildEcowittLocalEvidencePreviewViewModel } from "@/lib/ecowittLocalEvidenceViewModel";

describe("EcoWitt freshness boundary fixtures", () => {
  const NOW = new Date("2026-06-16T12:00:00.000Z");

  it("freshness window constants agree between fixtures and helper", () => {
    expect(ECOWITT_EVIDENCE_FRESHNESS_WINDOW_MS).toBe(ECOWITT_EVIDENCE_FRESHNESS_MS);
  });

  it("just-fresh sample sits exactly at the freshness boundary", () => {
    const sample = getEcowittPreviewSample("just-fresh");
    expect(sample.captured_age_ms).toBe(ECOWITT_EVIDENCE_FRESHNESS_WINDOW_MS);
  });

  it("just-stale sample sits one ms past the freshness boundary", () => {
    const sample = getEcowittPreviewSample("just-stale");
    expect(sample.captured_age_ms).toBe(ECOWITT_EVIDENCE_FRESHNESS_WINDOW_MS + 1);
  });

  it("just-fresh does NOT show stale (age == window is not stale)", () => {
    const loaded = loadEcowittEvidenceSample("just-fresh", { now: NOW });
    expect(isEcowittEvidenceStale(loaded)).toBe(false);
    const vm = buildEcowittLocalEvidencePreviewViewModel({
      tentKey: "flower",
      sampleKey: "just-fresh",
      now: NOW,
    });
    expect(vm.is_stale).toBe(false);
    expect(vm.stale_copy).toBeNull();
  });

  it("just-stale DOES show stale (age > window)", () => {
    const loaded = loadEcowittEvidenceSample("just-stale", { now: NOW });
    expect(isEcowittEvidenceStale(loaded)).toBe(true);
    const vm = buildEcowittLocalEvidencePreviewViewModel({
      tentKey: "flower",
      sampleKey: "just-stale",
      now: NOW,
    });
    expect(vm.is_stale).toBe(true);
    expect(vm.stale_copy).toMatch(/Stale evidence/i);
  });

  it("boundary fixtures contain no private fields (PASSKEY/MAC/IP/token/station)", () => {
    for (const key of ["just-fresh", "just-stale"] as const) {
      const sample = getEcowittPreviewSample(key);
      const json = JSON.stringify(sample.payload).toLowerCase();
      for (const banned of [
        "passkey",
        "mac",
        "token",
        "password",
        "station",
        "private_ip",
        "remote_ip",
        "client_ip",
        "secret",
      ]) {
        expect(json.includes(banned)).toBe(false);
      }
    }
  });

  it("all bundled samples remain present and stable", () => {
    expect(ECOWITT_PREVIEW_SAMPLES.map((s) => s.key)).toEqual([
      "valid",
      "degraded",
      "invalid",
      "just-fresh",
      "just-stale",
    ]);
  });
});
