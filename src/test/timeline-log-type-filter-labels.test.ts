/**
 * The Timeline log-type filter must show distinct grower-facing labels and
 * never leak Object.prototype properties as labels.
 * Machine event keys such as quicklog_photo_attachment stay the option value
 * so filtering still matches the stored token.
 */
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deriveTimelineEventTypeOptions,
  timelineEventTypeOptionLabel,
} from "@/lib/timelineEvidenceFilterRules";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
}));

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      is() {
        return query;
      },
      not() {
        return query;
      },
      gte() {
        return query;
      },
      lte() {
        return query;
      },
      lt() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        return Promise.resolve(harness.executeQuery(table)).then(onfulfilled, onrejected);
      },
    };
    return query;
  }

  return {
    supabase: {
      from: (table: string) => queryFor(table),
      storage: {
        from: () => ({
          createSignedUrls: (paths: string[]) => harness.createSignedUrls(paths),
        }),
      },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" }, session: null, loading: false }),
}));

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: GROW_A,
    activeGrowId: GROW_A.id,
    grows: [GROW_A],
    loading: false,
    error: null,
    refresh: harness.refreshGrows,
    setActiveGrowId: harness.setActiveGrowId,
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ entitlement: null }),
}));

vi.mock("@/lib/featureEntitlements", () => ({
  canUseFeature: () => false,
}));

vi.mock("@/hooks/useActionResponseMemory", () => ({
  useActionResponseMemory: () => ({
    state: { status: "ok", memories: [] },
    reload: harness.reloadActionResponseMemory,
  }),
}));

vi.mock("@/lib/useTimelineHighlightAutoScroll", () => ({
  useTimelineHighlightAutoScroll: () => undefined,
}));

vi.mock("@/hooks/useTimelineHashAnchorHandoff", () => ({
  useTimelineHashAnchorHandoff: () => undefined,
}));

vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogEntryIntegrityControls", () => ({ default: () => null }));
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryBadges", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckSnapshotLinkButton", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorCheckInTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorReadinessTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/WateringHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/FeedingHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/PhotoHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/QuickLogHistoryPanels", () => ({
  RecentQuickLogActivityPanel: () => null,
  PestDiseaseHistoryPanel: () => null,
  TrainingHistoryPanel: () => null,
  MeasurementHistoryPanel: () => null,
}));
vi.mock("@/components/DiaryCalendarSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineCsvContextPanel", () => ({ default: () => null }));
vi.mock("@/components/PhenoHuntTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelinePhotoLightbox", () => ({ default: () => null }));
vi.mock("@/components/TimelineEvidenceDetailDrawer", () => ({ default: () => null }));
vi.mock("@/components/TimelineSensorSourceBadge", () => ({ default: () => null }));
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";

function renderTimeline() {
  return render(
    createElement(MemoryRouter, { initialEntries: ["/timeline"] }, createElement(Timeline)),
  );
}

beforeEach(() => {
  harness.executeQuery.mockReset();
  harness.refreshGrows.mockReset();
  harness.setActiveGrowId.mockReset();
  harness.reloadActionResponseMemory.mockReset();
  harness.createSignedUrls.mockReset();
  harness.createSignedUrls.mockImplementation((paths: string[]) =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
      error: null,
    }),
  );
});

