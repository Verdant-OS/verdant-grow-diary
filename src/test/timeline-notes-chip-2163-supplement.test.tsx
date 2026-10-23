/**
 * #2163 supplement for #2446: when Notes counts fewer diary rows than All,
 * the Notes chip count must still equal the listed diary rows under Notes.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
  growsState: {
    activeGrow: {
      id: "grow-a",
      name: "Current Run A",
      stage: "vegetative",
      started_at: "2026-07-01T00:00:00.000Z",
    } as Record<string, unknown>,
    activeGrowId: "grow-a" as string | null,
    grows: [
      {
        id: "grow-a",
        name: "Current Run A",
        stage: "vegetative",
        started_at: "2026-07-01T00:00:00.000Z",
      },
    ] as Array<Record<string, unknown>>,
    loading: false,
    error: null as string | null,
  },
  scopedGrowState: {
    urlGrowId: null as string | null,
    scopedGrow: null as Record<string, unknown> | null,
    scopedGrowName: null as string | null,
    isValidScopedGrow: false,
    backHref: undefined as string | undefined,
  },
}));

interface QuerySpec {
  table: string;
  filters: unknown[];
}

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = { table, filters: [] };
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      not: () => query,
      gte: () => query,
      lte: () => query,
      lt: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      then(onfulfilled?: (value: { data: unknown[]; error: null; count: number }) => unknown) {
        return Promise.resolve(harness.executeQuery(spec)).then(onfulfilled);
      },
    };
    return query;
  }
  return {
    supabase: {
      from: queryFor,
      storage: {
        from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }),
      },
    },
  };
});

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" }, loading: false }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    ...harness.growsState,
    refresh: harness.refreshGrows,
    setActiveGrowId: harness.setActiveGrowId,
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({ useScopedGrow: () => harness.scopedGrowState }));
vi.mock("@/hooks/useMyEntitlements", () => ({ useMyEntitlements: () => ({ entitlement: null }) }));
vi.mock("@/lib/featureEntitlements", () => ({ canUseFeature: () => false }));
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
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";

function chipButton(label: string): HTMLElement {
  const button = screen
    .getAllByRole("button")
    .find((node) => node.querySelector("span")?.textContent === label);
  if (!button) throw new Error(`Chip ${label} not found`);
  return button;
}

function chipCount(label: string): number {
  const spans = chipButton(label).querySelectorAll("span");
  const raw = spans[spans.length - 1]?.textContent ?? "";
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Chip ${label} count missing: ${raw}`);
  return value;
}

function listedDiaryEntries(): HTMLElement[] {
  return screen
    .queryAllByTestId("timeline-entry")
    .filter((node) => !node.id.startsWith("timeline-entry-sensor-reading:"));
}

describe("Timeline Notes chip #2163 count match supplement (#2446)", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            {
              id: "note-1",
              note: "Canopy check",
              photo_url: null,
              stage: "vegetative",
              details: { event_type: "note", source: "manual" },
              entry_at: "2026-07-20T12:00:00.000Z",
              plant_id: null,
              tent_id: null,
            },
            {
              id: "water-1",
              note: "",
              photo_url: null,
              stage: "vegetative",
              details: {
                event_type: "watering",
                source: "quick_log",
                watering: { volume_ml: 500 },
              },
              entry_at: "2026-07-20T11:00:00.000Z",
              plant_id: null,
              tent_id: null,
            },
            {
              id: "water-2",
              note: "(quick log)",
              photo_url: null,
              stage: "vegetative",
              details: {
                event_type: "watering",
                source: "quick_log",
                watering: { volume_ml: 400 },
              },
              entry_at: "2026-07-20T10:00:00.000Z",
              plant_id: null,
              tent_id: null,
            },
          ],
          error: null,
          count: 3,
        };
      }
      return { data: [], error: null, count: 0 };
    });
  });

  it("lists exactly the Notes chip count when Notes is smaller than All", async () => {
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Canopy check")).toBeInTheDocument();
    expect(chipCount("All")).toBe(3);
    expect(chipCount("Notes")).toBe(1);

    fireEvent.click(chipButton("Notes"));
    await waitFor(() => expect(listedDiaryEntries()).toHaveLength(chipCount("Notes")));
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "Detailed diary: showing 1 of 3 entries",
    );
  });
});
