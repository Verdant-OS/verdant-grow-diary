/**
 * DiaryEntryRemoveButton — "Add to correct plant" follow-up behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import React from "react";
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

import DiaryEntryRemoveButton from "@/components/DiaryEntryRemoveButton";

function render(ui: React.ReactElement) {
  const client = new QueryClient();
  return rtlRender(
    React.createElement(QueryClientProvider, { client }, ui),
  );
}

const VIEWER = { currentUserId: "user-1" };

beforeEach(() => {
  deleteEq.mockReset();
  deleteEq.mockImplementation(() => Promise.resolve({ error: null }));
  deleteFn.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

async function performRemoval(testId = "diary-entry-remove-button") {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
  await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
}

describe("DiaryEntryRemoveButton — follow-up visibility", () => {
  it("does NOT show follow-up before any removal", () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary" }}
        viewer={VIEWER}
        showFollowUp
        tentId="t1"
        growId="g1"
      />,
    );
    expect(screen.queryByTestId("diary-entry-remove-followup")).toBeNull();
  });

  it("shows follow-up after a successful log removal", async () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary" }}
        viewer={VIEWER}
        showFollowUp
        tentId="t1"
        growId="g1"
      />,
    );
    await performRemoval();
    expect(await screen.findByTestId("diary-entry-remove-followup")).toBeTruthy();
    expect(screen.getByText("Add to correct plant")).toBeTruthy();
    expect(
      screen.getByText(
        "Open Quick Log and choose the correct plant for this entry.",
      ),
    ).toBeTruthy();
  });

  it("shows follow-up after a successful photo log removal", async () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e2", kind: "diary", photoUrl: "x.jpg" }}
        viewer={VIEWER}
        showFollowUp
        tentId="t1"
        growId="g1"
      />,
    );
    await performRemoval();
    expect(screen.getByTestId("diary-entry-remove-followup")).toBeTruthy();
  });

  it("does NOT show follow-up on removal error", async () => {
    deleteEq.mockImplementationOnce(() =>
      Promise.resolve({ error: { code: "42501", message: "denied" } }),
    );
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e3", kind: "diary" }}
        viewer={VIEWER}
        showFollowUp
        tentId="t1"
        growId="g1"
      />,
    );
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByTestId("diary-entry-remove-followup")).toBeNull();
  });

  it("does NOT show follow-up when showFollowUp is false", async () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e4", kind: "diary" }}
        viewer={VIEWER}
        tentId="t1"
        growId="g1"
      />,
    );
    await performRemoval();
    expect(screen.queryByTestId("diary-entry-remove-followup")).toBeNull();
  });
});

describe("DiaryEntryRemoveButton — follow-up handoff", () => {
  it("dispatches verdant:open-quicklog with tentId/growId and no plantId/plantName", async () => {
    const events: CustomEvent[] = [];
    const listener = (ev: Event) => events.push(ev as CustomEvent);
    window.addEventListener("verdant:open-quicklog", listener as EventListener);
    try {
      render(
        <DiaryEntryRemoveButton
          entry={{ id: "e5", kind: "diary" }}
          viewer={VIEWER}
          showFollowUp
          plantId="plant-source"
          plantName="Wrong plant"
          tentId="tent-1"
          growId="grow-1"
        />,
      );
      await performRemoval();
      fireEvent.click(screen.getByTestId("diary-entry-remove-followup-button"));
      expect(events.length).toBe(1);
      const detail = events[0].detail as Record<string, unknown>;
      expect(detail.eventType).toBe("observation");
      expect(detail.suggestSnapshot).toBe(true);
      expect(detail.tentId).toBe("tent-1");
      expect(detail.growId).toBe("grow-1");
      expect(detail.plantId).toBeUndefined();
      expect(detail.plantName).toBeUndefined();
      // Note prefill defaults on.
      expect(detail.note).toBe(
        "Re-entering log after removing it from the wrong plant.",
      );
    } finally {
      window.removeEventListener(
        "verdant:open-quicklog",
        listener as EventListener,
      );
    }
  });

  it("respects followUpNote=null to omit note prefill", async () => {
    const events: CustomEvent[] = [];
    const listener = (ev: Event) => events.push(ev as CustomEvent);
    window.addEventListener("verdant:open-quicklog", listener as EventListener);
    try {
      render(
        <DiaryEntryRemoveButton
          entry={{ id: "e6", kind: "diary" }}
          viewer={VIEWER}
          showFollowUp
          tentId="tent-1"
          growId="grow-1"
          followUpNote={null}
        />,
      );
      await performRemoval();
      fireEvent.click(screen.getByTestId("diary-entry-remove-followup-button"));
      const detail = events[0].detail as Record<string, unknown>;
      expect(detail.note).toBeUndefined();
    } finally {
      window.removeEventListener(
        "verdant:open-quicklog",
        listener as EventListener,
      );
    }
  });

  it("follow-up button uses required accessible label", async () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e7", kind: "diary" }}
        viewer={VIEWER}
        showFollowUp
        tentId="t1"
        growId="g1"
      />,
    );
    await performRemoval();
    expect(
      screen.getByLabelText("Add corrected Quick Log to the correct plant"),
    ).toBeTruthy();
  });

  it("follow-up dispatch does NOT call supabase or toast (no direct writes)", async () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e8", kind: "diary" }}
        viewer={VIEWER}
        showFollowUp
        tentId="t1"
        growId="g1"
      />,
    );
    await performRemoval();
    deleteFn.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    fireEvent.click(screen.getByTestId("diary-entry-remove-followup-button"));
    expect(deleteFn).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("follow-up disappears after click (single-use)", async () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e9", kind: "diary" }}
        viewer={VIEWER}
        showFollowUp
        tentId="t1"
        growId="g1"
      />,
    );
    await performRemoval();
    fireEvent.click(screen.getByTestId("diary-entry-remove-followup-button"));
    expect(screen.queryByTestId("diary-entry-remove-followup")).toBeNull();
  });
});