describe("timeline log-type filter labels", () => {
  it("labels a photo attachment distinctly from a standalone photo instead of the raw event key", () => {
    expect(timelineEventTypeOptionLabel("photo")).toBe("Photo");
    expect(timelineEventTypeOptionLabel("quicklog_photo_attachment")).toBe("Photo attachment");
    const opts = deriveTimelineEventTypeOptions([
      {
        id: "p1",
        note: "Photo attached from Quick Log.",
        stage: null,
        plant_id: null,
        tent_id: "tent-1",
        details: { event_type: "quicklog_photo_attachment" },
      },
    ]);
    expect(opts).toEqual([
      { id: "quicklog_photo_attachment", label: "Photo attachment", count: 1 },
    ]);
  });

  it("keeps known care types readable, formats unknown tokens, and does not invent a count", () => {
    expect(timelineEventTypeOptionLabel("watering")).toBe("Watering");
    expect(timelineEventTypeOptionLabel("note")).toBe("Note");
    expect(timelineEventTypeOptionLabel("custom_event-type")).toBe("Custom Event Type");
    expect(timelineEventTypeOptionLabel("___")).toBe("___");
  });

  it("renders distinguishable Photo and Photo attachment filter options and filters each independently", async () => {
    harness.executeQuery.mockImplementation((table: string) => {
      if (table === "diary_entries") {
        return {
          data: [
            {
              id: "entry-standalone-photo",
              note: "Standalone canopy photo",
              photo_url: null,
              stage: "vegetative",
              entry_at: "2026-07-25T13:14:40.000Z",
              plant_id: "plant-a",
              tent_id: "tent-1",
              details: { event_type: "photo", source: "manual" },
            },
            {
              id: "entry-attached-photo",
              note: "Photo attached from Quick Log.",
              photo_url: null,
              stage: "vegetative",
              entry_at: "2026-07-25T13:10:00.000Z",
              plant_id: "plant-a",
              tent_id: "tent-1",
              details: { event_type: "quicklog_photo_attachment", source: "manual" },
            },
          ],
          error: null,
          count: 2,
        };
      }
      return { data: [], error: null, count: 0 };
    });

    renderTimeline();
    await screen.findByText("Standalone canopy photo");
    await screen.findByText("Photo attached from Quick Log.");

    const select = (await screen.findByTestId("timeline-event-type-filter")) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map((o) => o.textContent);
    expect(optionTexts).toEqual(["All log types", "Photo (1)", "Photo attachment (1)"]);

    fireEvent.change(select, { target: { value: "photo" } });
    expect(screen.getByText("Standalone canopy photo")).toBeInTheDocument();
    expect(screen.queryByText("Photo attached from Quick Log.")).toBeNull();

    fireEvent.change(select, { target: { value: "quicklog_photo_attachment" } });
    expect(screen.getByText("Photo attached from Quick Log.")).toBeInTheDocument();
    expect(screen.queryByText("Standalone canopy photo")).toBeNull();
  });

  it("does not leak Object.prototype keys in the rendered log-type filter dropdown", async () => {
    harness.executeQuery.mockImplementation((table: string) => {
      if (table === "diary_entries") {
        return {
          data: [
            {
              id: "entry-proto-tostring",
              note: "Entry with toString token",
              photo_url: null,
              stage: "vegetative",
              entry_at: "2026-07-25T13:14:40.000Z",
              plant_id: "plant-a",
              tent_id: "tent-1",
              details: { event_type: "toString", source: "manual" },
            },
          ],
          error: null,
          count: 1,
        };
      }
      return { data: [], error: null, count: 0 };
    });

    renderTimeline();
    await screen.findByText("Entry with toString token");

    const select = (await screen.findByTestId("timeline-event-type-filter")) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map((o) => o.textContent);
    expect(optionTexts).toEqual(["All log types", "ToString (1)"]);

    fireEvent.change(select, { target: { value: "toString" } });
    expect(screen.getByText("Entry with toString token")).toBeInTheDocument();

    expect(timelineEventTypeOptionLabel("constructor")).toBe("Constructor");
    expect(timelineEventTypeOptionLabel("toString")).toBe("ToString");
  });

  it("produces no duplicate option labels across known event types including environment and environment_check", async () => {
    const knownTokens = [
      "note",
      "photo",
      "quicklog_photo_attachment",
      "watering",
      "feeding",
      "observation",
      "measurement",
      "environment",
      "environment_check",
      "training",
      "harvest",
      "pest_disease",
    ];
    const opts = deriveTimelineEventTypeOptions(
      knownTokens.map((token, idx) => ({
        id: `row-${idx}`,
        note: `Row ${token}`,
        stage: "vegetative",
        plant_id: "plant-a",
        tent_id: "tent-1",
        details: { event_type: token },
      })),
    );
    const labels = opts.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(timelineEventTypeOptionLabel("environment")).toBe("Environment");
    expect(timelineEventTypeOptionLabel("environment_check")).toBe("Environment check");

    const tieForward = deriveTimelineEventTypeOptions([
      {
        id: "t1",
        note: "a",
        stage: null,
        plant_id: null,
        tent_id: null,
        details: { event_type: "custom_type" },
      },
      {
        id: "t2",
        note: "b",
        stage: null,
        plant_id: null,
        tent_id: null,
        details: { event_type: "custom-type" },
      },
    ]);
    const tieReverse = deriveTimelineEventTypeOptions([
      {
        id: "t2",
        note: "b",
        stage: null,
        plant_id: null,
        tent_id: null,
        details: { event_type: "custom-type" },
      },
      {
        id: "t1",
        note: "a",
        stage: null,
        plant_id: null,
        tent_id: null,
        details: { event_type: "custom_type" },
      },
    ]);
    expect(tieForward.map((o) => o.id)).toEqual(tieReverse.map((o) => o.id));

    harness.executeQuery.mockImplementation((table: string) => {
      if (table === "diary_entries") {
        return {
          data: [
            {
              id: "entry-env",
              note: "Legacy environment log",
              photo_url: null,
              stage: "vegetative",
              entry_at: "2026-07-25T13:14:40.000Z",
              plant_id: "plant-a",
              tent_id: "tent-1",
              details: { event_type: "environment", source: "manual" },
            },
            {
              id: "entry-env-check",
              note: "Quick Log environment check",
              photo_url: null,
              stage: "vegetative",
              entry_at: "2026-07-25T13:10:00.000Z",
              plant_id: "plant-a",
              tent_id: "tent-1",
              details: { event_type: "environment_check", source: "manual" },
            },
          ],
          error: null,
          count: 2,
        };
      }
      return { data: [], error: null, count: 0 };
    });

    renderTimeline();
    await screen.findByText("Legacy environment log");
    await screen.findByText("Quick Log environment check");

    const select = (await screen.findByTestId("timeline-event-type-filter")) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map((o) => o.textContent);
    expect(new Set(optionTexts).size).toBe(optionTexts.length);
    expect(optionTexts).toEqual(["All log types", "Environment (1)", "Environment check (1)"]);

    fireEvent.change(select, { target: { value: "environment" } });
    expect(screen.getByText("Legacy environment log")).toBeInTheDocument();
    expect(screen.queryByText("Quick Log environment check")).toBeNull();

    fireEvent.change(select, { target: { value: "environment_check" } });
    expect(screen.getByText("Quick Log environment check")).toBeInTheDocument();
    expect(screen.queryByText("Legacy environment log")).toBeNull();
  });
});
