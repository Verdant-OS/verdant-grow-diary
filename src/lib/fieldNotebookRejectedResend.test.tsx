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

const NONE = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

const tent = {
  id: "flower",
  name: "Flower Tent 2",
  weekLabel: "Week 4",
  ageLabel: "28 days",
  startedLabel: "Started",
};

function renderNotebook(
  onSave: (request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>,
) {
  return render(
    <FieldNotebook
      tents={[tent]}
      readingsByTent={{}}
      onSave={onSave}
      onFindEntry={vi.fn().mockResolvedValue([])}
    />,
  );
}

describe("a definitive Save again rejection can start a new note", () => {
  beforeEach(() => {
    clearNotebookSession();
    adoptNotebookSessionOwner("account-a");
  });

  it("keeps Start a new note after three target_not_owned replies, a Timeline check, and a reload", async () => {
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValue({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      });
    const first = renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    const again = await screen.findByRole("button", { name: "Save again (won't duplicate)" });
    fireEvent.click(again);
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(4));
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    expect(onSave.mock.calls[3]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    expect(await screen.findByRole("button", { name: "Start a new note" })).toBeInTheDocument();
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");
    first.unmount();
    renderNotebook(onSave);
    const box = (await screen.findByLabelText("Observation")) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box).toHaveValue("leaves are pale");
    fireEvent.click(screen.getByRole("button", { name: "Start a new note" }));
    expect(box.readOnly).toBe(false);
    fireEvent.change(box, { target: { value: "a fresh note" } });
    expect(box).toHaveValue("a fresh note");
    expect(readNotebookDraft("flower").attempt).toBeNull();
    expect(readNotebookDraft("flower").saveAgainRejected).toBeUndefined();
  });
});
