/**
 * Grower bug report 2026-11-03, item 16: Timeline's grow switcher was a
 * hidden native select (tiny, and absent on plain /timeline). It is now a
 * labelled picker in the page header whenever there are two or more grows.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  growsState: {
    activeGrow: null as Record<string, unknown> | null,
    activeGrowId: null as string | null,
    grows: [] as Array<Record<string, unknown>>,
    loading: false,
    error: null as string | null,
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec = { table, filters: [] as Array<{ column: string; value: unknown }> };
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        spec.filters.push({ column, value });
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
      in() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then(onfulfilled?: (value: unknown) => unknown) {
        return Promise.resolve(harness.executeQuery(spec)).then(onfulfilled);
      },
    };
    return query;
  }

  return {
    supabase: {
      from: (table: string) => queryFor(table),
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" }, session: null, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    ...harness.growsState,
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ entitlement: null }),
}));

vi.mock("@/lib/featureEntitlements", () => ({
  canUseFeature: () => false,
}));

vi.mock("@/hooks/useActionResponseMemory", () => ({
  useActionResponseMemory: () => ({ state: { status: "ok", memories: [] }, reload: vi.fn() }),
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

const GROW_A = {
  id: "grow-a",
  name: "Skunk Gas Run",
  stage: "flowering",
  started_at: "2026-07-01T00:00:00.000Z",
};
const GROW_B = {
  id: "grow-b",
  name: "Winter Run",
  stage: "vegetative",
  started_at: "2026-09-01T00:00:00.000Z",
};

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="probe-search">{location.search}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Timeline />
    </MemoryRouter>,
  );
}

describe("Timeline grow switcher (item 16)", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation(() => ({ data: [], error: null, count: 0 }));
    harness.growsState.activeGrow = GROW_A;
    harness.growsState.activeGrowId = GROW_A.id;
    harness.growsState.grows = [GROW_A, GROW_B];
    harness.growsState.loading = false;
    harness.growsState.error = null;
  });

  it("shows a labelled grow picker on plain /timeline with the active grow selected", async () => {
    renderAt("/timeline");
    const select = (await screen.findByLabelText("Grow")) as HTMLSelectElement;
    expect(select.value).toBe("grow-a");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Skunk Gas Run", "Winter Run"]);
  });

  it("switches grow through the URL and drops the old grow's plant and entry", async () => {
    renderAt("/timeline?plantId=plant-1&entry=e-1&sources=manual");
    fireEvent.change(await screen.findByLabelText("Grow"), { target: { value: "grow-b" } });
    const search = new URLSearchParams(screen.getByTestId("probe-search").textContent ?? "");
    expect(search.get("growId")).toBe("grow-b");
    expect(search.get("plantId")).toBeNull();
    expect(search.get("entry")).toBeNull();
    expect(search.get("sources")).toBe("manual");
  });

  it("hides the picker when there is only one grow", async () => {
    harness.growsState.grows = [GROW_A];
    renderAt("/timeline");
    await screen.findByText("Skunk Gas Run");
    expect(screen.queryByTestId("timeline-grow-switcher")).toBeNull();
  });
});
