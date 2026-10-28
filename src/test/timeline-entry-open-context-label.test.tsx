/**
 * Open accessible names use plant, tent, or note context.
 * A raw entry id is never spoken, including when two logs share a minute
 * or the context is blank or longer than the name can carry.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
  growsState: {
    activeGrow: null as Record<string, unknown> | null,
    activeGrowId: null as string | null,
    grows: [] as Array<Record<string, unknown>>,
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

interface QueryFilter {
  op: "eq" | "is" | "not" | "gte" | "lte" | "lt";
  column: string;
  value: unknown;
}

interface QuerySpec {
  table: string;
  columns: string | null;
  count: string | null;
  filters: QueryFilter[];
}

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = { table, columns: null, count: null, filters: [] };
    const query = {
      select(columns: string, options?: { count?: string }) {
        spec.columns = columns;
        spec.count = options?.count ?? null;
        return query;
      },
      eq(column: string, value: unknown) {
        spec.filters.push({ op: "eq", column, value });
        return query;
      },
      is(column: string, value: unknown) {
        spec.filters.push({ op: "is", column, value });
        return query;
      },
      not(column: string, operator: string, value: unknown) {
        spec.filters.push({ op: "not", column, value: { operator, value } });
        return query;
      },
      gte(column: string, value: unknown) {
        spec.filters.push({ op: "gte", column, value });
        return query;
      },
      lte(column: string, value: unknown) {
        spec.filters.push({ op: "lte", column, value });
        return query;
      },
      lt(column: string, value: unknown) {
        spec.filters.push({ op: "lt", column, value });
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
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        const snapshot: QuerySpec = {
          ...spec,
          filters: spec.filters.map((filter) => ({ ...filter })),
        };
        return Promise.resolve(harness.executeQuery(snapshot)).then(onfulfilled, onrejected);
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

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    ...harness.growsState,
    refresh: harness.refreshGrows,
    setActiveGrowId: harness.setActiveGrowId,
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => harness.scopedGrowState,
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

vi.mock("@/components/OneTentLoopNextStepCard", () => ({
  default: ({ testId }: { testId: string }) => <div data-testid={testId}>Continue to Sensors</div>,
}));

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
vi.mock("@/components/TimelineEvidenceDetailPreview", () => ({
  default: ({ open, entry }: { open: boolean; entry: { note?: string | null } | null }) =>
    open && entry ? <div data-testid="timeline-open-detail">{entry.note}</div> : null,
}));
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

const LONG_NOTE_PREFIX = "Checked runoff before lights out";
const LONG_NOTE_TAIL = "UNIQUE-TAIL-NOT-SPOKEN";
const LONG_NOTE = `${LONG_NOTE_PREFIX} ${"x".repeat(80)} ${LONG_NOTE_TAIL}`;

const RAW_IDS = [
  "entry-note-a",
  "entry-note-b",
  "entry-blank",
  "entry-long",
  "entry-plant",
  "entry-tent",
];

function watering(
  id: string,
  note: string,
  entryAt: string,
  details: Record<string, unknown> = { event_type: "watering", source: "manual" },
) {
  return {
    id,
    note,
    photo_url: null,
    stage: "vegetative",
    details,
    entry_at: entryAt,
    plant_id: null,
    tent_id: null,
  };
}

const ENTRIES = [
  watering("entry-note-a", "Blue Dream pour", "2026-10-12T15:00:05.000Z"),
  watering("entry-note-b", "Critical Mass pour", "2026-10-12T15:00:40.000Z"),
  watering("entry-blank", "", "2026-10-12T16:00:00.000Z"),
  watering("entry-long", LONG_NOTE, "2026-10-12T17:00:00.000Z"),
  watering("entry-plant", "", "2026-10-12T18:00:00.000Z", {
    event_type: "watering",
    source: "manual",
    plant_name: "Gelato",
  }),
  watering("entry-tent", "", "2026-10-12T19:00:00.000Z", {
    event_type: "watering",
    source: "manual",
    tent_name: "Flower tent",
  }),
];

function labelFor(fragment: string): string {
  const match = screen.getAllByTestId("timeline-entry-open").find((button) => {
    return (button.getAttribute("aria-label") ?? "").includes(fragment);
  });
  expect(match, `Open control containing ${fragment}`).toBeTruthy();
  return match!.getAttribute("aria-label") ?? "";
}

describe("timeline Open labels use grower context", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return { data: ENTRIES, error: null, count: ENTRIES.length };
      }
      return { data: [], error: null };
    });
    harness.refreshGrows.mockReset();
    harness.setActiveGrowId.mockReset();
    harness.reloadActionResponseMemory.mockReset();
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
    Object.assign(harness.growsState, {
      activeGrow: GROW_A,
      activeGrowId: GROW_A.id,
      grows: [GROW_A],
      loading: false,
      error: null,
    });
    Object.assign(harness.scopedGrowState, {
      urlGrowId: null,
      scopedGrow: null,
      scopedGrowName: null,
      isValidScopedGrow: false,
      backHref: undefined,
    });
  });

  it("speaks plant, tent, or note context and still opens the entry", async () => {
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Blue Dream pour")).toBeInTheDocument();
    const buttons = screen.getAllByTestId("timeline-entry-open");
    expect(buttons).toHaveLength(ENTRIES.length);

    for (const button of buttons) {
      const label = button.getAttribute("aria-label") ?? "";
      expect(label.startsWith("Open ")).toBe(true);
      expect(label).not.toMatch(/#/);
      for (const id of RAW_IDS) expect(label).not.toContain(id);
      expect(button).toBeEnabled();
    }

    const sameMinuteA = labelFor("Blue Dream pour");
    const sameMinuteB = labelFor("Critical Mass pour");
    expect(sameMinuteA).not.toBe(sameMinuteB);

    const blank = buttons.find((button) => {
      const label = button.getAttribute("aria-label") ?? "";
      return (
        !label.includes("Blue Dream pour") &&
        !label.includes("Critical Mass pour") &&
        !label.includes(LONG_NOTE_PREFIX) &&
        !label.includes("Gelato") &&
        !label.includes("Flower tent")
      );
    });
    expect(blank?.getAttribute("aria-label") ?? "").not.toContain("entry-blank");

    const longLabel = labelFor(LONG_NOTE_PREFIX);
    expect(longLabel).not.toContain(LONG_NOTE_TAIL);
    expect(longLabel).not.toContain("x".repeat(40));

    expect(labelFor("Gelato")).toContain("Gelato");
    expect(labelFor("Flower tent")).toContain("Flower tent");

    fireEvent.click(screen.getByRole("button", { name: sameMinuteA }));
    expect(await screen.findByTestId("timeline-open-detail")).toHaveTextContent("Blue Dream pour");
  });
});
