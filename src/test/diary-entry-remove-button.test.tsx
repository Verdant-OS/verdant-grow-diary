/**
 * DiaryEntryRemoveButton — visibility, confirmation, mutation, toast tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const deleteEq = vi.fn(() => Promise.resolve({ error: null }));
const deleteFn = vi.fn(() => ({ eq: deleteEq }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => ({ delete: deleteFn })) },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import DiaryEntryRemoveButton from "@/components/DiaryEntryRemoveButton";

const VIEWER = { currentUserId: "user-1" };

beforeEach(() => {
  deleteEq.mockClear();
  deleteEq.mockImplementation(() => Promise.resolve({ error: null }));
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
      <DiaryEntryRemoveButton
        entry={{ id: "s1", kind: "sensor_reading" }}
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
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary" }}
        viewer={VIEWER}
      />,
    );
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
      screen.getByText(
        /The photo log will no longer appear in this plant's timeline\./,
      ),
    ).toBeTruthy();
  });

  it("Cancel does NOT call the mutation", () => {
    render(
      <DiaryEntryRemoveButton
        entry={{ id: "e1", kind: "diary" }}
        viewer={VIEWER}
      />,
    );
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
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Photo log removed."),
    );
  });

  it("Error path shows generic toast and does not invoke onRemoved", async () => {
    const onRemoved = vi.fn();
    deleteEq.mockImplementationOnce(() =>
      Promise.resolve({ error: { code: "23503", message: "fk violation" } }),
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
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't remove this log. Please try again.",
      ),
    );
    expect(onRemoved).not.toHaveBeenCalled();
    // Toast never echoes raw DB details
    const args = toastError.mock.calls[0][0] as string;
    expect(args.toLowerCase()).not.toMatch(/fk|violation|23503|constraint/);
  });
});
