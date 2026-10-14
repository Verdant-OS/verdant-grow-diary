/**
 * Two same-type, same-minute waterings for one plant whose notes share the
 * first 40 characters must still get distinct Open accessible names.
 * The spoken difference is the rest of the note. A raw entry id is never spoken.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
  entries: [] as Array<Record<string, unknown>>,
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
  default: () => null,
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

const LEFT_ID = "similar-open-left-9f3a2c";
const RIGHT_ID = "similar-open-right-7c2b1d";
const LEFT_NOTE = "Checked runoff before lights out xxxxxxxxxxxxxxxxxxxx left";
const RIGHT_NOTE = "Checked runoff before lights out xxxxxxxxxxxxxxxxxxxx right";

function watering(id: string, note: string, entryAt: string) {
  return {
    id,
    note,
    photo_url: null,
    stage: "vegetative",
    details: { event_type: "watering", source: "manual", plant_name: "Blue Dream" },
    entry_at: entryAt,
    plant_id: "plant-blue-dream",
    tent_id: null,
  };
}

const ENTRIES = [
  watering(LEFT_ID, LEFT_NOTE, "2026-10-12T15:00:05.000Z"),
  watering(RIGHT_ID, RIGHT_NOTE, "2026-10-12T15:00:50.000Z"),
];

const SHARED_FORTY = `Checked runoff before lights out ${"x".repeat(9)}`;
const CAPPED_BLOCK = "y".repeat(24);
const APPLE_ID = "similar-open-apple-1a2b3c";
const BERRY_ID = "similar-open-berry-4d5e6f";
const CHERRY_ID = "similar-open-cherry-7a8b9c";
const APPLE_NOTE = `${SHARED_FORTY}${CAPPED_BLOCK}apple`;
const BERRY_NOTE = `${SHARED_FORTY}${CAPPED_BLOCK}berry`;
const CHERRY_NOTE = `${SHARED_FORTY}third card diverges early`;
const LONG_SHARED = `Checked runoff before lights out ${"x".repeat(20)}`;
const IDENTICAL_NOTE = "identical runoff check";
const IDENTICAL_IDS = [
  "similar-open-same-aaa111",
  "similar-open-same-bbb222",
  "similar-open-same-ccc333",
] as const;

describe("timeline similar-note Open labels", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return { data: harness.entries, error: null, count: harness.entries.length };
      }
      return { data: [], error: null };
    });
    harness.refreshGrows.mockReset();
    harness.setActiveGrowId.mockReset();
    harness.reloadActionResponseMemory.mockReset();
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
    harness.entries = ENTRIES;
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

  it("keeps same-minute Open labels distinct when notes share their first 40 characters", async () => {
    expect(LEFT_NOTE.slice(0, 40)).toBe(RIGHT_NOTE.slice(0, 40));
    expect(LEFT_NOTE.length).toBeGreaterThan(40);
    expect(RIGHT_NOTE.length).toBeGreaterThan(40);

    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );

    expect(await screen.findByText(LEFT_NOTE)).toBeInTheDocument();
    expect(screen.getByText(RIGHT_NOTE)).toBeInTheDocument();

    const names = screen
      .getAllByTestId("timeline-entry-open")
      .map((button) => button.getAttribute("aria-label") ?? "");
    expect(names).toHaveLength(2);

    for (const name of names) {
      expect(name.startsWith("Open ")).toBe(true);
      expect(name).not.toMatch(/#/);
      expect(name).not.toContain(LEFT_ID);
      expect(name).not.toContain(RIGHT_ID);
    }

    const left = names.find((name) => name.endsWith(" left"));
    const right = names.find((name) => name.endsWith(" right"));
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(left).not.toBe(right);
  });

  it("keeps three long shared prefixes distinct when the difference is inside the suffix cap", async () => {
    const notes = [`${LONG_SHARED} left`, `${LONG_SHARED} right`, `${LONG_SHARED} center`];
    expect(notes[0].slice(0, 40)).toBe(notes[1].slice(0, 40));
    expect(notes[1].slice(0, 40)).toBe(notes[2].slice(0, 40));
    harness.entries = [
      watering("similar-open-long-left-aaa", notes[0], "2026-10-12T15:00:05.000Z"),
      watering("similar-open-long-right-bbb", notes[1], "2026-10-12T15:00:20.000Z"),
      watering("similar-open-long-center-ccc", notes[2], "2026-10-12T15:00:40.000Z"),
    ];

    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );

    const names = await openNames(3);
    expect(names.find((name) => name.endsWith(" left"))).toBeTruthy();
    expect(names.find((name) => name.endsWith(" right"))).toBeTruthy();
    expect(names.find((name) => name.endsWith(" center"))).toBeTruthy();
    expect(new Set(names).size).toBe(3);
  });

  it("keeps three Open labels distinct when a sibling shortens the prefix under the 24-character cap", async () => {
    expect(APPLE_NOTE.slice(0, 40)).toBe(BERRY_NOTE.slice(0, 40));
    expect(BERRY_NOTE.slice(0, 40)).toBe(CHERRY_NOTE.slice(0, 40));
    expect(APPLE_NOTE.slice(40, 64)).toBe(BERRY_NOTE.slice(40, 64));
    expect(APPLE_NOTE.slice(40, 64)).not.toBe(CHERRY_NOTE.slice(40, 64));
    harness.entries = [
      watering(APPLE_ID, APPLE_NOTE, "2026-10-12T15:00:05.000Z"),
      watering(BERRY_ID, BERRY_NOTE, "2026-10-12T15:00:20.000Z"),
      watering(CHERRY_ID, CHERRY_NOTE, "2026-10-12T15:00:40.000Z"),
    ];

    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );

    const names = await openNames(3, [APPLE_ID, BERRY_ID, CHERRY_ID]);
    expect(names.find((name) => name.endsWith("apple"))).toBeTruthy();
    expect(names.find((name) => name.endsWith("berry"))).toBeTruthy();
    expect(names.find((name) => name.includes("diverges"))).toBeTruthy();
    expect(new Set(names).size).toBe(3);
  });

  it("gives identical notes a unique Open label without speaking the entry id", async () => {
    harness.entries = [
      watering(IDENTICAL_IDS[0], IDENTICAL_NOTE, "2026-10-12T15:00:05.000Z"),
      watering(IDENTICAL_IDS[1], IDENTICAL_NOTE, "2026-10-12T15:00:20.000Z"),
      watering(IDENTICAL_IDS[2], IDENTICAL_NOTE, "2026-10-12T15:00:40.000Z"),
    ];

    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText(IDENTICAL_NOTE)).toHaveLength(3);
    const names = await openNames(3, [...IDENTICAL_IDS]);
    expect(new Set(names).size).toBe(3);
    for (const name of names) {
      expect(name).toContain("identical");
      expect(name).toMatch(/same note [123]$/);
    }
  });
});

async function openNames(count: number, ids: readonly string[] = []): Promise<string[]> {
  const names = (await screen.findAllByTestId("timeline-entry-open")).map(
    (button) => button.getAttribute("aria-label") ?? "",
  );
  expect(names).toHaveLength(count);
  for (const name of names) {
    expect(name.startsWith("Open ")).toBe(true);
    expect(name).not.toMatch(/#/);
    for (const id of ids) expect(name).not.toContain(id);
  }
  return names;
}
