/**
 * "Ask AI Doctor" row action on the assigned-tent alerts panel.
 *
 * Behavior (RTL render) + static guardrails:
 *  - CTA renders per alert row when a plantId is provided, linking to the
 *    established /doctor deep link with plantId + alertId.
 *  - CTA is absent when no plant is in scope (tent-only Daily Check flow).
 *  - Clicking dispatches the id-free tracking CustomEvent (severity +
 *    metric only — no alert/plant/tent/grow ids).
 *  - CTA copy passes the calm-copy linter.
 *  - The tracking lib performs no I/O and swallows dispatch errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";
import {
  TENT_ALERTS_DOCTOR_CTA_EVENT,
  trackTentAlertsDoctorCta,
} from "@/lib/plantTentAlertsDoctorCtaTracking";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";
import type { PlantAssignedTentAlertRow } from "@/lib/plantAssignedTentAlertRules";

const hookState = vi.hoisted(() => ({
  rows: [] as PlantAssignedTentAlertRow[],
}));

vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({
    status: "ok",
    rows: hookState.rows,
    error: null,
  }),
}));

function alertRow(
  overrides: Partial<PlantAssignedTentAlertRow> = {},
): PlantAssignedTentAlertRow {
  return {
    id: "alert-1",
    severity: "warning",
    severityLabel: "Warning",
    severityRank: 1,
    status: "open",
    metric: "temp",
    title: "Temperature above target",
    reason: "Temperature is above the configured maximum.",
    firstSeenAt: "2026-08-05T10:00:00Z",
    lastSeenAt: "2026-08-05T10:00:00Z",
    tentId: "tent-1",
    growId: "grow-1",
    ...overrides,
  } as PlantAssignedTentAlertRow;
}

function renderPanel(plantId?: string | null) {
  return render(
    <MemoryRouter>
      <PlantAssignedTentAlertsPanel
        tentId="tent-1"
        tentName="Flower"
        growId="grow-1"
        plantId={plantId}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  hookState.rows = [alertRow()];
});

describe("PlantAssignedTentAlertsPanel · Ask AI Doctor row action", () => {
  it("renders the CTA with the /doctor deep link carrying plantId + alertId", () => {
    renderPanel("plant-1");
    const cta = screen.getByTestId("plant-assigned-tent-alert-ask-doctor");
    const link = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(
      "/doctor?plantId=plant-1&alertId=alert-1",
    );
    // The pre-existing View Alert link is untouched.
    expect(screen.getByTestId("plant-assigned-tent-alert-view")).toBeTruthy();
  });

  it("URI-encodes both ids", () => {
    hookState.rows = [alertRow({ id: "a&b" })];
    renderPanel("p&q");
    const cta = screen.getByTestId("plant-assigned-tent-alert-ask-doctor");
    const link = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(link!.getAttribute("href")).toBe(
      "/doctor?plantId=p%26q&alertId=a%26b",
    );
  });

  it("does not render the CTA when no plant is in scope", () => {
    renderPanel(null);
    expect(
      screen.queryByTestId("plant-assigned-tent-alert-ask-doctor"),
    ).toBeNull();
    // Rows still render with their View Alert link.
    expect(screen.getByTestId("plant-assigned-tent-alert-view")).toBeTruthy();
  });

  it("dispatches the id-free tracking event on click", () => {
    renderPanel("plant-1");
    const events: unknown[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(TENT_ALERTS_DOCTOR_CTA_EVENT, listener);
    try {
      const cta = screen.getByTestId("plant-assigned-tent-alert-ask-doctor");
      const link = cta.tagName === "A" ? cta : cta.querySelector("a");
      fireEvent.click(link!);
    } finally {
      window.removeEventListener(TENT_ALERTS_DOCTOR_CTA_EVENT, listener);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ severity: "warning", metric: "temp" });
    const json = JSON.stringify(events[0]);
    expect(json).not.toContain("alert-1");
    expect(json).not.toContain("plant-1");
    expect(json).not.toContain("tent-1");
    expect(json).not.toContain("grow-1");
  });

  it("CTA copy passes the calm-copy linter", () => {
    expect(paywallCtaHasBannedWords("Ask AI Doctor")).toBe(false);
  });
});

describe("trackTentAlertsDoctorCta (pure)", () => {
  it("normalizes blank metric to null", () => {
    const events: unknown[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(TENT_ALERTS_DOCTOR_CTA_EVENT, listener);
    try {
      trackTentAlertsDoctorCta({ severity: "info", metric: "   " });
    } finally {
      window.removeEventListener(TENT_ALERTS_DOCTOR_CTA_EVENT, listener);
    }
    expect(events[0]).toEqual({ severity: "info", metric: null });
  });

  it("swallows dispatch errors", () => {
    const orig = window.dispatchEvent;
    window.dispatchEvent = () => {
      throw new Error("boom");
    };
    try {
      expect(() =>
        trackTentAlertsDoctorCta({ severity: "info", metric: null }),
      ).not.toThrow();
    } finally {
      window.dispatchEvent = orig;
    }
  });
});

// ---------- Static guardrails ----------
const ROOT = resolve(__dirname, "../..");
const TRACKING = readFileSync(
  resolve(ROOT, "src/lib/plantTentAlertsDoctorCtaTracking.ts"),
  "utf8",
);
const PANEL = readFileSync(
  resolve(ROOT, "src/components/PlantAssignedTentAlertsPanel.tsx"),
  "utf8",
);

describe("static safety · doctor CTA additions", () => {
  it("tracking lib performs no network or database I/O", () => {
    expect(TRACKING).not.toMatch(/fetch\(/);
    expect(TRACKING).not.toMatch(/XMLHttpRequest/);
    expect(TRACKING).not.toMatch(/@\/integrations\/supabase/);
    expect(TRACKING).not.toMatch(/\.from\(/);
    expect(TRACKING).not.toMatch(/functions\.invoke/);
  });

  it("tracking detail never carries id fields", () => {
    expect(TRACKING).not.toMatch(/alertId|plantId|tentId|growId/);
  });

  it("panel links to /doctor with the established plantId idiom", () => {
    expect(PANEL).toMatch(/\/doctor\?plantId=\$\{encodeURIComponent\(plantId\)\}/);
    expect(PANEL).toMatch(/alertId=\$\{encodeURIComponent\(row\.id\)\}/);
  });
});
