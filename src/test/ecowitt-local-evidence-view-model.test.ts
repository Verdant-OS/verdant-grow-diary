import { describe, it, expect } from "vitest";
import { buildEcowittLocalEvidencePreviewViewModel } from "@/lib/ecowittLocalEvidenceViewModel";
import { loadEcowittEvidenceSample, isEcowittEvidenceStale } from "@/lib/ecowittLocalEvidence";
import { ECOWITT_PREVIEW_SAMPLES } from "@/fixtures/ecowitt-preview-samples";
import type { EcowittTentKey } from "@/lib/ecowittTentNormalizerRouter";

const NOW = new Date("2026-06-16T12:00:00Z");
const TENTS: EcowittTentKey[] = ["flower", "seedling", "vegetation"];

describe("ecowittLocalEvidence loader", () => {
  it("loads each named sample without throwing", () => {
    for (const s of ECOWITT_PREVIEW_SAMPLES) {
      const r = loadEcowittEvidenceSample(s.key, { now: NOW });
      expect(r.sample.key).toBe(s.key);
      expect(r.captured_at_ms).toBe(NOW.getTime() - s.captured_age_ms);
      expect(r.source_label).toBe("sample");
    }
  });

  it("flags stale evidence when age exceeds freshness window", () => {
    const r = loadEcowittEvidenceSample("degraded", { now: NOW });
    expect(isEcowittEvidenceStale(r)).toBe(true);
    const r2 = loadEcowittEvidenceSample("valid", { now: NOW });
    expect(isEcowittEvidenceStale(r2)).toBe(false);
  });

  it("fixtures contain no PASSKEY/MAC/token/password/IP fields", () => {
    const banned = /passkey|^mac$|token|password|secret|api_?key|ip\b|station/i;
    for (const s of ECOWITT_PREVIEW_SAMPLES) {
      for (const k of Object.keys(s.payload)) {
        expect(banned.test(k), `forbidden field ${k} in ${s.key}`).toBe(false);
      }
    }
  });
});

describe("buildEcowittLocalEvidencePreviewViewModel", () => {
  it("determinism + completeness: every tent + sample yields fully populated canonical fields", () => {
    for (const tent of TENTS) {
      for (const s of ECOWITT_PREVIEW_SAMPLES) {
        const a = buildEcowittLocalEvidencePreviewViewModel({ tentKey: tent, sampleKey: s.key, now: NOW });
        const b = buildEcowittLocalEvidencePreviewViewModel({ tentKey: tent, sampleKey: s.key, now: NOW });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        const p = a.preview;
        expect(["live", "degraded", "invalid"]).toContain(p.source);
        expect(p.provider).toBe("ecowitt");
        expect(p.tent_label.length).toBeGreaterThan(0);
        expect(["complete", "partial", "missing"]).toContain(p.root_zone_confidence);
        expect(Array.isArray(p.degraded_reasons)).toBe(true);
        expect(Array.isArray(p.invalid_reasons)).toBe(true);
        expect(p.metrics.length).toBeGreaterThan(0);
        expect(typeof p.redacted_raw_preview).toBe("object");
      }
    }
  });

  it("valid sample renders LIVE for all three tents", () => {
    for (const tent of TENTS) {
      const vm = buildEcowittLocalEvidencePreviewViewModel({ tentKey: tent, sampleKey: "valid", now: NOW });
      expect(vm.preview.source).toBe("live");
      expect(vm.is_stale).toBe(false);
      expect(vm.stale_copy).toBeNull();
    }
  });

  it("degraded sample renders degraded reasons and stale warning", () => {
    const vm = buildEcowittLocalEvidencePreviewViewModel({ tentKey: "seedling", sampleKey: "degraded", now: NOW });
    expect(vm.preview.source).toBe("degraded");
    expect(vm.is_stale).toBe(true);
    expect(vm.stale_copy).not.toBeNull();
    expect(vm.preview.degraded_reasons.length).toBeGreaterThan(0);
  });

  it("invalid sample renders invalid state for flower (humidity out of range)", () => {
    const vm = buildEcowittLocalEvidencePreviewViewModel({ tentKey: "flower", sampleKey: "invalid", now: NOW });
    expect(vm.preview.source).toBe("invalid");
    expect(vm.preview.invalid_reasons.some((r) => r.includes("humidity_pct"))).toBe(true);
  });

  it("redacted raw preview strips any private-looking fields", () => {
    const vm = buildEcowittLocalEvidencePreviewViewModel({ tentKey: "flower", sampleKey: "valid", now: NOW });
    const json = JSON.stringify(vm.preview.redacted_raw_preview);
    expect(json).not.toMatch(/PASSKEY/i);
    expect(json).not.toMatch(/\bMAC\b/);
    expect(json).not.toMatch(/token/i);
    expect(json).not.toMatch(/password/i);
    expect(json).not.toMatch(/station/i);
  });

  it("read-only and evidence copy are present", () => {
    const vm = buildEcowittLocalEvidencePreviewViewModel({ tentKey: "flower", sampleKey: "valid", now: NOW });
    expect(vm.read_only_copy).toMatch(/Read-only preview/i);
    expect(vm.evidence_copy).toMatch(/EcoWitt MQTT sample/i);
  });
});
