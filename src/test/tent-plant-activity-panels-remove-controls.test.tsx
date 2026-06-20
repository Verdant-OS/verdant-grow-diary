/**
 * Tent Detail Activity Panels — entry-specific remove controls.
 *
 * The Remove log / Remove photo log controls reuse the existing
 * DiaryEntryRemoveButton. They appear only when the read model exposes a
 * specific diary/photo entry id. Internal ids never leak into UI text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { deleteEq, deleteFn, toastSuccess, toastError } = vi.hoisted(() => {
  const deleteEq = vi.fn(() => Promise.resolve({ error: null }));
  const deleteFn = vi.fn(() => ({ eq: deleteEq }));
  return {
    deleteEq,
    deleteFn,
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => ({ delete: deleteFn })) },
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import TentPlantActivityPanels from "@/components/TentPlantActivityPanels";
import { buildTentPlantActivityPanelsViewModel } from "@/lib/tentPlantActivityPanelsViewModel";

function render(ui: React.ReactElement) {
  const client = new QueryClient();
  return rtlRender(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(MemoryRouter, null, ui),
    ),
  );
}

const PLANT = {
  id: "plant-1",
  name: "Blue Dream",
  strain: "Blue Dream",
  stage: "flower",
  isArchived: false,
};

function buildVm(activity: Record<string, unknown>) {
  return buildTentPlantActivityPanelsViewModel({
    plants: [PLANT],
    activityByPlantId: { [PLANT.id]: activity },
    includeArchived: false,
    selectedPlantId: null,
    tentId: "tent-1",
    tentName: "Flower",
    growId: "grow-1",
  });
}

beforeEach(() => {
  deleteEq.mockReset();
  deleteEq.mockImplementation(() => Promise.resolve({ error: null }));
  deleteFn.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("TentPlantActivityPanels — remove controls visibility", () => {
  it("shows Remove log when latestLogEntryId exists and viewer is owner", () => {
    const vm = buildVm({
      latestLogAt: "2026-06-10T10:00:00Z",
      latestLogEntryId: "diary-1",
    });
    render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1" }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.getAllByText("Remove log").length).toBeGreaterThan(0);
  });

  it("hides Remove log when latestLogEntryId is missing", () => {
    const vm = buildVm({
      latestLogAt: "2026-06-10T10:00:00Z",
      // no latestLogEntryId
    });
    render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1" }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.queryByText("Remove log")).toBeNull();
  });

  it("shows Remove photo log when latestPhotoEntryId exists", () => {
    const vm = buildVm({
      latestLogAt: "2026-06-10T10:00:00Z",
      latestLogEntryId: "diary-1",
      hasRecentPhoto: true,
      latestPhotoEntryId: "photo-1",
    });
    render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1" }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.getByText("Remove photo log")).toBeTruthy();
  });

  it("hides Remove photo log when latestPhotoEntryId is missing", () => {
    const vm = buildVm({
      hasRecentPhoto: true,
      // no latestPhotoEntryId
    });
    render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1" }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.queryByText("Remove photo log")).toBeNull();
  });

  it("hides all remove controls in customer/public mode", () => {
    const vm = buildVm({
      latestLogAt: "2026-06-10T10:00:00Z",
      latestLogEntryId: "diary-1",
      hasRecentPhoto: true,
      latestPhotoEntryId: "photo-1",
    });
    render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1", isCustomerOrPublicMode: true }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.queryByText("Remove log")).toBeNull();
    expect(screen.queryByText("Remove photo log")).toBeNull();
  });

  it("hides all remove controls in read-only report views", () => {
    const vm = buildVm({
      latestLogEntryId: "diary-1",
      latestLogAt: "2026-06-10T10:00:00Z",
    });
    render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1", isReadOnlyReportView: true }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(screen.queryByText("Remove log")).toBeNull();
  });

  it("hides remove controls entirely when viewer prop is not provided", () => {
    const vm = buildVm({
      latestLogEntryId: "diary-1",
      latestLogAt: "2026-06-10T10:00:00Z",
    });
    render(<TentPlantActivityPanels viewModel={vm} />);
    expect(screen.queryByText("Remove log")).toBeNull();
  });

  it("never renders the internal entry id in panel text", () => {
    const vm = buildVm({
      latestLogAt: "2026-06-10T10:00:00Z",
      latestLogEntryId: "diary-SECRET-id",
      hasRecentPhoto: true,
      latestPhotoEntryId: "photo-SECRET-id",
    });
    const { container } = render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1" }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    expect(container.textContent ?? "").not.toContain("diary-SECRET-id");
    expect(container.textContent ?? "").not.toContain("photo-SECRET-id");
  });
});

describe("TentPlantActivityPanels — remove behavior", () => {
  it("confirm calls supabase delete for the latest log entry id only", async () => {
    const vm = buildVm({
      latestLogAt: "2026-06-10T10:00:00Z",
      latestLogEntryId: "diary-1",
    });
    render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1" }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    fireEvent.click(screen.getByText("Remove log"));
    expect(screen.getByText("Remove this log?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() => expect(deleteFn).toHaveBeenCalledTimes(1));
    expect(deleteEq).toHaveBeenCalledWith("id", "diary-1");
    expect(toastSuccess).toHaveBeenCalledWith("Log removed.");
  });

  it("confirm on photo control deletes the latest photo entry id with photo toast", async () => {
    const vm = buildVm({
      hasRecentPhoto: true,
      latestPhotoEntryId: "photo-1",
    });
    render(
      <TentPlantActivityPanels
        viewModel={vm}
        viewer={{ currentUserId: "user-1" }}
        tentId="tent-1"
        growId="grow-1"
      />,
    );
    fireEvent.click(screen.getByText("Remove photo log"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() =>
      expect(deleteEq).toHaveBeenCalledWith("id", "photo-1"),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Photo log removed.");
  });
});
