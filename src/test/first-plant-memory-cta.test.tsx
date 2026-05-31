/**
 * FirstPlantMemoryCta — render + wiring tests for the prominent first-run
 * QuickLog prompt on Dashboard and Tent Detail.
 *
 * Covers:
 *  - Render copy: headline, support copy, "Start simple" hint.
 *  - CTA dispatches the existing `verdant:open-quicklog` event (no new
 *    logging system) — with and without a prefill.
 *  - Dashboard wiring static-scan:
 *      * gated on `plants.length > 0`
 *      * not the primary CTA when there are no plants
 *  - TentDetail wiring static-scan:
 *      * gated on `activeCount > 0`
 *      * uses `buildPlantQuickLogPrefill` for context
 *      * empty plants branch still emphasizes "Add Plant"
 *  - Safety: no forbidden marketing/autopilot/device-control copy, no
 *    fake-live data claims, manual sensor reading framed as optional.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";

import FirstPlantMemoryCta from "@/components/FirstPlantMemoryCta";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const DASH = stripSourceComments(
  readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8"),
);
const TENT = stripSourceComments(
  readFileSync(resolve(ROOT, "src/pages/TentDetail.tsx"), "utf8"),
);
const CTA = stripSourceComments(
  readFileSync(resolve(ROOT, "src/components/FirstPlantMemoryCta.tsx"), "utf8"),
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FirstPlantMemoryCta — render", () => {
  it("renders headline, support copy, and friendly hints", () => {
    render(<FirstPlantMemoryCta />);
    expect(screen.getByText(/Log your first plant memory/i)).toBeTruthy();
    expect(
      screen.getByText(/Add note, watering, photo, or manual sensor reading/i),
    ).toBeTruthy();
    expect(screen.getByText(/Start simple\. One note is enough/i)).toBeTruthy();
    expect(screen.getByText(/enrich details later/i)).toBeTruthy();
    expect(screen.getByText(/Manual sensor reading is optional/i)).toBeTruthy();
  });

  it("dispatches the existing open-quicklog event with null detail when no prefill", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    render(<FirstPlantMemoryCta />);
    fireEvent.click(screen.getByTestId("first-plant-memory-cta-open"));
    expect(spy).toHaveBeenCalledTimes(1);
    const ev = spy.mock.calls[0][0] as CustomEvent;
    expect(ev.type).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
    expect(ev.type).toBe("verdant:open-quicklog");
    expect(ev.detail).toBeNull();
  });

  it("dispatches the open-quicklog event with the provided prefill", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    render(
      <FirstPlantMemoryCta
        prefill={{
          plantId: "p1",
          plantName: "Plant 1",
          growId: "g1",
          tentId: "t1",
          tentName: "Tent 1",
          eventType: "observation",
          suggestSnapshot: true,
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("first-plant-memory-cta-open"));
    const ev = spy.mock.calls[0][0] as CustomEvent;
    expect(ev.detail).toMatchObject({ plantId: "p1", tentId: "t1", growId: "g1" });
  });
});

describe("FirstPlantMemoryCta — safety", () => {
  const FORBIDDEN = [
    /autopilot/i,
    /auto-?grow/i,
    /guaranteed yield/i,
    /live\s+data/i,
    /turn\s+on/i,
    /turn\s+off/i,
    /service_role/i,
  ];
  it("does not contain forbidden marketing/automation/device-control strings", () => {
    for (const re of FORBIDDEN) expect(CTA).not.toMatch(re);
  });
  it("does not create a new logging path (no supabase writes)", () => {
    expect(CTA).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(CTA).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});

describe("Dashboard wires FirstPlantMemoryCta", () => {
  it("imports the component", () => {
    expect(DASH).toMatch(
      /from\s+["']@\/components\/FirstPlantMemoryCta["']/,
    );
  });
  it("gates the CTA on plants.length > 0", () => {
    expect(DASH).toMatch(/plants\.length\s*>\s*0\s*&&\s*<FirstPlantMemoryCta/);
  });
  it("does not render the CTA when there are no plants (gate has no fallback CTA)", () => {
    // No `plants.length === 0 ? <FirstPlantMemoryCta` pattern.
    expect(DASH).not.toMatch(
      /plants\.length\s*===\s*0\s*\?\s*<FirstPlantMemoryCta/,
    );
  });
});

describe("TentDetail wires FirstPlantMemoryCta", () => {
  it("imports the component and prefill builder", () => {
    expect(TENT).toMatch(/from\s+["']@\/components\/FirstPlantMemoryCta["']/);
    expect(TENT).toMatch(/buildPlantQuickLogPrefill/);
  });
  it("gates the CTA on activeCount > 0", () => {
    expect(TENT).toMatch(/activeCount\s*>\s*0/);
    expect(TENT).toMatch(/<FirstPlantMemoryCta\s+prefill=/);
  });
  it("still emphasizes Add Plant when there are no plants in the tent", () => {
    expect(TENT).toMatch(/Add Plant to This Tent/);
    expect(TENT).toMatch(/tent-detail-empty-add-plant/);
  });
});
