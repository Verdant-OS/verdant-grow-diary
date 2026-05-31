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

  it("omits alert/action labels when counts are null / undefined", () => {
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
    expect(v.compact).not.toMatch(/alert|action/i);
  });

  it("treats zero counts as known (0 open alerts / 0 pending actions)", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      alertCount: 0,
      actionCount: 0,
    });
    expect(v.alertLabel).toBe("0 open alerts");
    expect(v.actionLabel).toBe("0 pending actions");
  });

  it("never exposes IDs, user_ids, tokens, raw payloads, or provenance markers", () => {
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
    const blob = JSON.stringify(v);
    expect(blob).not.toMatch(/secret-id-12345/);
    expect(blob).not.toMatch(/plant-uuid-xyz/);
    expect(blob).not.toMatch(/tent-uuid-abc/);
    expect(blob).not.toMatch(/should not leak/);
    expect(blob.toLowerCase()).not.toMatch(/user_id|token|bearer|raw_payload|provenance|service_role/);
  });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function setupHooks({
  entries = [],
  alertRows = [],
  alertStatus = "ok",
  actionRows = [],
  actionsLoading = false,
}: {
  entries?: unknown[];
  alertRows?: unknown[];
  alertStatus?: string;
  actionRows?: unknown[];
  actionsLoading?: boolean;
} = {}) {
  mockEntries.mockReturnValue({ data: entries, isLoading: false });
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
// Static safety
// ---------------------------------------------------------------------------

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
