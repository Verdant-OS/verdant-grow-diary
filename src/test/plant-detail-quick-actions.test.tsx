/**
 * Plant Detail Quick Actions row — pure helper + render coverage + static
 * safety. Read-only and presentation/event polish only. No new writes,
 * schema, RPC, edge functions, storage, auth, automation, device control,
 * calendar/notification/email/reminder scheduling, service_role,
 * functions.invoke, or fake-live sensor data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-router-dom", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) =>
    React.createElement(
      "a",
      { href: typeof to === "string" ? to : "", ...rest },
      children,
    ),
}));

import {
  buildPlantDetailQuickActions,
  PLANT_RELATIVE_TIMELINE_ANCHOR_ID,
} from "@/lib/plantDetailQuickActions";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import PlantDetailQuickActions from "@/components/PlantDetailQuickActions";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/plantDetailQuickActions.ts"),
  "utf8",
);
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/PlantDetailQuickActions.tsx"),
  "utf8",
);
const PAGE = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");

const FORBIDDEN = [
  /autopilot/i,
  /\bauto[-\s]?(execute|run|control)\b/i,
  /service_role/,
  /supabase\.from\(/,
  /functions\.invoke\(/,
  /\.rpc\(/,
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upsert\(/,
  /calendar_events/,
  /\bnotifications?\b/i,
  /\bemail provider/i,
  /\bsendgrid\b/i,
  /\bpostmark\b/i,
  /\bresend\b/i,
  /\bschedul/i,
  /\breminder/i,
  /\bdevice[-\s]?control/i,
];

describe("buildPlantDetailQuickActions · ordering and completeness", () => {
  it("returns the 5 expected kinds in deterministic order", () => {
    const kinds = buildPlantDetailQuickActions({ plantId: "p1" }).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([
      "quicklog",
      "manual_sensor_snapshot",
      "upload_photo",
      "ask_doctor",
      "view_timeline",
    ]);
  });

  it("labels match the documented copy", () => {
    const labels = buildPlantDetailQuickActions({ plantId: "p1" }).map(
      (e) => e.label,
    );
    expect(labels).toEqual([
      "Quick Log",
      "Manual Sensor Snapshot",
      "Upload Photo",
      "Ask Doctor",
      "View Timeline",
    ]);
  });

  it("descriptions match the documented helper copy", () => {
    const descriptions = buildPlantDetailQuickActions({ plantId: "p1" }).map(
      (e) => e.description,
    );
    expect(descriptions).toEqual([
      "Record an observation or grow action.",
      "Add current tent readings by hand.",
      "Attach a plant photo to visual history.",
      "Review this plant with existing context.",
      "Jump to this plant's history.",
    ]);
  });
});

describe("buildPlantDetailQuickActions · payloads and routes", () => {
  it("Quick Log emits event payload with all available context", () => {
    const ql = buildPlantDetailQuickActions({
      plantId: "p1",
      plantName: "Plant 1",
      growId: "g1",
      tentId: "t1",
      tentName: "Tent A",
    }).find((e) => e.kind === "quicklog")!;
    expect(ql.event).toBe("open-quicklog");
    expect(ql.href).toBeUndefined();
    expect(ql.eventPayload).toEqual({
      plantId: "p1",
      plantName: "Plant 1",
      growId: "g1",
      tentId: "t1",
      tentName: "Tent A",
      eventType: "observation",
      suggestSnapshot: true,
    });
  });

  it("Quick Log payload is null and entry disabled when plantId is missing", () => {
    const ql = buildPlantDetailQuickActions({ plantId: null }).find(
      (e) => e.kind === "quicklog",
    )!;
    expect(ql.eventPayload).toBeNull();
    expect(ql.disabled).toBe(true);
    expect(ql.disabledReason).toMatch(/plant context/i);
  });

  it("Manual Sensor Snapshot links to grow-scoped /sensors when growId is known", () => {
    const e = buildPlantDetailQuickActions({
      plantId: "p1",
      growId: "g1",
    }).find((e) => e.kind === "manual_sensor_snapshot")!;
    expect(e.href).toBe("/sensors?growId=g1");
  });

  it("Manual Sensor Snapshot falls back to plain /sensors when no growId", () => {
    const e = buildPlantDetailQuickActions({ plantId: "p1" }).find(
      (e) => e.kind === "manual_sensor_snapshot",
    )!;
    expect(e.href).toBe("/sensors");
  });

  it("Ask Doctor links to /doctor with plantId hint when available", () => {
    const e = buildPlantDetailQuickActions({ plantId: "p1" }).find(
      (e) => e.kind === "ask_doctor",
    )!;
    expect(e.href).toBe("/doctor?plantId=p1");
  });

  it("Ask Doctor falls back to /doctor and is disabled with reason when plantId missing", () => {
    const e = buildPlantDetailQuickActions({ plantId: null }).find(
      (e) => e.kind === "ask_doctor",
    )!;
    expect(e.href).toBe("/doctor");
    expect(e.disabled).toBe(true);
    expect(e.disabledReason).toMatch(/plant context/i);
  });

  it("View Timeline carries the anchor id, no href, no event", () => {
    const e = buildPlantDetailQuickActions({ plantId: "p1" }).find(
      (e) => e.kind === "view_timeline",
    )!;
    expect(e.scrollTargetId).toBe(PLANT_RELATIVE_TIMELINE_ANCHOR_ID);
    expect(e.href).toBeUndefined();
    expect(e.event).toBeUndefined();
    expect(e.disabled).toBeFalsy();
  });

  it("View Timeline is disabled with reason when hasTimelineSection is false", () => {
    const e = buildPlantDetailQuickActions({
      plantId: "p1",
      hasTimelineSection: false,
    }).find((e) => e.kind === "view_timeline")!;
    expect(e.disabled).toBe(true);
    expect(e.scrollTargetId).toBeUndefined();
    expect(e.disabledReason).toMatch(/timeline section/i);
  });
});

describe("PlantDetailQuickActions · render", () => {
  it("renders all five quick actions with accessible labels", () => {
    render(
      <PlantDetailQuickActions
        plantId="p1"
        plantName="Plant 1"
        growId="g1"
        tentId="t1"
        tentName="Tent A"
      />,
    );
    expect(
      screen.getByTestId("plant-detail-quick-action-quicklog"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plant-detail-quick-action-manual-sensor-snapshot"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plant-detail-quick-action-upload-photo"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plant-detail-quick-action-ask-doctor"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plant-detail-quick-action-view-timeline"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: /plant quick actions/i }),
    ).toBeInTheDocument();
  });

  it("renders helper description for every quick action", () => {
    render(
      <PlantDetailQuickActions
        plantId="p1"
        plantName="Plant 1"
        growId="g1"
        tentId="t1"
        tentName="Tent A"
      />,
    );
    const expected = [
      { testId: "plant-detail-quick-action-quicklog", text: /observation or grow action/i },
      { testId: "plant-detail-quick-action-manual-sensor-snapshot", text: /readings by hand/i },
      { testId: "plant-detail-quick-action-upload-photo", text: /visual history/i },
      { testId: "plant-detail-quick-action-ask-doctor", text: /existing context/i },
      { testId: "plant-detail-quick-action-view-timeline", text: /history/i },
    ];
    for (const { testId, text } of expected) {
      const el = screen.getByTestId(`${testId}-description`);
      expect(el).toBeInTheDocument();
      expect(el.textContent).toMatch(text);
    }
  });

  it("Upload Photo click dispatches verdant:open-quicklog with plant context", () => {
    const handler = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);
    render(
      <PlantDetailQuickActions
        plantId="p1"
        plantName="Plant 1"
        growId="g1"
        tentId="t1"
        tentName="Tent A"
      />,
    );
    fireEvent.click(
      screen.getByTestId("plant-detail-quick-action-upload-photo"),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.detail).toMatchObject({
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
    });
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);
  });

  it("Upload Photo is disabled with reason when plantId is missing", () => {
    render(<PlantDetailQuickActions plantId={null} />);
    const btn = screen.getByTestId("plant-detail-quick-action-upload-photo");
    expect(btn).toBeDisabled();
    expect(
      screen.getByTestId("plant-detail-quick-action-upload-photo-description")
        .textContent,
    ).toMatch(/visual history/i);
    expect(
      screen.getByTestId("plant-detail-quick-action-upload-photo-reason")
        .textContent,
    ).toMatch(/plant context/i);
  });

  it("Quick Log click dispatches verdant:open-quicklog with plant context", () => {
    const handler = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);
    render(
      <PlantDetailQuickActions
        plantId="p1"
        plantName="Plant 1"
        growId="g1"
        tentId="t1"
        tentName="Tent A"
      />,
    );
    fireEvent.click(screen.getByTestId("plant-detail-quick-action-quicklog"));
    expect(handler).toHaveBeenCalledTimes(1);
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.detail).toMatchObject({
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
      eventType: "observation",
    });
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);
  });

  it("Manual Sensor Snapshot renders as a link to /sensors with growId", () => {
    const { container } = render(
      <PlantDetailQuickActions plantId="p1" growId="g1" />,
    );
    const link = container.querySelector(
      'a[data-testid="plant-detail-quick-action-manual-sensor-snapshot"], [data-testid="plant-detail-quick-action-manual-sensor-snapshot"] a',
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toBe("/sensors?growId=g1");
  });

  it("Manual Sensor Snapshot safely falls back to /sensors when growId missing", () => {
    const { container } = render(<PlantDetailQuickActions plantId="p1" />);
    const link = container.querySelector(
      'a[data-testid="plant-detail-quick-action-manual-sensor-snapshot"], [data-testid="plant-detail-quick-action-manual-sensor-snapshot"] a',
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toBe("/sensors");
  });

  it("Ask Doctor links to /doctor with plantId hint", () => {
    const { container } = render(<PlantDetailQuickActions plantId="p1" />);
    const link = container.querySelector(
      'a[data-testid="plant-detail-quick-action-ask-doctor"], [data-testid="plant-detail-quick-action-ask-doctor"] a',
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toBe("/doctor?plantId=p1");
  });


  it("View Timeline click scrolls to and focuses the timeline anchor", () => {
    // Set up a DOM anchor matching the helper's contract.
    const anchor = document.createElement("div");
    anchor.id = PLANT_RELATIVE_TIMELINE_ANCHOR_ID;
    document.body.appendChild(anchor);
    const scrollSpy = vi.fn();
    anchor.scrollIntoView = scrollSpy as unknown as Element["scrollIntoView"];

    render(<PlantDetailQuickActions plantId="p1" />);
    fireEvent.click(
      screen.getByTestId("plant-detail-quick-action-view-timeline"),
    );
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(anchor.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(anchor);

    document.body.removeChild(anchor);
  });

  it("renders disabled state with reason when plant context is missing", () => {
    render(<PlantDetailQuickActions plantId={null} />);
    const ql = screen.getByTestId("plant-detail-quick-action-quicklog");
    expect(ql).toBeDisabled();
    expect(ql.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByTestId("plant-detail-quick-action-quicklog-description")
        .textContent,
    ).toMatch(/observation or grow action/i);
    expect(
      screen.getByTestId("plant-detail-quick-action-quicklog-reason")
        .textContent,
    ).toMatch(/plant context/i);
  });

  it("buttons carry focus-visible ring classes for keyboard users", () => {
    render(<PlantDetailQuickActions plantId="p1" growId="g1" />);
    const btn = screen.getByTestId("plant-detail-quick-action-quicklog");
    expect(btn.className).toMatch(/focus-visible:ring-2/);
  });
});

describe("PlantDetailQuickActions · static safety", () => {
  it("helper module contains no React, writes, RPC, fetch, or device control", () => {
    for (const re of FORBIDDEN) {
      expect(HELPER, `forbidden token in helper: ${re}`).not.toMatch(re);
    }
    expect(HELPER).not.toMatch(/from\s+["']react["']/);
    expect(HELPER).not.toMatch(/fetch\(/);
  });

  it("component module contains no writes, RPC, service_role, or device control", () => {
    for (const re of FORBIDDEN) {
      expect(COMPONENT, `forbidden token in component: ${re}`).not.toMatch(re);
    }
    expect(COMPONENT).not.toMatch(/supabase/i);
  });

  it("does not leak ids/tokens/raw payloads in visible labels", () => {
    const labels = buildPlantDetailQuickActions({
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
    }).map((e) => `${e.label}|${e.description}`);
    for (const text of labels) {
      expect(text).not.toMatch(/p1|g1|t1/);
      expect(text).not.toMatch(/token|secret|raw|provenance|user[_-]?id/i);
    }
  });

  it("helper copy does not imply automatic writes", () => {
    const descriptions = buildPlantDetailQuickActions({ plantId: "p1" }).map(
      (e) => e.description,
    );
    for (const text of descriptions) {
      expect(text).not.toMatch(/auto[-\s]?save/i);
      expect(text).not.toMatch(/auto[-\s]?upload/i);
      expect(text).not.toMatch(/synced automatically/i);
    }
  });

  it("helper copy does not imply live sensor data, AI certainty, automation, or device control", () => {
    const descriptions = buildPlantDetailQuickActions({ plantId: "p1" }).map(
      (e) => e.description,
    );
    for (const text of descriptions) {
      expect(text).not.toMatch(/live sensor/i);
      expect(text).not.toMatch(/real[-\s]?time/i);
      expect(text).not.toMatch(/diagnose/i);
      expect(text).not.toMatch(/certain/i);
      expect(text).not.toMatch(/autopilot/i);
      expect(text).not.toMatch(/auto[-\s]?run/i);
      expect(text).not.toMatch(/control/i);
    }
  });

  it("Plant Detail page mounts the quick actions row near the top", () => {
    expect(PAGE).toMatch(
      /import\s+PlantDetailQuickActions\s+from\s+"@\/components\/PlantDetailQuickActions"/,
    );
    expect(PAGE).toMatch(/<PlantDetailQuickActions\b/);
    // The page wraps the existing timeline section with the anchor id.
    expect(PAGE).toMatch(/PLANT_RELATIVE_TIMELINE_ANCHOR_ID/);
  });
});
