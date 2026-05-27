/**
 * Stage-aware "Why this alert?" derivation + presenter tests.
 *
 * Covers:
 *   - Veg temp alert → "Veg target: 22–28°C"
 *   - Flower VPD alert → "Flower VPD target: 1.0–1.5 kPa"
 *   - Late flower RH alert → "Late flower RH target: 35–50%"
 *   - Unknown / legacy alerts → fallback context copy
 *   - Compact + detailed presenter variants
 *   - Static safety: no alert writes / action_queue / service_role /
 *     AI Doctor / automation / device-control strings introduced.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  deriveAlertWhyContext,
  WHY_PREFIX,
  type AlertLike,
} from "@/lib/alertWhyContext";
import { AlertWhyContext } from "@/components/AlertWhyContext";

const VEG_TEMP_HIGH: AlertLike = {
  metric: "temp",
  title: "Temperature above stage range",
  reason:
    "Temperature is above the veg target range. Observed 31°C (veg range 22°C–28°C). Reading at 2026-05-20T12:00:00Z.",
};

const FLOWER_VPD_HIGH: AlertLike = {
  metric: "vpd",
  title: "VPD above stage range",
  reason:
    "VPD is above the flower target range. Observed 1.9 kPa (flower range 1 kPa–1.5 kPa).",
};

const LATE_FLOWER_RH_HIGH: AlertLike = {
  metric: "rh",
  title: "Humidity above stage range",
  reason:
    "Humidity is above the late flower target range. Observed 70% (late flower range 35%–50%).",
};

const LEGACY_GENERIC_TEMP: AlertLike = {
  metric: "temp",
  title: "Temperature above default range",
  reason:
    "Temperature is above the default safe range. Observed 33°C (default range 18°C–30°C).",
};

const UNKNOWN_STAGE_ALERT: AlertLike = {
  metric: "temp",
  // Title says stage range, but reason has no recognizable stage tail.
  title: "Temperature above stage range",
  reason: "Temperature is above the target range. Observed 33°C.",
};

describe("deriveAlertWhyContext — stage-aware bands", () => {
  it("1. veg temp alert → 'Veg target: 22–28°C'", () => {
    const w = deriveAlertWhyContext(VEG_TEMP_HIGH);
    expect(w.kind).toBe("stage");
    expect(w.text).toBe("Veg target: 22–28°C");
    if (w.kind === "stage") {
      expect(w.metric).toBe("temp");
      expect(w.stage).toBe("veg");
      expect(w.unit).toBe("°C");
    }
  });

  it("2. flower VPD alert → 'Flower VPD target: 1.0–1.5 kPa'", () => {
    const w = deriveAlertWhyContext(FLOWER_VPD_HIGH);
    expect(w.kind).toBe("stage");
    expect(w.text).toBe("Flower VPD target: 1.0–1.5 kPa");
  });

  it("3. late flower RH alert → 'Late flower RH target: 35–50%'", () => {
    const w = deriveAlertWhyContext(LATE_FLOWER_RH_HIGH);
    expect(w.kind).toBe("stage");
    expect(w.text).toBe("Late flower RH target: 35–50%");
  });

  it("4. legacy generic alert → fallback context copy", () => {
    const w = deriveAlertWhyContext(LEGACY_GENERIC_TEMP);
    expect(w.kind).toBe("unavailable");
    expect(w.text).toBe("Target context unavailable for this alert.");
  });

  it("5. unknown/unparseable stage → fallback context copy", () => {
    const w = deriveAlertWhyContext(UNKNOWN_STAGE_ALERT);
    expect(w.kind).toBe("unavailable");
  });
});

describe("AlertWhyContext presenter", () => {
  it("6. compact variant renders 'Why this alert?' prefix + derived text", () => {
    render(<AlertWhyContext alert={VEG_TEMP_HIGH} variant="compact" />);
    const node = screen.getByTestId("alert-why-compact");
    expect(node.textContent).toContain(WHY_PREFIX);
    expect(node.textContent).toContain("Veg target: 22–28°C");
    expect(node.getAttribute("data-kind")).toBe("stage");
  });

  it("7. detailed variant renders stage + range rows", () => {
    render(<AlertWhyContext alert={LATE_FLOWER_RH_HIGH} variant="detailed" />);
    const root = screen.getByTestId("alert-why-detailed");
    expect(root.textContent).toContain(WHY_PREFIX);
    expect(screen.getByTestId("alert-why-stage").textContent).toBe("Late flower");
    expect(screen.getByTestId("alert-why-range").textContent).toBe("35–50%");
  });

  it("8. detailed variant on legacy alert → fallback copy and no rows", () => {
    render(<AlertWhyContext alert={LEGACY_GENERIC_TEMP} variant="detailed" />);
    const root = screen.getByTestId("alert-why-detailed");
    expect(root.getAttribute("data-kind")).toBe("unavailable");
    expect(root.textContent).toContain("Target context unavailable for this alert.");
    expect(screen.queryByTestId("alert-why-stage")).toBeNull();
  });

  it("9. detailed VPD variant formats range as '1.0–1.5 kPa'", () => {
    render(<AlertWhyContext alert={FLOWER_VPD_HIGH} variant="detailed" />);
    expect(screen.getByTestId("alert-why-range").textContent).toBe("1.0–1.5 kPa");
  });
});

// --------------------------------------------------------------------------
// Static safety contract
// --------------------------------------------------------------------------
const HELPER_SRC = readFileSync(
  resolve(__dirname, "../lib/alertWhyContext.ts"),
  "utf8",
);
const COMP_SRC = readFileSync(
  resolve(__dirname, "../components/AlertWhyContext.tsx"),
  "utf8",
);

describe("static safety", () => {
  for (const [name, src] of [
    ["alertWhyContext.ts", HELPER_SRC],
    ["AlertWhyContext.tsx", COMP_SRC],
  ] as const) {
    it(`${name}: no alert writes / action_queue / service_role / AI Doctor / automation / device-control`, () => {
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
      // No nutrient/feed prescriptions in display copy.
      expect(src).not.toMatch(/nutrient|feed (more|less|up|down)|increase ec/i);
    });
  }
});
