/**
 * DiaryEntryRemoveButton — visibility, confirmation, mutation, toast tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { readMaybeSingle, readEq, deleteMaybeSingle, deleteEq, deleteFn, toastSuccess, toastError } =
  vi.hoisted(() => {
    type QueryError = { code: string; message: string };
    const readMaybeSingle = vi.fn(
      async (): Promise<{ data: { details: unknown } | null; error: QueryError | null }> => ({
        data: { details: {} },
        error: null,
      }),
    );
    const readEq = vi.fn((_field: string, _value: string) => ({ maybeSingle: readMaybeSingle }));
    const deleteMaybeSingle = vi.fn(
      async (): Promise<{ data: { id: string } | null; error: QueryError | null }> => ({
        data: { id: deleteEq.mock.lastCall?.[1] ?? "" },
        error: null,
      }),
    );
    const deleteSelect = vi.fn(() => ({ maybeSingle: deleteMaybeSingle }));
    const deleteEq = vi.fn((_field: string, _value: string) => ({ select: deleteSelect }));
    const deleteFn = vi.fn(() => ({ eq: deleteEq }));
    return {
      readMaybeSingle,
      readEq,
      deleteMaybeSingle,
      deleteEq,
      deleteFn,
      toastSuccess: vi.fn(),
      toastError: vi.fn(),
    };
  });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: readEq })),
      delete: deleteFn,
    })),
  },
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import DiaryEntryRemoveButton from "@/components/DiaryEntryRemoveButton";

const VIEWER = { currentUserId: "user-1" };

function render(ui: React.ReactElement) {
  const client = new QueryClient();
  return rtlRender(React.createElement(QueryClientProvider, { client }, ui));
}

beforeEach(() => {
  readMaybeSingle.mockReset();
  readMaybeSingle.mockImplementation(() => Promise.resolve({ data: { details: {} }, error: null }));
  readEq.mockClear();
  deleteMaybeSingle.mockReset();
  deleteMaybeSingle.mockImplementation(() =>
    Promise.resolve({ data: { id: deleteEq.mock.lastCall?.[1] ?? "" }, error: null }),
  );
  deleteEq.mockClear();
  deleteFn.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("DiaryEntryRemoveButton — visibility", () => {
  it("renders for owner diary entry", () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", ownerUserId: "user-1", kind: "diary" }}
        viewer={VIEWER}
      />,
    );
    expect(screen.getByTestId("diary-entry-remove-button")).toBeTruthy();
    expect(screen.getByText("Remove log")).toBeTruthy();
  });

  it("renders photo-log label when entry has photo_url", () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary", photoUrl: "x.jpg" }}
        viewer={VIEWER}
      />,
    );
    expect(screen.getByText("Remove photo log")).toBeTruthy();
  });

  it("does NOT render for sensor readings", () => {
    const { container } = render(
      <DiaryEntryRemoveButton entry={{ id: "s1", kind: "sensor_reading" }} viewer={VIEWER} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does NOT offer hard removal for a linked Quick Log companion", () => {
    const { container } = render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary", details: { linked_grow_event_id: "event-1" } }}
        viewer={VIEWER}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does NOT render in customer/public mode", () => {
    const { container } = render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary" }}
        viewer={{ currentUserId: "user-1", isCustomerOrPublicMode: true }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does NOT render in read-only report view", () => {
    const { container } = render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary" }}
        viewer={{ currentUserId: "user-1", isReadOnlyReportView: true }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("DiaryEntryRemoveButton — confirmation + mutation", () => {
  it("opens confirmation dialog with required copy", () => {
    render(<DiaryEntryRemoveButton entry={{ id: "e1", kind: "diary" }} viewer={VIEWER} />);
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    expect(screen.getByText("Remove this log?")).toBeTruthy();
    expect(
      screen.getByText(
        /This removes the log from this plant's timeline\. Use this only when it was added to the wrong plant or strain\./,
      ),
    ).toBeTruthy();
  });

  it("photo log dialog includes photo-specific extra sentence", () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary", photoUrl: "x.jpg" }}
        viewer={VIEWER}
      />,
    );
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    expect(
      screen.getByText(/The photo log will no longer appear in this plant's timeline\./),
    ).toBeTruthy();
  });

  it("Cancel does NOT call the mutation", () => {
    render(<DiaryEntryRemoveButton entry={{ id: "e1", kind: "diary" }} viewer={VIEWER} />);
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-cancel"));
    expect(deleteFn).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("Confirm calls supabase delete once for the selected entry only", async () => {
    const onRemoved = vi.fn();
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary" }}
        viewer={VIEWER}
        onRemoved={onRemoved}
      />,
    );
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() => expect(deleteFn).toHaveBeenCalledTimes(1));
    expect(deleteEq).toHaveBeenCalledWith("id", "e1");
    expect(toastSuccess).toHaveBeenCalledWith("Log removed.");
    expect(onRemoved).toHaveBeenCalledWith("e1");
  });

  it("Confirm on photo log uses photo success toast", async () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e2", kind: "diary", photoUrl: "x.jpg" }}
        viewer={VIEWER}
      />,
    );
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Photo log removed."));
  });

  it("Error path shows generic toast and does not invoke onRemoved", async () => {
    const onRemoved = vi.fn();
    deleteMaybeSingle.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { code: "23503", message: "fk violation" } }),
    );
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e3", kind: "diary" }}
        viewer={VIEWER}
        onRemoved={onRemoved}
      />,
    );
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't remove this log. Please try again."),
    );
    expect(onRemoved).not.toHaveBeenCalled();
    // Toast never echoes raw DB details
    const args = toastError.mock.calls[0][0] as string;
    expect(args.toLowerCase()).not.toMatch(/fk|violation|23503|constraint/);
  });

  it("refuses a linked row discovered by the owner read before deleting", async () => {
    readMaybeSingle.mockImplementationOnce(() =>
      Promise.resolve({ data: { details: { grow_event_id: "event-1" } }, error: null }),
    );
    render(<DiaryEntryRemoveButton entry={{ id: "e4", kind: "diary" }} viewer={VIEWER} />);
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "This Quick Log has linked history. Use Correct or Retract in Quick Log history.",
      ),
    );
    expect(deleteFn).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("does not claim success when the owner read has no row", async () => {
    readMaybeSingle.mockImplementationOnce(() => Promise.resolve({ data: null, error: null }));
    render(<DiaryEntryRemoveButton entry={{ id: "e5", kind: "diary" }} viewer={VIEWER} />);
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't remove this log. Please try again."),
    );
    expect(deleteFn).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("does not claim success when the delete returns zero rows", async () => {
    deleteMaybeSingle.mockImplementationOnce(() => Promise.resolve({ data: null, error: null }));
    render(<DiaryEntryRemoveButton entry={{ id: "e6", kind: "diary" }} viewer={VIEWER} />);
    fireEvent.click(screen.getByTestId("diary-entry-remove-button"));
    fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't remove this log. Please try again."),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
