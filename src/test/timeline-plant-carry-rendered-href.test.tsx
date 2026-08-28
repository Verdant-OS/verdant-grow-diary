/**
 * Timeline → Sensors plant carry, proven from the RENDERED page.
 *
 * `timeline-one-tent-loop-card.test.tsx` already covers this handoff twice, but
 * neither half can fail when the page stops carrying the plant:
 *
 *   - its card cases construct `<OneTentLoopNextStepCard ids={{ plantId }}/>`
 *     directly, so they prove the CARD, never that Timeline supplies the prop;
 *   - its "Timeline source imports the card" case greps `Timeline.tsx` for the
 *     literal `plantId: timelineSensorHandoffIds.plantId`, which a one-line
 *     comment-out satisfies — the exact defeat `AGENTS.md` documents for
 *     `playwright-action-timeout-fence`.
 *
 * Measured on deploy tip `52c8abe2b`: commenting that one line out (and the
 * matching Sensors prop) returned the page to the inert state #1102 shipped.
 * The two existing source-scan suites stayed green (17/17:
 * `timeline-one-tent-loop-card` + `sensors-one-tent-loop-card`). These rendered
 * href cases failed 4 / passed 5 — the 4 failures are the carry assertions;
 * the 5 passes are the already-fail-closed omit paths. #1102 merged inert for
 * this precise reason, so the regression guard for it must not itself be a
 * source scan.
 *
 * These cases render the real `Timeline` with the real card and assert the href
 * the grower would actually follow. Presenter-level only: no schema, no writes,
 * no paging, no directory-completeness proof.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "aaaaaaaa-1111-4111-8111-111111111111";
const TENT = "bbbbbbbb-2222-4222-8222-222222222222";
const OTHER_TENT = "cccccccc-3333-4333-8333-333333333333";
const PLANT = "dddddddd-4444-4444-8444-444444444444";

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
}));

interface QuerySpec {
  table: string;
  columns: string | null;
}

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = { table, columns: null };
    const query = {
      select(columns: string) {
        spec.columns = columns;
        return query;
      },
      eq: () => query,
      is: () => query,
      gte: () => query,
      lte: () => query,
      lt: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        return Promise.resolve(harness.executeQuery({ ...spec })).then(onfulfilled, onrejected);
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
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));

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

// Deliberately NOT mocked: `@/components/OneTentLoopNextStepCard`. The rendered
// href is the whole point — a stubbed card would reproduce the blind spot this
// file exists to close.
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({ default: () => null }));
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

const GROW_ROW = {
  id: GROW,
  name: "Current Run",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

/** One diary entry on the carried plant, so the Sensors continuation unlocks. */
function diaryRows() {
  return [
    {
      id: "entry-1",
      note: "Diary evidence is present",
      photo_url: null,
      stage: "vegetative",
      details: { event_type: "note", source: "manual" },
      entry_at: "2026-07-20T12:00:00.000Z",
      plant_id: PLANT,
      tent_id: TENT,
    },
  ];
}

/** `plantTentIdsById` is built from these two reads; `tentRows` supplies the grow. */
function directoryResult(spec: QuerySpec, tentIdForPlant: string): QueryResult | null {
  if (spec.table === "plants") {
    return {
      data: [{ id: PLANT, name: "Blue Dream #2", tent_id: tentIdForPlant, grow_id: GROW }],
      error: null,
    };
  }
  if (spec.table === "tents") {
    return {
      data: [
        { id: TENT, name: "Tent A", grow_id: GROW },
        { id: OTHER_TENT, name: "Tent B", grow_id: GROW },
      ],
      error: null,
    };
  }
  return null;
}

function renderTimeline(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Timeline />
    </MemoryRouter>,
  );
}

/** The href a grower actually follows from the rendered next-step CTA. */
async function nextStepHref(): Promise<string | null> {
  const cta = await screen.findByTestId("timeline-one-tent-loop-next-step-card-cta");
  const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
  return anchor?.getAttribute("href") ?? null;
}

/**
 * Directory names only replace the fragment fallback AFTER the owner-scoped
 * plants/tents read settles. Asserting the Sensors href before that commit
 * reads the loading-state omission (`plantTentIdsById === null`) and can
 * miss a later guess. Native <option> text is the settlement signal.
 */
