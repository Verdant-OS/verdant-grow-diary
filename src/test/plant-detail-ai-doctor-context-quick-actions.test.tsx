import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailAiDoctorContextPanel from "@/components/PlantDetailAiDoctorContextPanel";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import {
  readSensorsTentRouteIntent,
  resolveSensorsTentRouteSelection,
} from "@/lib/sensorRouteTentIntentRules";

const insertSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
      },
      select: () => ({ eq: () => ({ data: [], error: null }) }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

const contextSources = vi.hoisted(() => ({
  timelineItems: [] as TimelineMemoryItem[],
  currentRows: [] as unknown[],
  currentStatus: "success" as "loading" | "error" | "refresh_error" | "success",
}));

// These hooks pull from react-query / supabase; keep their evidence mutable so
// the panel and live-review readiness seams can be checked against the same rows.
vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: contextSources.timelineItems, isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 25,
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => ({
    byTent: Object.fromEntries(tentIds.map((tentId) => [tentId, contextSources.currentRows])),
    statusByTent: Object.fromEntries(
      tentIds.map((tentId) => [tentId, contextSources.currentStatus]),
    ),
    isLoading: contextSources.currentStatus === "loading",
    isError:
      contextSources.currentStatus === "error" || contextSources.currentStatus === "refresh_error",
  }),
}));
vi.mock("@/hooks/useRootZoneObservations", () => ({
  useRootZoneObservations: () => ({
    observations: [],
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";

function contextPanel(tentId: string | null | undefined, growId: string | undefined = "grow-A") {
  return (
    <MemoryRouter>
      <PlantDetailAiDoctorContextPanel
        plantId="plant-B"
        plant={{ id: "plant-B", name: "Beta", growId, tentId }}
      />
    </MemoryRouter>
  );
}

function sensorLinkUrl() {
  const href = screen.getByRole("link", { name: "Add sensor snapshot" }).getAttribute("href");
  return new URL(href!, "https://verdant.example");
}

describe("PlantDetailAiDoctorContextPanel — quick actions", () => {
  beforeEach(() => {
    contextSources.timelineItems = [];
    contextSources.currentRows = [];
    contextSources.currentStatus = "success";
  });

  it.each(["grow-A", ""])(
    "carries the assigned tent to manual capture when grow context is %j",
    (growId) => {
      render(contextPanel(TENT_B, growId));
      const url = sensorLinkUrl();
      expect(url.pathname).toBe("/sensors");
      expect(url.searchParams.get("tentId")).toBe(TENT_B);
      expect(url.searchParams.get("tentIntent")).toBe("required");
      expect(url.hash).toBe("#manual-reading");
      // Consume the rendered link with the real destination selection rule:
      // neither the first owned tent nor the previous selection may win.
      expect(
        resolveSensorsTentRouteSelection({
          intent: readSensorsTentRouteIntent(url.searchParams),
          currentTentId: TENT_A,
          tents: [{ id: TENT_A }, { id: TENT_B }],
        }),
      ).toBe(TENT_B);
    },
  );

  it("does not let an unavailable assigned tent silently select another owned tent", () => {
    render(contextPanel(TENT_B));
    expect(
      resolveSensorsTentRouteSelection({
        intent: readSensorsTentRouteIntent(sensorLinkUrl().searchParams),
        currentTentId: TENT_A,
        tents: [{ id: TENT_A }],
      }),
    ).toBeNull();
  });

  it("replaces the capture target when the displayed plant's tent changes", () => {
    const { rerender } = render(contextPanel(TENT_B));
    expect(sensorLinkUrl().searchParams.get("tentId")).toBe(TENT_B);
    rerender(contextPanel(TENT_A));
    expect(sensorLinkUrl().searchParams.get("tentId")).toBe(TENT_A);
    expect(sensorLinkUrl().searchParams.get("tentIntent")).toBe("required");
  });

  it.each([null, undefined, "not-a-uuid"])(
    "keeps ordinary grow selection when no valid tent is known (%j)",
    (tentId) => {
      render(contextPanel(tentId));
      const url = sensorLinkUrl();
      expect(url.pathname).toBe("/sensors");
      expect(url.searchParams.get("growId")).toBe("grow-A");
      expect(url.searchParams.has("tentId")).toBe(false);
      expect(url.searchParams.has("tentIntent")).toBe(false);
      expect(url.hash).toBe("#manual-reading");
    },
  );

  it("keeps manual capture available without inventing a grow or tent", () => {
    render(contextPanel(null, ""));
    const url = sensorLinkUrl();
    expect(url.pathname + url.search + url.hash).toBe("/sensors#manual-reading");
  });

  it("renders quick actions for supported missing context with preserved plant scope", () => {
    render(
      <MemoryRouter>
        <PlantDetailAiDoctorContextPanel
          plantId="p1"
          plant={{
            id: "p1",
            name: "Alpha",
            strain: null,
            stage: null,
            medium: null,
            photo: null,
            growId: "g1",
            tentId: "t1",
          }}
        />
      </MemoryRouter>,
    );
    const edit = screen.getByTestId("ai-doctor-context-quick-action-update-plant-profile");
    expect(edit.textContent).toContain("Edit plant details");
    const editHref =
      edit.getAttribute("href") ?? edit.querySelector("a")?.getAttribute("href") ?? "";
    expect(editHref).toContain("/plants/p1");

    const snap = screen.getByTestId("ai-doctor-context-quick-action-add-manual-sensor-snapshot");
    const snapHref =
      snap.getAttribute("href") ?? snap.querySelector("a")?.getAttribute("href") ?? "";
    expect(snapHref).toMatch(/\/sensors/);
    expect(snapHref).toContain("g1");

    // Add note / Add photo dispatch the existing QuickLog event.
    expect(
      screen.getByTestId("ai-doctor-context-quick-action-add-recent-log").textContent,
    ).toContain("Add note");
    expect(
      screen.getByTestId("ai-doctor-context-quick-action-add-plant-photo").textContent,
    ).toContain("Add photo");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("renders informational-only no-warning copy without a misleading action", () => {
    render(
      <MemoryRouter>
        <PlantDetailAiDoctorContextPanel
          plantId="p1"
          plant={{
            id: "p1",
            name: "Alpha",
            strain: "NL",
            stage: "veg",
            medium: "Coco",
            photo: "x",
            growId: "g1",
            tentId: "t1",
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("plant-ai-doctor-context-no-warning").textContent).toContain(
      "No warning context found.",
    );
  });

  it("shows the same partial readiness for one note plus a fresh manual tent reading", () => {
    const tentId = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e77";
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    contextSources.timelineItems = [
      {
        kind: "diary",
        key: "first-note",
        occurredAt: new Date(Date.now() - 60 * 60_000).toISOString(),
        eventType: "note",
        hasPhoto: false,
        note: "First plant check",
      },
    ];
    contextSources.currentRows = [
      {
        id: "manual-temperature",
        tent_id: tentId,
        metric: "temperature_c",
        value: 24,
        captured_at: capturedAt,
        ts: capturedAt,
        created_at: capturedAt,
        source: "manual",
        quality: "ok",
      },
    ];

    render(
      <MemoryRouter>
        <PlantDetailAiDoctorContextPanel
          plantId="p1"
          plant={{
            id: "p1",
            name: "Alpha",
            strain: "NL",
            stage: "veg",
            medium: "Coco",
            photo: null,
            growId: "11111111-1111-4111-8111-111111111111",
            tentId,
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("plant-ai-doctor-context-panel")).toHaveAttribute(
      "data-readiness",
      "partial",
    );
    expect(
      screen
        .getByTestId("plant-ai-doctor-context-evidence")
        .querySelector('[data-code="recent-manual-sensor-snapshot"]'),
    ).not.toBeNull();
    expect(screen.getByTestId("plant-ai-doctor-context-latest-snapshot")).toBeInTheDocument();
  });
});
