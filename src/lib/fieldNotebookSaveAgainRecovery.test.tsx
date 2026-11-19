import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
} from "@/components/FieldNotebook";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  readNotebookDraft,
} from "@/lib/fieldNotebookSession";

const tent = {
  id: "flower",
  name: "Flower Tent 2",
  weekLabel: "Week 3",
  ageLabel: "Age: 22 days",
  startedLabel: "Jan 8, 2025",
};

const NONE = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

function notebookSave() {
  return vi.fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>();
}

function renderNotebook(
  onSave: (request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>,
) {
  return render(
    <FieldNotebook
      tents={[tent]}
      readingsByTent={{}}
      onSave={onSave}
      onFindEntry={vi.fn().mockResolvedValue({ availability: "unavailable" })}
    />,
  );
}

describe("uncertain save recovery", () => {
  beforeEach(() => {
    clearNotebookSession();
    adoptNotebookSessionOwner("account-a");
  });

  it("stays uncertain when Save again is rejected outright", async () => {
    const onSave = notebookSave()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "not_authenticated" },
        reflection: NONE,
      });
    renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");
    expect(screen.getByRole("button", { name: "Save again (won't duplicate)" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    expect(readNotebookDraft("flower").phase).toBe("uncertain");
  });
});