async function waitForDirectoryPlantName() {
  await screen.findByRole("option", { name: /Blue Dream #2/ });
}

async function waitForDirectoryTentName() {
  await screen.findByRole("option", { name: /Tent A/ });
}

describe("Timeline → Sensors plant carry (rendered page, not source text)", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.refreshGrows.mockReset();
    harness.setActiveGrowId.mockReset();
    harness.reloadActionResponseMemory.mockReset();
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
    Object.assign(harness.growsState, {
      activeGrow: GROW_ROW,
      activeGrowId: GROW,
      grows: [GROW_ROW],
      loading: false,
      error: null,
    });
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows(), error: null, count: 1 };
      return directoryResult(spec, TENT) ?? { data: [], error: null };
    });
  });

  it("puts the grower's chosen plant UUID in the rendered Sensors href", async () => {
    renderTimeline(`/timeline?plantId=${PLANT}`);

    // Directory first: the loading-state href omits plantId, which is the
    // same shape as a page that never wires it. Wait for the name so the
    // assertion below is about the settled handoff, not the first paint.
    await waitForDirectoryPlantName();
    await waitFor(async () =>
      expect(await nextStepHref()).toBe(
        `/sensors?tentId=${TENT}&tentIntent=required&plantId=${PLANT}`,
      ),
    );
  });

  it("carries the plant the grower picks in the Timeline filter, not only a pre-set URL", async () => {
    renderTimeline("/timeline");
    await waitForDirectoryPlantName();
    await waitFor(async () => expect(await nextStepHref()).toBe("/sensors"));

    fireEvent.change(screen.getByTestId("timeline-plant-filter"), {
      target: { value: PLANT },
    });

    await waitFor(async () =>
      expect(await nextStepHref()).toBe(
        `/sensors?tentId=${TENT}&tentIntent=required&plantId=${PLANT}`,
      ),
    );
  });

  it("never renders the carried plant or tent UUID as visible copy", async () => {
    const { container } = renderTimeline(`/timeline?plantId=${PLANT}`);
    await waitForDirectoryPlantName();
    await waitFor(async () => expect(await nextStepHref()).toContain(PLANT));

    // A UUID is an internal id, not a plant name. Doctrine is that Sensors
    // re-emits intent WITHOUT inventing an identity for it.
    const card = screen.getByTestId("timeline-one-tent-loop-next-step-card");
    expect(card.textContent ?? "").not.toContain(PLANT);
    expect(card.textContent ?? "").not.toContain(TENT);
    expect(container.textContent ?? "").not.toContain(PLANT);
  });

  it("omits the plant — keeping the explicit tent — when the two disagree", async () => {
    // The plant's proven tent is OTHER_TENT while the grower explicitly filtered
    // TENT. Carrying both would hand Doctor a pair the directory contradicts.
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows(), error: null, count: 1 };
      return directoryResult(spec, OTHER_TENT) ?? { data: [], error: null };
    });

    renderTimeline(`/timeline?plantId=${PLANT}&tentId=${TENT}`);

    // Loading-state href is already `/sensors?tentId=${TENT}` (plant omitted
    // while plantTentIdsById is null). Wait for the directory name so a
    // post-load regression that starts carrying the mismatched plant fails.
    await waitForDirectoryPlantName();
    await waitFor(async () => expect(await nextStepHref()).toBe(`/sensors?tentId=${TENT}`));
    expect(await nextStepHref()).not.toContain(PLANT);
  });

  it("omits the plant when the owner directory read fails, rather than guessing a tent", async () => {
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows(), error: null, count: 1 };
      if (spec.table === "plants") return { data: null, error: { message: "read failed" } };
      if (spec.table === "tents") {
        return { data: [{ id: TENT, name: "Tent A", grow_id: GROW }], error: null };
      }
      return { data: [], error: null };
    });

    renderTimeline(`/timeline?plantId=${PLANT}`);

    // Tents can still name themselves after a plants-read failure; that is
    // the settlement signal. The exact generic `/sensors` href is the
    // no-guess pin — `/sensors?tentId=${TENT}` would also lack plantId and
    // tentIntent=required, so a first-available tent guess must not pass.
    await waitForDirectoryTentName();
    await waitFor(async () => expect(await nextStepHref()).toBe("/sensors"));
    expect(screen.queryByRole("option", { name: /Blue Dream #2/ })).toBeNull();
  });
});
