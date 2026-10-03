import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

const { from, toastError } = vi.hoisted(() => ({
  from: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/components/DiaryStressObservationsSection", () => ({
  default: () => null,
}));

import EntryEditDialog from "@/components/EntryEditDialog";

beforeEach(() => {
  from.mockReset();
  toastError.mockReset();
});

describe("linked Quick Log diary editor", () => {
  it("does not directly update or delete a linked companion", () => {
    const onOpenChange = vi.fn();
    render(
      <EntryEditDialog
        entry={{
          id: "diary-1",
          note: "Saved note",
          photo_url: null,
          stage: "veg",
          details: { linked_grow_event_id: "event-1" },
          entry_at: "2026-09-27T00:00:00.000Z",
        }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(from).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenCalledWith(
      "This Quick Log has linked history. Use Correct or Retract in Quick Log history.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not claim an ordinary edit succeeded when the database updates no row", async () => {
    const onSaved = vi.fn();
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const eq = vi.fn(() => ({ select: () => ({ maybeSingle }) }));
    from.mockReturnValue({ update: () => ({ eq }) });
    render(
      <EntryEditDialog
        entry={{
          id: "diary-2",
          note: "Saved note",
          photo_url: null,
          stage: "veg",
          details: {},
          entry_at: "2026-09-27T00:00:00.000Z",
        }}
        open
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't update this entry. Please try again."),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not claim an ordinary deletion succeeded when the database deletes no row", async () => {
    const onDeleted = vi.fn();
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const eq = vi.fn(() => ({ select: () => ({ maybeSingle }) }));
    from.mockReturnValue({ delete: () => ({ eq }) });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    try {
      render(
        <EntryEditDialog
          entry={{
            id: "diary-3",
            note: "Saved note",
            photo_url: null,
            stage: "veg",
            details: {},
            entry_at: "2026-09-27T00:00:00.000Z",
          }}
          open
          onOpenChange={vi.fn()}
          onDeleted={onDeleted}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith("Couldn't delete this entry. Please try again."),
      );
      expect(onDeleted).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
