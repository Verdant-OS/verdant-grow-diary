/**
 * Plant Detail section jump links — pure helper + render coverage +
 * static safety. Presentation/scroll polish only. No writes, no
 * automation, no device control, no calendar/notification/email
 * surfaces, no fake-live sensor data.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  buildPlantDetailSectionAnchors,
  PLANT_DETAIL_SECTION_ANCHORS,
} from "@/lib/plantDetailSectionAnchors";
import PlantDetailSectionNav from "@/components/PlantDetailSectionNav";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/plantDetailSectionAnchors.ts"),
  "utf8",
);
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/PlantDetailSectionNav.tsx"),
  "utf8",
);
const PAGE = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");

const FORBIDDEN = [
  /autopilot/i,
  /\bauto[-\s]?(execute|run|control)\b/i,
  /service[_-]?role/i,
  /supabase\.from\(/,
  /functions\.invoke\(/,
  /\.rpc\(/,
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upsert\(/,
  /calendar_events/,
  /\bnotifications?\b/i,
  /\bsendgrid\b/i,
  /\bpostmark\b/i,
  /\bresend\b/i,
  /\bschedul/i,
  /\breminder/i,
];

describe("buildPlantDetailSectionAnchors · ordering and completeness", () => {
  it("returns the 5 expected sections in deterministic order when all available", () => {
    const kinds = buildPlantDetailSectionAnchors({
      hasAlertsSection: true,
      hasActionsSection: true,
      hasDoctorSection: true,
      hasAssignedTent: true,
    }).map((e) => e.kind);
    expect(kinds).toEqual(["overview", "timeline", "alerts", "actions", "doctor"]);
  });

  it("omits sections that don't exist on the page", () => {
    const kinds = buildPlantDetailSectionAnchors({
      hasAlertsSection: false,
      hasActionsSection: false,
      hasDoctorSection: false,
      hasAssignedTent: false,
    }).map((e) => e.kind);
    expect(kinds).toEqual(["overview", "timeline"]);
  });

  it("disables Alerts and Actions with a reason when no tent is assigned", () => {
    const entries = buildPlantDetailSectionAnchors({ hasAssignedTent: false });
    const alerts = entries.find((e) => e.kind === "alerts")!;
    const actions = entries.find((e) => e.kind === "actions")!;
    expect(alerts.disabled).toBe(true);
    expect(alerts.disabledReason).toMatch(/no tent/i);
    expect(actions.disabled).toBe(true);
    expect(actions.disabledReason).toMatch(/no tent/i);
  });

  it("uses safe static DOM anchors, not database ids", () => {
    const entries = buildPlantDetailSectionAnchors({ hasAssignedTent: true });
    for (const e of entries) {
      expect(e.anchorId).toMatch(/^plant-[a-z-]+$/);
      expect(e.anchorId).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // no UUID
    }
    expect(PLANT_DETAIL_SECTION_ANCHORS.timeline).toBe("plant-relative-timeline");
  });
});

describe("PlantDetailSectionNav · render", () => {
  it("renders all available section jump links with accessible labels", () => {
    render(
      <PlantDetailSectionNav
        hasAlertsSection
        hasActionsSection
        hasDoctorSection
        hasAssignedTent
      />,
    );
    expect(
      screen.getByRole("navigation", {
        name: /plant detail section jump links/i,
      }),
    ).toBeInTheDocument();
    for (const id of [
      "plant-detail-section-link-overview",
      "plant-detail-section-link-timeline",
      "plant-detail-section-link-alerts",
      "plant-detail-section-link-actions",
      "plant-detail-section-link-doctor",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("renders disabled Alerts/Actions with reason when no tent is assigned", () => {
    render(<PlantDetailSectionNav hasAssignedTent={false} />);
    const alerts = screen.getByTestId("plant-detail-section-link-alerts");
    const actions = screen.getByTestId("plant-detail-section-link-actions");
    expect(alerts).toBeDisabled();
    expect(actions).toBeDisabled();
    expect(
      screen.getByTestId("plant-detail-section-link-alerts-reason").textContent,
    ).toMatch(/no tent/i);
    expect(
      screen.getByTestId("plant-detail-section-link-actions-reason").textContent,
    ).toMatch(/no tent/i);
  });

  it("Timeline click scrolls to and focuses the timeline anchor", () => {
    const anchor = document.createElement("div");
    anchor.id = PLANT_DETAIL_SECTION_ANCHORS.timeline;
    document.body.appendChild(anchor);
    const spy = vi.fn();
    anchor.scrollIntoView = spy as unknown as Element["scrollIntoView"];

    render(<PlantDetailSectionNav hasAssignedTent />);
    fireEvent.click(screen.getByTestId("plant-detail-section-link-timeline"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(anchor);

    document.body.removeChild(anchor);
  });

  it("Alerts click scrolls to the alerts anchor when a tent is assigned", () => {
    const anchor = document.createElement("div");
    anchor.id = PLANT_DETAIL_SECTION_ANCHORS.alerts;
    document.body.appendChild(anchor);
    const spy = vi.fn();
    anchor.scrollIntoView = spy as unknown as Element["scrollIntoView"];

    render(<PlantDetailSectionNav hasAssignedTent />);
    fireEvent.click(screen.getByTestId("plant-detail-section-link-alerts"));
    expect(spy).toHaveBeenCalledTimes(1);

    document.body.removeChild(anchor);
  });

  it("Actions click scrolls to the actions anchor when a tent is assigned", () => {
    const anchor = document.createElement("div");
    anchor.id = PLANT_DETAIL_SECTION_ANCHORS.actions;
    document.body.appendChild(anchor);
    const spy = vi.fn();
    anchor.scrollIntoView = spy as unknown as Element["scrollIntoView"];

    render(<PlantDetailSectionNav hasAssignedTent />);
    fireEvent.click(screen.getByTestId("plant-detail-section-link-actions"));
    expect(spy).toHaveBeenCalledTimes(1);

    document.body.removeChild(anchor);
  });

  it("buttons carry focus-visible ring classes", () => {
    render(<PlantDetailSectionNav hasAssignedTent />);
    const btn = screen.getByTestId("plant-detail-section-link-overview");
    expect(btn.className).toMatch(/focus-visible:ring-2/);
  });
});

describe("PlantDetailSectionNav · static safety", () => {
  it("helper module contains no React, fetch, writes, or RPC", () => {
    for (const re of FORBIDDEN) {
      expect(HELPER, `forbidden token in helper: ${re}`).not.toMatch(re);
    }
    expect(HELPER).not.toMatch(/from\s+["']react["']/);
    expect(HELPER).not.toMatch(/fetch\(/);
    expect(HELPER).not.toMatch(/supabase/i);
  });

  it("component module contains no writes, RPC, or supabase access", () => {
    for (const re of FORBIDDEN) {
      expect(COMPONENT, `forbidden token in component: ${re}`).not.toMatch(re);
    }
    expect(COMPONENT).not.toMatch(/supabase/i);
  });

  it("labels do not expose ids, tokens, raw payloads, or provenance markers", () => {
    const entries = buildPlantDetailSectionAnchors({ hasAssignedTent: true });
    for (const e of entries) {
      expect(e.label).not.toMatch(
        /token|secret|raw|provenance|user[_-]?id|[0-9a-f]{8}-[0-9a-f]{4}/i,
      );
    }
  });

  it("Plant Detail page mounts the section nav and matching anchor ids", () => {
    expect(PAGE).toMatch(
      /import\s+PlantDetailSectionNav\s+from\s+"@\/components\/PlantDetailSectionNav"/,
    );
    expect(PAGE).toMatch(/<PlantDetailSectionNav\b/);
    expect(PAGE).toMatch(/PLANT_DETAIL_SECTION_ANCHORS\.overview/);
    expect(PAGE).toMatch(/PLANT_DETAIL_SECTION_ANCHORS\.alerts/);
    expect(PAGE).toMatch(/PLANT_DETAIL_SECTION_ANCHORS\.actions/);
    expect(PAGE).toMatch(/PLANT_DETAIL_SECTION_ANCHORS\.doctor/);
  });
});
