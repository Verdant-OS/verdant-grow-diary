/**
 * Plant Detail quick-status strip — pure rules + render coverage.
 *
 * Strictly read-only. No new schema/RPC/writes/automation/device control,
 * no calendar / notification / email / scheduling.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement("a", { href: typeof to === "string" ? to : "", ...rest }, children),
}));

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: vi.fn(),
  PLANT_RECENT_ACTIVITY_LIMIT: 10,
}));
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: vi.fn(),
}));
vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: vi.fn(),
}));

import {
  buildPlantQuickStatusView,
  STAGE_UNKNOWN_LABEL,
} from "@/lib/plantQuickStatusRules";
import type { RelativeTimelineItem } from "@/lib/relativeTimelineProjectionRules";

import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";
import { usePlantAssignedTentActions } from "@/hooks/usePlantAssignedTentActions";
import PlantQuickStatusStrip from "@/components/PlantQuickStatusStrip";

const mockEntries = usePlantRecentActivity as unknown as ReturnType<typeof vi.fn>;
const mockAlerts = usePlantAssignedTentAlerts as unknown as ReturnType<typeof vi.fn>;
const mockActions = usePlantAssignedTentActions as unknown as ReturnType<typeof vi.fn>;

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "";
const RULES = read("src/lib/plantQuickStatusRules.ts");
const COMPONENT = read("src/components/PlantQuickStatusStrip.tsx");

const PLANT = "plant-uuid-1";
const PLANT_STARTED = "2026-04-01T00:00:00Z";

function tItem(over: Partial<RelativeTimelineItem> & { id: string }): RelativeTimelineItem {
  return {
    id: over.id,
    eventType: "note",
    title: "t",
    occurredAt: "2026-04-05T00:00:00Z",
    occurredAtLabel: "2026-04-05T00:00:00Z",
    plantDay: 0,
    stageDay: null,
    source: "note",
    stagePreset: null,
    plantId: PLANT,
    tentId: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

describe("buildPlantQuickStatusView — pure rules", () => {
  it("renders the stage label when stage is present", () => {
    const v = buildPlantQuickStatusView({ stage: "vegetation" });
    expect(v.stageLabel).toBe("Vegetation");
    expect(v.stageIsFallback).toBe(false);
  });

  it("maps common stage aliases to the preset label", () => {
    expect(buildPlantQuickStatusView({ stage: "veg" }).stageLabel).toBe("Vegetation");
    expect(buildPlantQuickStatusView({ stage: "flowering" }).stageLabel).toBe("Flower");
    expect(buildPlantQuickStatusView({ stage: "drying" }).stageLabel).toBe("Dry");
  });

  it("falls back to 'Stage unknown' when stage is null / blank", () => {
    expect(buildPlantQuickStatusView({ stage: null }).stageLabel).toBe(STAGE_UNKNOWN_LABEL);
    expect(buildPlantQuickStatusView({ stage: "   " }).stageIsFallback).toBe(true);
    expect(buildPlantQuickStatusView(null).stageLabel).toBe(STAGE_UNKNOWN_LABEL);
    expect(buildPlantQuickStatusView(undefined).stageLabel).toBe(STAGE_UNKNOWN_LABEL);
  });

  it("derives last update from the newest valid timeline item timestamp", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [
        tItem({ id: "a", occurredAt: "2026-04-10T00:00:00Z" }),
        tItem({ id: "b", occurredAt: "2026-05-31T00:00:00Z" }),
        tItem({ id: "c", occurredAt: "2026-04-20T00:00:00Z" }),
      ],
    });
    expect(v.lastUpdateLabel).toBe("Last updated May 31, 2026");
    expect(v.lastUpdateIsFallback).toBe(false);
  });

  it("uses 'Last updated unknown' fallback when timestamps are missing/invalid", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [
        tItem({ id: "a", occurredAt: null }),
        tItem({ id: "b", occurredAt: "not-a-date" }),
      ],
    });
    expect(v.lastUpdateLabel).toBe("Last updated unknown");
    expect(v.lastUpdateIsFallback).toBe(true);
  });

  it("uses 'No updates yet' when there are no timeline items", () => {
    const v = buildPlantQuickStatusView({ stage: "vegetation", timelineItems: [] });
    expect(v.lastUpdateLabel).toBe("No updates yet");
    expect(v.lastUpdateIsFallback).toBe(false);
  });

  it("includes pluralized alert/action labels only when counts are provided", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      alertCount: 2,
      actionCount: 1,
    });
    expect(v.hasAlertCount).toBe(true);
    expect(v.alertLabel).toBe("2 open alerts");
    expect(v.hasActionCount).toBe(true);
    expect(v.actionLabel).toBe("1 pending action");
    expect(v.compact).toContain("2 open alerts");
    expect(v.compact).toContain("1 pending action");
  });

  it("omits alert/action labels when counts are null / undefined (status copy still present)", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      alertCount: null,
      actionCount: undefined,
    });
    expect(v.hasAlertCount).toBe(false);
    expect(v.alertLabel).toBeNull();
    expect(v.hasActionCount).toBe(false);
    expect(v.actionLabel).toBeNull();
    // Compact line never invents a numeric count when none is available.
    expect(v.compact).not.toMatch(/\d+\s+(open\s+alerts?|pending\s+actions?)/i);
  });

  it("treats zero counts as known and uses 'No open alerts' / 'No pending actions' copy", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      alertCount: 0,
      actionCount: 0,
    });
    expect(v.alertLabel).toBe("No open alerts");
    expect(v.actionLabel).toBe("No pending actions");
    expect(v.hasAlertCount).toBe(true);
    expect(v.hasActionCount).toBe(true);
  });

  it("never exposes IDs, user_ids, tokens, raw payloads, or provenance markers in visible labels", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [
        tItem({
          id: "secret-id-12345",
          plantId: "plant-uuid-xyz",
          tentId: "tent-uuid-abc",
          title: "should not leak",
          occurredAt: "2026-05-31T00:00:00Z",
        }),
      ],
      alertCount: 1,
      actionCount: 2,
    });
    // Internal scroll target id is intentionally surfaced on the view-model
    // (the strip wires it to a data-* attribute only — never visible text).
    // The safety check excludes it so we still guard every visible field.
    const { viewLatestEntry, ...visible } = v;
    expect(viewLatestEntry.targetItemId).toBe("secret-id-12345");
    const blob = JSON.stringify(visible);
    expect(blob).not.toMatch(/secret-id-12345/);
    expect(blob).not.toMatch(/plant-uuid-xyz/);
    expect(blob).not.toMatch(/tent-uuid-abc/);
    expect(blob).not.toMatch(/should not leak/);
    expect(blob.toLowerCase()).not.toMatch(
      /user_id|token|bearer|raw_payload|provenance|service_role/,
    );
  });
});



// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function setupHooks({
  entries = [],
  entriesLoading = false,
  alertRows = [],
  alertStatus = "ok",
  actionRows = [],
  actionsLoading = false,
}: {
  entries?: unknown[];
  entriesLoading?: boolean;
  alertRows?: unknown[];
  alertStatus?: string;
  actionRows?: unknown[];
  actionsLoading?: boolean;
} = {}) {
  mockEntries.mockReturnValue({ data: entries, isLoading: entriesLoading });
  mockAlerts.mockReturnValue({ rows: alertRows, status: alertStatus });
  mockActions.mockReturnValue({ rows: actionRows, isLoading: actionsLoading });
}

const NOTE_ENTRY = (id: string, entry_at: string | null) => ({
  id,
  plant_id: PLANT,
  entry_at,
  entry_type: "note",
  note: "n",
  photo_url: null,
  details: null,
});

describe("PlantQuickStatusStrip — render", () => {
  it("renders stage label, last update, and is mounted with accessible label", () => {
    setupHooks({
      entries: [NOTE_ENTRY("e1", "2026-05-31T08:00:00Z")],
      alertRows: [],
      actionRows: [],
    });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.getByTestId("plant-quick-status-stage")).toHaveTextContent("Vegetation");
    expect(screen.getByTestId("plant-quick-status-last-update")).toHaveTextContent(
      "Last updated May 31, 2026",
    );
    const strip = screen.getByTestId("plant-quick-status-strip");
    expect(strip.getAttribute("aria-label")).toContain("Stage: Vegetation");
    expect(strip.getAttribute("data-stage-fallback")).toBe("false");
    expect(strip.getAttribute("data-last-update-fallback")).toBe("false");
  });

  it("renders 'Stage unknown' fallback when stage is missing", () => {
    setupHooks({ entries: [] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage={null}
      />,
    );
    const stage = screen.getByTestId("plant-quick-status-stage");
    expect(stage).toHaveTextContent(STAGE_UNKNOWN_LABEL);
    expect(
      screen.getByTestId("plant-quick-status-strip").getAttribute("data-stage-fallback"),
    ).toBe("true");
  });

  it("renders alert + action counts when tent context provides them", () => {
    setupHooks({
      entries: [NOTE_ENTRY("e1", "2026-05-31T08:00:00Z")],
      alertRows: [{ id: "a1" }, { id: "a2" }],
      alertStatus: "ok",
      actionRows: [{ id: "ac1" }],
      actionsLoading: false,
    });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.getByTestId("plant-quick-status-alerts")).toHaveTextContent(
      "2 open alerts",
    );
    expect(screen.getByTestId("plant-quick-status-actions")).toHaveTextContent(
      "1 pending action",
    );
  });

  it("omits alert/action counts when no tent is assigned (counts unavailable)", () => {
    setupHooks({
      entries: [NOTE_ENTRY("e1", "2026-05-31T08:00:00Z")],
    });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId={null}
        growId={null}
      />,
    );
    expect(screen.queryByTestId("plant-quick-status-alerts")).toBeNull();
    expect(screen.queryByTestId("plant-quick-status-actions")).toBeNull();
    const strip = screen.getByTestId("plant-quick-status-strip");
    expect(strip.getAttribute("data-alert-count")).toBe("unknown");
    expect(strip.getAttribute("data-action-count")).toBe("unknown");
  });

  it("omits alert count when alerts are still loading (status !== 'ok')", () => {
    setupHooks({
      entries: [],
      alertRows: [],
      alertStatus: "pending",
      actionRows: [],
      actionsLoading: true,
    });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.queryByTestId("plant-quick-status-alerts")).toBeNull();
    expect(screen.queryByTestId("plant-quick-status-actions")).toBeNull();
  });

  it("renders 'Last updated unknown' when entries exist with invalid timestamps", () => {
    setupHooks({ entries: [NOTE_ENTRY("e1", null)] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
      />,
    );
    expect(screen.getByTestId("plant-quick-status-last-update")).toHaveTextContent(
      "Last updated unknown",
    );
    expect(
      screen.getByTestId("plant-quick-status-strip").getAttribute("data-last-update-fallback"),
    ).toBe("true");
  });

  it("never exposes plant IDs, tent IDs, tokens, or provenance markers in visible text", () => {
    setupHooks({
      entries: [NOTE_ENTRY("entry-uuid-secret", "2026-05-31T08:00:00Z")],
      alertRows: [{ id: "alert-uuid-secret" }],
      alertStatus: "ok",
      actionRows: [{ id: "action-uuid-secret" }],
    });
    const { container } = render(
      <PlantQuickStatusStrip
        plantId="plant-uuid-secret"
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-uuid-secret"
        growId="grow-uuid-secret"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/uuid-secret/);
    expect(text.toLowerCase()).not.toMatch(/user_id|token|bearer|raw_payload|provenance|service_role/);
  });
});

// ---------------------------------------------------------------------------
// Loading + missing-state + quick links + view-latest
// ---------------------------------------------------------------------------

describe("buildPlantQuickStatusView — loading / links / view-latest", () => {
  it("flags alerts/actions/timeline loading and surfaces 'Checking…' status labels", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      timelineLoading: true,
      alertsLoading: true,
      actionsLoading: true,
      growId: "g1",
      tentId: "t1",
    });
    expect(v.timelineLoading).toBe(true);
    expect(v.alertsState).toBe("loading");
    expect(v.actionsState).toBe("loading");
    expect(v.alertsStatusLabel).toBe("Checking alerts…");
    expect(v.actionsStatusLabel).toBe("Checking actions…");
    expect(v.hasAlertCount).toBe(false);
    expect(v.hasActionCount).toBe(false);
  });

  it("marks alerts/actions unavailable with safe copy when no count is provided", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      alertCount: null,
      actionCount: null,
    });
    expect(v.alertsState).toBe("unavailable");
    expect(v.actionsState).toBe("unavailable");
    expect(v.alertsStatusLabel).toBe("Alerts unavailable");
    expect(v.actionsStatusLabel).toBe("Pending actions unavailable");
  });

  it("builds safe Alerts/Pending Actions quick links when grow context exists", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      growId: "grow-1",
    });
    expect(v.alertsLink.disabled).toBe(false);
    expect(v.alertsLink.href).toBe("/alerts?growId=grow-1");
    expect(v.actionsLink.disabled).toBe(false);
    expect(v.actionsLink.href).toBe("/actions?growId=grow-1");
  });

  it("disables quick links with an inline reason when grow context is missing", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      growId: null,
    });
    expect(v.alertsLink.disabled).toBe(true);
    expect(v.alertsLink.href).toBeNull();
    expect(v.alertsLink.disabledReason).toMatch(/grow/i);
    expect(v.actionsLink.disabled).toBe(true);
    expect(v.actionsLink.href).toBeNull();
    expect(v.actionsLink.disabledReason).toMatch(/grow/i);
  });

  it("picks the newest timeline item id as the view-latest scroll target", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [
        tItem({ id: "old", occurredAt: "2026-04-10T00:00:00Z" }),
        tItem({ id: "newest", occurredAt: "2026-05-31T00:00:00Z" }),
        tItem({ id: "mid", occurredAt: "2026-04-20T00:00:00Z" }),
      ],
    });
    expect(v.viewLatestEntry.disabled).toBe(false);
    expect(v.viewLatestEntry.targetItemId).toBe("newest");
    expect(v.viewLatestEntry.label).toBe("View latest entry");
  });

  it("disables 'View latest entry' with helpful copy when there are no items", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
    });
    expect(v.viewLatestEntry.disabled).toBe(true);
    expect(v.viewLatestEntry.targetItemId).toBeNull();
    expect(v.viewLatestEntry.disabledReason).toMatch(/quick log|photo|snapshot/i);
  });
});

// ---------------------------------------------------------------------------
// Render — loading / links / view-latest
// ---------------------------------------------------------------------------

describe("PlantQuickStatusStrip — loading / links / view-latest render", () => {
  it("renders loading skeleton/copy for timeline, alerts, and actions while loading", () => {
    setupHooks({
      entries: [],
      entriesLoading: true,
      alertRows: [],
      alertStatus: "pending",
      actionRows: [],
      actionsLoading: true,
    });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.getByTestId("plant-quick-status-last-update-loading")).toBeTruthy();
    expect(screen.getByTestId("plant-quick-status-alerts-loading")).toHaveTextContent(
      "Checking alerts…",
    );
    expect(screen.getByTestId("plant-quick-status-actions-loading")).toHaveTextContent(
      "Checking actions…",
    );
  });

  it("renders unavailable copy when no tent context is assigned", () => {
    setupHooks({ entries: [] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId={null}
        growId={null}
      />,
    );
    expect(screen.getByTestId("plant-quick-status-alerts-unavailable")).toHaveTextContent(
      "Alerts unavailable",
    );
    expect(screen.getByTestId("plant-quick-status-actions-unavailable")).toHaveTextContent(
      "Pending actions unavailable",
    );
  });

  it("renders 'No open alerts' / 'No pending actions' when counts are zero", () => {
    setupHooks({
      entries: [NOTE_ENTRY("e1", "2026-05-31T08:00:00Z")],
      alertRows: [],
      alertStatus: "ok",
      actionRows: [],
      actionsLoading: false,
    });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.getByTestId("plant-quick-status-alerts")).toHaveTextContent(
      "No open alerts",
    );
    expect(screen.getByTestId("plant-quick-status-actions")).toHaveTextContent(
      "No pending actions",
    );
  });

  it("renders Alerts + Pending Actions quick links pointing at the existing routes", () => {
    setupHooks({
      entries: [NOTE_ENTRY("e1", "2026-05-31T08:00:00Z")],
      alertRows: [],
      actionRows: [],
    });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    const alertsLink = screen.getByTestId("plant-quick-status-alerts-link");
    expect(alertsLink.getAttribute("href")).toBe("/alerts?growId=grow-1");
    expect(alertsLink.getAttribute("data-disabled")).toBeNull();
    const actionsLink = screen.getByTestId("plant-quick-status-actions-link");
    expect(actionsLink.getAttribute("href")).toBe("/actions?growId=grow-1");
    expect(actionsLink.getAttribute("data-disabled")).toBeNull();
  });

  it("disables quick links with inline reason when grow context is missing", () => {
    setupHooks({ entries: [] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId={null}
        growId={null}
      />,
    );
    const alertsLink = screen.getByTestId("plant-quick-status-alerts-link");
    expect(alertsLink.getAttribute("data-disabled")).toBe("true");
    expect(alertsLink.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByTestId("plant-quick-status-alerts-link-reason").textContent,
    ).toMatch(/grow/i);
    const actionsLink = screen.getByTestId("plant-quick-status-actions-link");
    expect(actionsLink.getAttribute("data-disabled")).toBe("true");
    expect(
      screen.getByTestId("plant-quick-status-actions-link-reason").textContent,
    ).toMatch(/grow/i);
  });

  it("'View latest entry' is disabled with helpful copy when timeline is empty", () => {
    setupHooks({ entries: [] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
      />,
    );
    const vl = screen.getByTestId("plant-quick-status-view-latest");
    expect(vl.getAttribute("data-disabled")).toBe("true");
    expect(
      screen.getByTestId("plant-quick-status-view-latest-reason").textContent,
    ).toMatch(/quick log|photo|snapshot/i);
  });

  it("'View latest entry' click scrolls the newest timeline item into view", () => {
    const NEWEST = "newest-entry";
    setupHooks({
      entries: [
        NOTE_ENTRY("older", "2026-04-01T00:00:00Z"),
        NOTE_ENTRY(NEWEST, "2026-05-31T00:00:00Z"),
      ],
      alertRows: [],
      actionRows: [],
    });

    // Mount a fake timeline target so the scroll handler can locate it.
    const target = document.createElement("div");
    target.setAttribute("data-item-id", NEWEST);
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy as unknown as Element["scrollIntoView"];
    document.body.appendChild(target);

    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    const btn = screen.getByTestId("plant-quick-status-view-latest");
    expect(btn.getAttribute("data-disabled")).toBeNull();
    (btn as HTMLButtonElement).click();
    expect(scrollSpy).toHaveBeenCalled();

    document.body.removeChild(target);
  });
});

// ---------------------------------------------------------------------------
// Accessibility — quick links + view latest entry
// ---------------------------------------------------------------------------

describe("PlantQuickStatusStrip — accessibility", () => {
  it("Alerts quick link exposes a clear accessible name", () => {
    setupHooks({ entries: [], alertRows: [], actionRows: [] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    const link = screen.getByTestId("plant-quick-status-alerts-link");
    expect(link.getAttribute("aria-label")).toBe("View open alerts for this plant");
    expect(link.tagName).toBe("A");
  });

  it("Pending Actions quick link exposes a clear accessible name", () => {
    setupHooks({ entries: [], alertRows: [], actionRows: [] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    const link = screen.getByTestId("plant-quick-status-actions-link");
    expect(link.getAttribute("aria-label")).toBe(
      "View pending actions for this plant",
    );
    expect(link.tagName).toBe("A");
  });

  it("disabled quick links render a visible reason and are not focus traps", () => {
    setupHooks({ entries: [] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId={null}
        growId={null}
      />,
    );
    const alerts = screen.getByTestId("plant-quick-status-alerts-link");
    expect(alerts.getAttribute("aria-disabled")).toBe("true");
    expect(alerts.getAttribute("role")).toBe("link");
    // Disabled state must NOT be tabbable (would be a focus dead-end).
    expect(alerts.getAttribute("tabindex")).not.toBe("0");
    expect(alerts.tagName).toBe("SPAN");
    const reason = screen.getByTestId("plant-quick-status-alerts-link-reason");
    // Reason is visible (not sr-only).
    expect(reason.className).not.toMatch(/sr-only/);
    expect(reason.textContent ?? "").toMatch(/grow/i);
    // Accessible name communicates the unavailable state.
    expect(alerts.getAttribute("aria-label") ?? "").toMatch(/unavailable/i);

    const actions = screen.getByTestId("plant-quick-status-actions-link");
    expect(actions.getAttribute("aria-disabled")).toBe("true");
    expect(actions.tagName).toBe("SPAN");
    expect(actions.getAttribute("tabindex")).not.toBe("0");
    const aReason = screen.getByTestId("plant-quick-status-actions-link-reason");
    expect(aReason.className).not.toMatch(/sr-only/);
    expect(aReason.textContent ?? "").toMatch(/grow/i);
  });

  it("View latest entry is a real <button> (Enter and Space activate natively)", () => {
    const NEWEST = "newest-a11y";
    setupHooks({
      entries: [NOTE_ENTRY(NEWEST, "2026-05-31T00:00:00Z")],
      alertRows: [],
      actionRows: [],
    });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
      />,
    );
    const btn = screen.getByTestId("plant-quick-status-view-latest");
    // Native <button type="button"> handles Enter/Space per HTML spec.
    expect(btn.tagName).toBe("BUTTON");
    expect((btn as HTMLButtonElement).type).toBe("button");
    // Keyboard reachable (default tab order, not removed).
    expect(btn.getAttribute("tabindex")).not.toBe("-1");
    expect(btn.getAttribute("aria-label")).toBe("View latest timeline entry");
    expect(btn.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("View latest entry: Enter and Space trigger the scroll affordance", () => {
    const NEWEST = "newest-keys";
    setupHooks({
      entries: [NOTE_ENTRY(NEWEST, "2026-05-31T00:00:00Z")],
      alertRows: [],
      actionRows: [],
    });

    const target = document.createElement("div");
    target.setAttribute("data-item-id", NEWEST);
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy as unknown as Element["scrollIntoView"];
    document.body.appendChild(target);

    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
      />,
    );
    const btn = screen.getByTestId("plant-quick-status-view-latest") as HTMLButtonElement;

    // Simulate Enter — native button click follows.
    btn.focus();
    btn.click();
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // Simulate Space — same native behavior.
    btn.click();
    expect(scrollSpy).toHaveBeenCalledTimes(2);

    // Newest item became programmatically focusable without changing tab order.
    expect(target.getAttribute("tabindex")).toBe("-1");

    document.body.removeChild(target);
  });

  it("disabled View latest entry renders a visible reason and is not focusable", () => {
    setupHooks({ entries: [] });
    render(
      <PlantQuickStatusStrip
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
      />,
    );
    const vl = screen.getByTestId("plant-quick-status-view-latest");
    expect(vl.tagName).toBe("SPAN");
    expect(vl.getAttribute("aria-disabled")).toBe("true");
    expect(vl.getAttribute("tabindex")).not.toBe("0");
    const reason = screen.getByTestId("plant-quick-status-view-latest-reason");
    expect(reason.className).not.toMatch(/sr-only/);
    expect(reason.textContent ?? "").toMatch(/quick log|photo|snapshot/i);
  });

  it("no internal IDs / tokens / provenance markers in visible accessibility names", () => {
    setupHooks({
      entries: [NOTE_ENTRY("entry-uuid-leak", "2026-05-31T00:00:00Z")],
      alertRows: [],
      actionRows: [],
    });
    const { container } = render(
      <PlantQuickStatusStrip
        plantId="plant-uuid-leak"
        plantStartedAt={PLANT_STARTED}
        stage="vegetation"
        tentId="tent-uuid-leak"
        growId="grow-uuid-leak"
      />,
    );
    const ariaBlob = Array.from(container.querySelectorAll("[aria-label]"))
      .map((el) => el.getAttribute("aria-label") ?? "")
      .join(" | ");
    expect(ariaBlob).not.toMatch(/uuid-leak/);
    expect(ariaBlob.toLowerCase()).not.toMatch(
      /user_id|token|bearer|raw_payload|provenance|service_role/,
    );
  });
});

describe("plant-quick-status — accessibility safety scan", () => {
  it("component does not introduce routes, writes, or device strings via a11y polish", () => {
    expect(COMPONENT).not.toMatch(/createBrowserRouter|<Route\s/);
    expect(COMPONENT).not.toMatch(/supabase\.from\(/);
    expect(COMPONENT).not.toMatch(/\.rpc\(/);
    expect(COMPONENT).not.toMatch(/functions\.invoke/);
    expect(COMPONENT).not.toMatch(/service_role/);
    expect(COMPONENT).not.toMatch(/calendar_events/);
    expect(COMPONENT).not.toMatch(/\bnotifications\b/);
    expect(COMPONENT).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    expect(COMPONENT).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|device_command|autopilot/i,
    );
  });
});




describe("plant-quick-status — static safety", () => {
  it("rules module is pure (no Supabase / RPC / writes / scheduling / device)", () => {
    expect(RULES).not.toMatch(/supabase/i);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/\.rpc\(/);
    expect(RULES).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(RULES).not.toMatch(/functions\.invoke/);
    expect(RULES).not.toMatch(/calendar_events/);
    expect(RULES).not.toMatch(/\bnotifications\b/);
    expect(RULES).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    expect(RULES).not.toMatch(
      /\b(schedule|scheduled|scheduling)\s+(a\s+|the\s+|new\s+)?reminders?\b/i,
    );
    expect(RULES).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|device_command|autopilot/i,
    );
  });

  it("component performs no direct writes / invoke / device strings", () => {
    expect(COMPONENT).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(COMPONENT).not.toMatch(/\.rpc\(/);
    expect(COMPONENT).not.toMatch(/functions\.invoke/);
    expect(COMPONENT).not.toMatch(/service_role/);
    expect(COMPONENT).not.toMatch(/calendar_events/);
    expect(COMPONENT).not.toMatch(/\bnotifications\b/);
    expect(COMPONENT).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    expect(COMPONENT).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|device_command|autopilot/i,
    );
    expect(COMPONENT).not.toMatch(
      /\b(schedule|scheduled|scheduling)\s+(a\s+|the\s+|new\s+)?reminders?\b/i,
    );
  });

  it("component reuses existing hooks (no new query layer)", () => {
    expect(COMPONENT).toContain("usePlantRecentActivity");
    expect(COMPONENT).toContain("usePlantAssignedTentAlerts");
    expect(COMPONENT).toContain("usePlantAssignedTentActions");
    // No raw supabase client wiring in the component itself.
    expect(COMPONENT).not.toMatch(/from\(["']/);
    expect(COMPONENT).not.toMatch(/createClient\(/);
  });
});
