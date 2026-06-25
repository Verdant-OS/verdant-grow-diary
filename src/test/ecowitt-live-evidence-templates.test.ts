/**
 * EcoWitt Live Evidence quick-fill templates tests — pure deterministic.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ECOWITT_LIVE_EVIDENCE_TEMPLATES,
  getEcowittLiveEvidenceTemplate,
} from "@/lib/ecowittLiveEvidenceTemplates";
import { buildLiveSourceTruthEvidenceFromForm } from "@/lib/ecowittLiveEvidenceFormRules";
import { evaluateLiveSourceTruth } from "@/lib/liveSourceTruthGateRules";

describe("ECOWITT_LIVE_EVIDENCE_TEMPLATES", () => {
  it("exposes three templates with example labels and descriptions", () => {
    const ids = ECOWITT_LIVE_EVIDENCE_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual([
      "live_verified_example",
      "manual_comparison_example",
      "stale_evidence_example",
    ]);
    for (const t of ECOWITT_LIVE_EVIDENCE_TEMPLATES) {
      expect(t.label.toLowerCase()).toMatch(/example/);
      expect(t.description.toLowerCase()).toMatch(/example/);
    }
  });

  it("live example fills form fields and evaluates to verified_live", () => {
    const t = getEcowittLiveEvidenceTemplate("live_verified_example")!;
    const state = t.build();
    expect(state.source).toBe("live");
    expect(state.tent_id).toBe("example-tent");
    expect(state.plant_id).toBe("example-plant-1");
    expect(state.raw_payload_present).toBe(true);
    expect(state.normalized_payload_present).toBe(true);
    expect(state.operator_compared_controller).toBe(true);
    const tempRow = state.metric_rows.find((r) => r.key === "temp_f")!;
    expect(tempRow.enabled).toBe(true);
    expect(tempRow.backend_value).toBe("72");
    expect(tempRow.controller_value).toBe("72");
    const built = buildLiveSourceTruthEvidenceFromForm(state);
    const res = evaluateLiveSourceTruth(built.evidence);
    expect(res.verdict).toBe("verified_live");
  });

  it("manual example evaluates to not_live_proof", () => {
    const t = getEcowittLiveEvidenceTemplate("manual_comparison_example")!;
    const state = t.build();
    expect(state.source).toBe("manual");
    expect(state.operator_compared_controller).toBe(true);
    const built = buildLiveSourceTruthEvidenceFromForm(state);
    const res = evaluateLiveSourceTruth(built.evidence);
    expect(res.verdict).toBe("not_live_proof");
  });

  it("stale example evaluates to stale", () => {
    const t = getEcowittLiveEvidenceTemplate("stale_evidence_example")!;
    const state = t.build();
    const built = buildLiveSourceTruthEvidenceFromForm(state);
    const res = evaluateLiveSourceTruth(built.evidence);
    expect(res.verdict).toBe("stale");
  });

  it("templates use only example identifiers, never real secrets/tokens", () => {
    for (const t of ECOWITT_LIVE_EVIDENCE_TEMPLATES) {
      const s = t.build();
      const blob = JSON.stringify(s);
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/bridge[-_ ]?token/i);
      expect(blob).not.toMatch(/OPENAI_API_KEY/);
      expect(blob).not.toMatch(/VITE_/);
      expect(blob).not.toMatch(/sk-[A-Za-z0-9]/);
      // tent / plant identifiers must be example-prefixed when present
      if (s.tent_id) expect(s.tent_id.toLowerCase()).toMatch(/example/);
      if (s.plant_id) expect(s.plant_id.toLowerCase()).toMatch(/example/);
    }
  });
});

describe("ecowittLiveEvidenceTemplates — static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../../src/lib/ecowittLiveEvidenceTemplates.ts"),
    "utf8",
  );
  const noComments = src
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  it("does not call Date.now()", () => {
    expect(noComments).not.toMatch(/Date\.now\s*\(/);
  });
  it("has no fetch/supabase/persistence references", () => {
    expect(noComments).not.toMatch(/fetch\s*\(/);
    expect(noComments).not.toMatch(/supabase/i);
    expect(noComments).not.toContain("localStorage");
    expect(noComments).not.toContain("sessionStorage");
    expect(noComments).not.toContain("navigator.clipboard");
  });
});
