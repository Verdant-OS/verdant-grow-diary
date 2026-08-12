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
 *
 * Click telemetry routes through the funnel catalog as
 * `alert_doctor_cta_clicked` (surface + allowlisted metric + severity, never
 * an id). It replaced the original bespoke CustomEvent dispatch, which had
 * no listener anywhere and therefore never reached any sink.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import { buildPlantAiDoctorReviewPath } from "@/lib/aiDoctorEntryRules";
import { resolveAlertFunnelMetric } from "@/lib/plantAssignedTentAlertRules";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

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

type BridgeEvent = { name: string; props: Record<string, unknown> };

/**
 * Capture `verdant:analytics` bridge dispatches for one funnel event while
 * `act` runs. The bridge fires with the SAME post-sanitizer, post-schema
 * props gtag receives, so asserting on it exercises the real pipeline.
 */
function captureFunnelBridge(name: string, act: () => void): BridgeEvent[] {
  const events: BridgeEvent[] = [];
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<BridgeEvent>).detail;
    if (detail?.name === name) events.push(detail);
  };
  window.addEventListener(PRICING_ANALYTICS_EVENT, handler);
  try {
    act();
  } finally {
    window.removeEventListener(PRICING_ANALYTICS_EVENT, handler);
  }
  return events;
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

  it("reports the click id-free through the funnel catalog", () => {
    // Captured off the verdant:analytics mirror, which trackFunnelEvent
    // dispatches AFTER sanitizeFunnelParams → enforceFunnelEventSchema.
    // Asserting the exact surviving props (not merely "no ids") is the
    // vacuity check: a catalog/schema mismatch silently strips params, so a
    // weaker assertion would keep passing while the event fired empty.
    const events = captureFunnelBridge("alert_doctor_cta_clicked", () => {
      renderPanel("plant-1");
      fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-ask-doctor"));
    });

    expect(events).toHaveLength(1);
    expect(events[0].props).toEqual({
      surface: "tent_alert_row",
      metric: "temp",
      severity: "warning",
    });
    const serialized = JSON.stringify(events[0].props);
    expect(serialized).not.toContain("alert-1");
    expect(serialized).not.toContain("plant-1");
    expect(serialized).not.toContain("tent-1");
  });

  it("omits the metric when the persisted token is outside the closed vocabulary", () => {
    // "compact-id-0f3d" is structurally sanitizer-safe (short, no
    // whitespace), so only the allowlist gate can be dropping it here —
    // this is the negative control proving the gate does the work.
    mocks.rows = [{ ...ROW, metric: "compact-id-0f3d" }];
    const events = captureFunnelBridge("alert_doctor_cta_clicked", () => {
      renderPanel("plant-1");
      fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-ask-doctor"));
    });
    expect(events).toHaveLength(1);
    expect(events[0].props).toEqual({ surface: "tent_alert_row", severity: "warning" });
  });

  it("does not emit the doctor event from the neighbouring Stage Targets link", () => {
    const events = captureFunnelBridge("alert_doctor_cta_clicked", () => {
      renderPanel("plant-1");
      fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-target-band"));
    });
    expect(events).toHaveLength(0);
  });
});

describe("resolveAlertFunnelMetric — closed persisted vocabulary", () => {
  it("passes every canonical token and the two snapshot-level tokens", () => {
    for (const token of [
      "temp",
      "rh",
      "vpd",
      "soil",
      "soil_ec",
      "soil_temp",
      "ppfd",
      "snapshot",
      "targets",
    ]) {
      expect(resolveAlertFunnelMetric(token)).toBe(token);
    }
  });

  it("rejects unknown, missing, and free-text-shaped values", () => {
    expect(resolveAlertFunnelMetric("temperature_c")).toBeNull();
    expect(resolveAlertFunnelMetric("compact-id-0f3d")).toBeNull();
    expect(resolveAlertFunnelMetric("looks droopy today")).toBeNull();
    expect(resolveAlertFunnelMetric("")).toBeNull();
    expect(resolveAlertFunnelMetric(null)).toBeNull();
    expect(resolveAlertFunnelMetric(undefined)).toBeNull();
  });

  it("is deterministic", () => {
    expect(resolveAlertFunnelMetric("vpd")).toBe(resolveAlertFunnelMetric("vpd"));
    expect(resolveAlertFunnelMetric("nope")).toBe(resolveAlertFunnelMetric("nope"));
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

  it("routes click telemetry through the funnel catalog, not the dead CustomEvent channel", () => {
    expect(PANEL).toMatch(/trackFunnelEvent\(\s*"alert_doctor_cta_clicked"/);
    // The bespoke channel had no listener anywhere; it must not come back.
    expect(PANEL).not.toMatch(/trackTentAlertsDoctorCta|tent-alerts-doctor-cta/);
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
