/**
 * Tent-alerts panel → AI Doctor on-ramp.
 *
 * An open alert on a plant's assigned tent is the moment a grower most wants
 * a second opinion, but the panel previously only offered "View Alert" — a
 * backward-looking detail page. This adds a forward path into the plant's
 * OWN cautious-review section.
 *
 * Deliberately navigation-only. This branch has no free-text AI Doctor
 * question surface (`/doctor` renders a plant chooser; the review lives on
 * Plant Detail), so there is nothing to prefill — the CTA hands the grower
 * to the existing review section and stops. It never starts a review and
 * never spends a credit.
 *
 * The href is built by the SHARED `buildPlantAiDoctorReviewPath` helper, the
 * same one five other surfaces use, so this entry point cannot drift from
 * the anchor `AiDoctorReviewAnchorRestorer` listens for.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import { buildPlantAiDoctorReviewPath } from "@/lib/aiDoctorEntryRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PANEL = read("src/components/PlantAssignedTentAlertsPanel.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const DAILY_CHECK = read("src/pages/DailyCheck.tsx");

const ROW = {
  id: "alert-1",
  title: "Temperature high",
  reason: "28.4C above the flower band",
  severity: "warning" as const,
  severityLabel: "Warning",
  metric: "temp",
  status: "open" as const,
  lastSeenAt: null,
};

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({ status: "ready", rows: mocks.rows }),
}));

vi.mock("@/components/ui/card", () => {
  const P = ({ children, ...r }: { children?: ReactNode; [k: string]: unknown }) => (
    <div {...r}>{children}</div>
  );
  return { Card: P, CardContent: P, CardHeader: P, CardTitle: P };
});

import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";

function renderPanel(plantId: string | null) {
  return render(
    <MemoryRouter initialEntries={["/plants/plant-1"]}>
      <PlantAssignedTentAlertsPanel
        tentId="tent-1"
        tentName="Flower Tent"
        growId="grow-1"
        plantId={plantId}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.rows = [ROW];
});

describe("tent alerts · Ask AI Doctor on-ramp", () => {
  it("links each alert row into THIS plant's review section", () => {
    renderPanel("plant-1");
    // Button `asChild` merges its props onto the Link, so the testid lands
    // on the anchor itself rather than a wrapper.
    const cta = screen.getByTestId("plant-assigned-tent-alert-ask-doctor");
    const href = cta.getAttribute("href") ?? "";
    // Same href the rest of the app builds — not a hand-rolled string.
    expect(href).toBe(buildPlantAiDoctorReviewPath({ plantId: "plant-1", tentId: "tent-1" }));
    // And it targets the anchor AiDoctorReviewAnchorRestorer scrolls to.
    expect(href).toContain(`#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`);
    expect(href).toContain("plant-1");
  });

  it("omits the CTA when the caller cannot prove the plant owns these alerts", () => {
    // A tent-level surface passes no plantId rather than guessing — pointing
    // a grower at an unrelated plant's review is worse than no shortcut.
    renderPanel(null);
    expect(screen.queryByTestId("plant-assigned-tent-alert-ask-doctor")).toBeNull();
    // The pre-existing affordance is untouched.
    expect(screen.getByTestId("plant-assigned-tent-alert-view")).toBeInTheDocument();
  });

  it("reports the click id-free", () => {
    // Analytics carries severity + metric only: never an alert, plant, tent
    // or user id.
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener("verdant:tent-alerts-doctor-cta", handler);
    renderPanel("plant-1");
    fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-ask-doctor"));
    window.removeEventListener("verdant:tent-alerts-doctor-cta", handler);

    expect(events).toHaveLength(1);
    const detail = events[0].detail as Record<string, unknown>;
    expect(detail).toEqual({ severity: "warning", metric: "temp" });
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("alert-1");
    expect(serialized).not.toContain("plant-1");
    expect(serialized).not.toContain("tent-1");
  });

  it("reaches the funnel sink without claiming that a review started", () => {
    const gtag = vi.fn();
    (window as unknown as { gtag?: unknown }).gtag = gtag;
    try {
      renderPanel("plant-1");
      fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-ask-doctor"));

      expect(gtag).toHaveBeenCalledWith("event", "ai_doctor_cta_clicked", {
        surface: "tent_alert_row",
        metric: "temp",
        severity: "warning",
      });
      expect(gtag).not.toHaveBeenCalledWith("event", "ai_doctor_review_started", expect.anything());
      expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/alert-1|plant-1|tent-1|grow-1/);
    } finally {
      delete (window as unknown as { gtag?: unknown }).gtag;
    }
  });

  it("drops an unknown persisted metric from the funnel payload", () => {
    mocks.rows = [{ ...ROW, metric: "private_identifier" }];
    const gtag = vi.fn();
    (window as unknown as { gtag?: unknown }).gtag = gtag;
    try {
      renderPanel("plant-1");
      fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-ask-doctor"));

      expect(gtag).toHaveBeenCalledWith("event", "ai_doctor_cta_clicked", {
        surface: "tent_alert_row",
        severity: "warning",
      });
      expect(JSON.stringify(gtag.mock.calls)).not.toContain("private_identifier");
    } finally {
      delete (window as unknown as { gtag?: unknown }).gtag;
    }
  });
});

describe("tent alerts · on-ramp wiring guards", () => {
  it("builds the href from the shared helper, never by hand", () => {
    // A hand-rolled string could drift from the anchor the restorer listens
    // for, silently landing the grower at the top of the page.
    expect(PANEL).toMatch(
      /import\s*\{[^}]*buildPlantAiDoctorReviewPath[^}]*\}\s*from\s*["']@\/lib\/aiDoctorEntryRules["']/,
    );
    expect(PANEL).toMatch(/buildPlantAiDoctorReviewPath\(\{\s*plantId,\s*tentId\s*\}\)/);
    expect(PANEL).not.toMatch(/`\/plants\//);
  });

  it("stays navigation-only — the panel still writes nothing", () => {
    expect(PANEL).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(PANEL).not.toMatch(/functions\.invoke/);
    expect(PANEL).not.toMatch(/createActionQueueItem/);
  });

  it("Plant Detail passes its own plant; Daily Check proves tent ownership first", () => {
    expect(PLANT_DETAIL).toMatch(/plantId=\{plant\.id\}/);
    // Daily Check can surface a tent unrelated to the selected plant, so the
    // CTA is withheld unless the reviewed tent IS that plant's assignment.
    expect(DAILY_CHECK).toMatch(
      /effectiveTentId\s*===\s*selectedPlantTentId[\s\S]{0,80}selectedPlant\.id/,
    );
  });
});
