/**
 * Legacy VPD alert "Why this alert?" derivation tests.
 *
 * Covers the loose-stage fallback added to `deriveAlertWhyContext` for
 * environment alerts whose title/reason pre-date the canonical
 * "<stage> range" wording. Only `metric === "vpd"` opts in to the loose
 * fallback — Temp/RH behavior stays strict.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";

import {
  deriveAlertWhyContext,
  type AlertLike,
} from "@/lib/alertWhyContext";
import { AlertWhyContext } from "@/components/AlertWhyContext";

const LEGACY_VPD_FLOWER: AlertLike = {
  metric: "vpd",
  title: "VPD outside target",
  reason: "VPD has drifted outside the flower target. Observed 1.8 kPa.",
};

const LEGACY_VPD_VEG: AlertLike = {
  metric: "vpd",
  title: "VPD too low",
  reason: "Reading 0.5 kPa during veg phase.",
};

const LEGACY_VPD_UNKNOWN_STAGE: AlertLike = {
  metric: "vpd",
  title: "VPD outside target",
  reason: "VPD reading drifted outside target. Observed 1.8 kPa.",
};

const LEGACY_VPD_HARVEST: AlertLike = {
  metric: "vpd",
  title: "VPD outside target",
  reason: "VPD captured during drying — context only.",
};

const LEGACY_TEMP_UNCHANGED: AlertLike = {
  metric: "temp",
  title: "Temperature above default range",
  reason: "Observed 33°C during flower phase.",
};

const LEGACY_RH_UNCHANGED: AlertLike = {
  metric: "rh",
  title: "Humidity high",
  reason: "Observed 72% during veg.",
};

describe("legacy VPD alerts — stage-aware why-context fallback", () => {
  it("legacy flower VPD alert → 'Flower VPD target: 1.0–1.5 kPa'", () => {
    const w = deriveAlertWhyContext(LEGACY_VPD_FLOWER);
    expect(w.kind).toBe("stage");
    expect(w.text).toBe("Flower VPD target: 1.0–1.5 kPa");
    if (w.kind === "stage") {
      expect(w.metric).toBe("vpd");
      expect(w.stage).toBe("flower");
      expect(w.unit).toBe("kPa");
    }
  });

  it("legacy veg VPD alert → 'Veg VPD target: 0.8–1.2 kPa'", () => {
    const w = deriveAlertWhyContext(LEGACY_VPD_VEG);
    expect(w.kind).toBe("stage");
    expect(w.text).toBe("Veg VPD target: 0.8–1.2 kPa");
  });

  it("legacy VPD alert with no recognizable stage → unavailable fallback", () => {
    const w = deriveAlertWhyContext(LEGACY_VPD_UNKNOWN_STAGE);
    expect(w.kind).toBe("unavailable");
    expect(w.text).toBe("Target context unavailable for this alert.");
  });

  it("legacy harvest/drying VPD alert → context-only copy, no numeric band", () => {
    const w = deriveAlertWhyContext(LEGACY_VPD_HARVEST);
    expect(w.kind).toBe("context_only");
    if (w.kind === "context_only") {
      expect(w.metric).toBe("vpd");
      expect(w.stage).toBe("harvest");
      expect(w.text).toContain("Harvest");
      expect(w.text).toContain("context only");
    }
    expect(w.text).not.toMatch(/\d+\.\d+\s*–\s*\d+\.\d+\s*kPa/);
  });

  it("legacy Temp alert behavior is unchanged (no loose stage fallback)", () => {
    const w = deriveAlertWhyContext(LEGACY_TEMP_UNCHANGED);
    expect(w.kind).toBe("unavailable");
  });

  it("legacy RH alert behavior is unchanged (no loose stage fallback)", () => {
    const w = deriveAlertWhyContext(LEGACY_RH_UNCHANGED);
    expect(w.kind).toBe("unavailable");
  });

  it("detailed presenter on legacy flower VPD → renders stage + range rows", () => {
    render(<AlertWhyContext alert={LEGACY_VPD_FLOWER} variant="detailed" />);
    const root = screen.getByTestId("alert-why-detailed");
    expect(root.getAttribute("data-kind")).toBe("stage");
    expect(screen.getByTestId("alert-why-stage").textContent).toBe("Flower");
    expect(screen.getByTestId("alert-why-range").textContent).toBe(
      "1.0–1.5 kPa",
    );
  });

  it("detailed presenter on legacy harvest VPD → renders context-only text without range rows", () => {
    render(<AlertWhyContext alert={LEGACY_VPD_HARVEST} variant="detailed" />);
    const root = screen.getByTestId("alert-why-detailed");
    expect(root.getAttribute("data-kind")).toBe("context_only");
    expect(root.textContent).toContain("Harvest");
    expect(root.textContent).toContain("context only");
    expect(screen.queryByTestId("alert-why-stage")).toBeNull();
    expect(screen.queryByTestId("alert-why-range")).toBeNull();
  });
});

describe("static safety — legacy VPD fallback", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/alertWhyContext.ts"),
    "utf8",
  );
  it("alertWhyContext.ts: no alert writes / queue / service_role / AI Doctor / automation / device control", () => {
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["'][^"']*ai[-_]?(doctor|coach)/i);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|device_command|autopilot/i,
    );
  });
});
