/**
 * Timeline — raw internal detail-field leak guard.
 *
 * Found via a live production browser walkthrough (2026-07-27): diary
 * entries carrying a Pheno evidence receipt (details.kind ===
 * "pheno_evidence_receipt") or Quick Log v2 companion-row plumbing
 * (quick_log_version, linked_grow_event_id, and null-valued
 * feeding/watering/photo_url echoes) fell through Timeline.tsx's generic
 * "extra" chip fallback and rendered raw internal keys/UUIDs directly to
 * the grower — e.g. "hunt_id: 9540a3f2-...", "linked_grow_event_id:
 * bf0a684e-...", "device_control: false", "quick_log_version: 2".
 *
 * These fields are pure machine bookkeeping (join ids, schema-version
 * markers, internal flags) with no grower-facing meaning and must never
 * render as raw key:value chips, matching the existing doctrine for
 * learning-loop and AI Doctor readiness-check rows in the same file.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  isReducedMotionPreferred: () => false,
  useTimelineHighlightAutoScroll: () => undefined,
}));

vi.mock("@/hooks/useTimelineHashAnchorHandoff", () => ({
  useTimelineHashAnchorHandoff: () => undefined,
}));

vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({ default: () => null }));
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

const PHENO_RECEIPT_ENTRY = {
  id: "entry-pheno-receipt",
  note: "Correct-save-path proof: stretch evidence via Save log.",
  photo_url: null,
  stage: "seedling",
  entry_at: "2026-07-25T13:14:40.000Z",
  plant_id: "plant-a",
  tent_id: null,
  details: {
    event_type: "observation",
    kind: "pheno_evidence_receipt",
    stage: "seedling",
    source: "manual",
    hunt_id: "9540a3f2-10e9-4815-ac50-e7ae892babbd",
    evidence_goal: "stretch",
    evidence_only: true,
    device_control: false,
    receipt_version: 1,
    automatic_selection: false,
    action_queue_created: false,
  },
};

const QUICK_LOG_V2_ENTRY = {
  id: "entry-quicklog-v2",
  note: "Network-inspection retest: checking stretch evidence tagging.",
  photo_url: null,
  stage: null,
  entry_at: "2026-07-25T13:03:28.000Z",
  plant_id: "plant-a",
  tent_id: null,
  details: {
    event_type: "observation",
    source: "manual",
    feeding: null,
    watering: null,
    photo_url: null,
    quick_log_version: 2,
    linked_grow_event_id: "bf0a684e-a96e-472c-af8f-e38a54a8332c",
  },
};

function renderTimeline() {
  return render(
    <MemoryRouter initialEntries={["/timeline"]}>
      <Timeline />
    </MemoryRouter>,
  );
}

const LEAKED_KEYS = [
  "hunt_id",
  "evidence_goal",
  "evidence_only",
  "device_control",
  "receipt_version",
  "automatic_selection",
  "action_queue_created",
  "quick_log_version",
  "linked_grow_event_id",
];

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
  harness.executeQuery.mockImplementation((table: string) => {
    if (table === "diary_entries") {
      return { data: [PHENO_RECEIPT_ENTRY, QUICK_LOG_V2_ENTRY], error: null, count: 2 };
    }
    return { data: [], error: null, count: 0 };
  });
});

describe("Timeline — raw internal detail-field leak guard", () => {
  it("never renders Pheno evidence receipt machine fields as raw chips", async () => {
    renderTimeline();
    await screen.findByText("Correct-save-path proof: stretch evidence via Save log.");

    for (const key of LEAKED_KEYS) {
      expect(document.body.textContent ?? "").not.toContain(key);
    }
    // The receipt id/goal values themselves must not leak either.
    expect(document.body.textContent ?? "").not.toContain("9540a3f2-10e9-4815-ac50-e7ae892babbd");
  });

  it("never renders Quick Log v2 plumbing fields as raw chips", async () => {
    renderTimeline();
    await screen.findByText("Network-inspection retest: checking stretch evidence tagging.");

    expect(document.body.textContent ?? "").not.toContain("linked_grow_event_id");
    expect(document.body.textContent ?? "").not.toContain("bf0a684e-a96e-472c-af8f-e38a54a8332c");
    expect(document.body.textContent ?? "").not.toContain("quick_log_version");
    // Null-valued echo fields must not render as "feeding: null" / "watering: null".
    expect(document.body.textContent ?? "").not.toMatch(/feeding:\s*null/i);
    expect(document.body.textContent ?? "").not.toMatch(/watering:\s*null/i);
    expect(document.body.textContent ?? "").not.toMatch(/photo_url:\s*null/i);
  });

  it("opening entry details does not reveal the raw fields either", async () => {
    renderTimeline();
    const body = await screen.findByText("Correct-save-path proof: stretch evidence via Save log.");
    fireEvent.click(body);

    for (const key of LEAKED_KEYS) {
      expect(document.body.textContent ?? "").not.toContain(key);
    }
  });
});
