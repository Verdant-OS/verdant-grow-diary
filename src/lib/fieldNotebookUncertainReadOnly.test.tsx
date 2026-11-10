import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
} from "@/components/FieldNotebook";

const NONE = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

describe("uncertain note stays read-only", () => {
  it("ignores an edit and Save again sends the shown note", async () => {
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValue({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE });
    render(
      <FieldNotebook
        tents={[
          {
            id: "flower",
            name: "Flower Tent 2",
            weekLabel: "Week 4",
            ageLabel: "28 days",
            startedLabel: "Started",
          },
        ]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={vi.fn().mockResolvedValue({ availability: "unavailable" })}
      />,
    );
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    const box = (await screen.findByLabelText("Observation")) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    fireEvent.change(box, { target: { value: "a different note" } });
    expect(box).toHaveValue("leaves are pale");
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]?.[0].note).toBe("leaves are pale");
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
  });
});
