/**
 * Daily Check target-order and exact-target regression proof.
 *
 * The page only orchestrates existing read/write surfaces. These tests mock
 * every persistence-capable child and prove that route/selector state cannot
 * drift to a different plant or tent before those children receive props.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSensorReadingsMock = vi.hoisted(() =>
  vi.fn((_tentId?: string, _limit?: number) => ({ data: [] })),
);

const mockPlants = [
  {
    id: "p-assigned",
    name: "Assigned plant with a deliberately long mobile proof name",
    strain: "Exact Target",
    grow_id: "g1",
    tent_id: "t2",
    stage: "veg",
    is_archived: false,
  },
  {
    id: "p-untented",
    name: "Untented plant",
    strain: null,
    grow_id: "g1",
    tent_id: null,
    stage: "veg",
    is_archived: false,
  },
  {
    id: "p-other-grow",
    name: "Other grow plant",
    strain: null,
    grow_id: "g2",
    tent_id: "t1",
    stage: "veg",
    is_archived: false,
  },
];

const mockTents = [
  { id: "t1", name: "Default Tent" },
  { id: "t2", name: "Assigned Tent" },
];

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mockTents, isLoading: false }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: mockPlants, isLoading: false }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: useSensorReadingsMock,
}));

vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: ({
    growId,
    tentId,
    plantId,
    testIdPrefix,
  }: {
    growId: string | null;
    tentId: string | null;
    plantId: string | null;
    testIdPrefix: string;
  }) => (
    <div
      data-testid={testIdPrefix}
      data-grow-id={growId ?? ""}
      data-tent-id={tentId ?? ""}
      data-plant-id={plantId ?? ""}
    />
  ),
}));

vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: ({ defaultTentId }: { defaultTentId?: string }) => (
    <div data-testid="mock-manual-card" data-default-tent-id={defaultTentId ?? ""} />
  ),
}));
vi.mock("@/components/QuickLog", () => ({
  default: ({
    open,
    prefill,
  }: {
    open?: boolean;
    prefill?: { growId: string | null; tentId: string | null; plantId: string | null };
  }) => (
    <div
      data-testid="mock-quicklog"
      data-open={open ? "1" : "0"}
      data-prefill-grow-id={prefill?.growId ?? ""}
      data-prefill-tent-id={prefill?.tentId ?? ""}
      data-prefill-plant-id={prefill?.plantId ?? ""}
    />
  ),
}));
vi.mock("@/components/PlantStatusStrip", () => ({
  default: ({ tentId }: { tentId: string | null }) => (
    <div data-testid="mock-status-strip" data-tent-id={tentId ?? ""} />
  ),
}));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({
  default: ({ tentId }: { tentId: string | null }) => (
    <div data-testid="mock-alerts-panel" data-tent-id={tentId ?? ""} />
  ),
}));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: ({ tentId }: { tentId: string | null }) => (
    <div data-testid="mock-actions-panel" data-tent-id={tentId ?? ""} />
  ),
}));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => <div data-testid="mock-onboarding" />,
}));

let mockUrlGrowId: string | null = null;
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: mockUrlGrowId,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));

import DailyCheck from "@/pages/DailyCheck";

function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectBefore(earlier: HTMLElement, later: HTMLElement) {
  expect(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
}

describe("DailyCheck target selector order and exact-target truth", () => {
  beforeEach(() => {
    mockUrlGrowId = null;
    useSensorReadingsMock.mockClear();
  });

  it("renders one selector before activities, fast choices, and the guided heading", async () => {
    renderRoute("/daily-check");

    const selector = await screen.findByTestId("daily-grow-check-target-selector");
    const activities = screen.getByTestId("daily-check-all-activities");
    const choose = screen.getByTestId("daily-grow-check-choose");
    const guided = screen.getByTestId("daily-grow-check-guided-heading");

    expect(screen.getAllByTestId("daily-grow-check-target-selector")).toHaveLength(1);
    expect(screen.getAllByTestId("daily-grow-check-plant-select")).toHaveLength(1);
    expect(screen.getAllByTestId("daily-grow-check-tent-select")).toHaveLength(1);
    expectBefore(selector, activities);
    expectBefore(activities, choose);
    expectBefore(choose, guided);
  });

  it("disables the plant-note fast path without a selected plant and cannot open Quick Log", async () => {
    renderRoute("/daily-check");

    const choose = await screen.findByTestId("daily-grow-check-choose");
    const note = within(choose).getByTestId("daily-grow-check-choose-quicklog");
    expect(note).toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-choose-no-plant")).toBeVisible();
    fireEvent.click(note);
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "0");
  });

  it("uses only the assigned plant tent across activities, reads, and Quick Log prefill", async () => {
    renderRoute("/daily-check?plantId=p-assigned");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-assigned",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "t2");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute(
      "data-prefill-plant-id",
      "p-assigned",
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "t2");
    expect(screen.getByTestId("daily-grow-check-tent-select")).toBeDisabled();
    expect(useSensorReadingsMock).toHaveBeenLastCalledWith("t2", 50);
  });

  it("clears the default tent for an untented route plant and keeps sensor entry disabled", async () => {
    renderRoute("/daily-check?plantId=p-untented");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-untented",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "");
    expect(screen.getByTestId("daily-grow-check-tent-select")).toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-choose-no-tent")).toBeVisible();
    expect(useSensorReadingsMock).toHaveBeenLastCalledWith(undefined, 50);
  });

  it("preserves an available tent-only selection when no plant is selected", async () => {
    renderRoute("/daily-check");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-tent-id",
        "t1",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-plant-id", "");
    expect(screen.getByTestId("daily-grow-check-tent-select")).not.toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).not.toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-start")).not.toBeDisabled();
  });

  it("preserves Start and Back semantics while every guided surface receives the exact tent", async () => {
    renderRoute("/daily-check?plantId=p-assigned");
    await waitFor(() => expect(screen.getByTestId("daily-grow-check-start")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    expect(await screen.findByTestId("mock-status-strip")).toHaveAttribute("data-tent-id", "t2");
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(await screen.findByTestId("daily-grow-check-target-selector")).toBeVisible();

    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    expect(await screen.findByTestId("mock-manual-card")).toHaveAttribute(
      "data-default-tent-id",
      "t2",
    );
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    expect(await screen.findByTestId("mock-alerts-panel")).toHaveAttribute("data-tent-id", "t2");
    expect(screen.getByTestId("mock-actions-panel")).toHaveAttribute("data-tent-id", "t2");
  });

  it("honors an exact valid plantId + method=note without changing its target", async () => {
    renderRoute("/daily-check?plantId=p-assigned&from=dashboard&method=note");

    await waitFor(() =>
      expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1"),
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute(
      "data-prefill-plant-id",
      "p-assigned",
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "t2");
  });

  it.each([
    ["unknown", "/daily-check?plantId=missing&method=note"],
    ["out-of-scope", "/daily-check?plantId=p-other-grow&growId=g1&method=note"],
  ])("fails closed for %s route targets", async (status, path) => {
    if (status === "out-of-scope") mockUrlGrowId = "g1";
    renderRoute(path);

    const rejection = await screen.findByTestId("daily-grow-check-plant-rejected");
    expect(rejection).toHaveAttribute("data-rejection-status", status);
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "0");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-plant-id", "");
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-plant-id", "");
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "");
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
  });

  it("uses the effective tent in the post-submit timeline continuity link", async () => {
    renderRoute("/daily-check?plantId=p-assigned");
    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-tent-id",
        "t2",
      ),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { createdAt: "2026-07-20T12:00:00.000Z" },
        }),
      );
    });
    const timeline = await screen.findByTestId("daily-grow-check-post-submit-timeline");
    const href = timeline.getAttribute("href");
    expect(href).toContain("plantId=p-assigned");
    expect(href).toContain("tentId=t2");
    expect(href).not.toContain("tentId=t1");
  });
});
