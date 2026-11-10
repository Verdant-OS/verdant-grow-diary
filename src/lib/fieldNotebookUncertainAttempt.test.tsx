import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import FieldNotebook from "@/components/FieldNotebook";
import { clearNotebookSession, readNotebookDraft } from "@/lib/fieldNotebookSession";

const pending = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

const tent = {
  id: "flower",
  name: "Flower Tent 2",
  weekLabel: "Week 3",
  ageLabel: "Age: 22 days",
  startedLabel: "Jan 8, 2025",
};

const entryA = {
  growEventId: "11111111-1111-4111-8111-111111111111",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "observation A",
  occurredAt: "2025-01-08T15:24:00.000Z",
};

function renderNotebook(onSave: unknown, onFindEntry: unknown) {
  return render(
    <FieldNotebook
      tents={[tent]}
      readingsByTent={{}}
      onSave={onSave as ComponentProps<typeof FieldNotebook>["onSave"]}
      onFindEntry={onFindEntry as ComponentProps<typeof FieldNotebook>["onFindEntry"]}
    />,
  );
}

describe("uncertain save keeps the submitted attempt fixed", () => {
  it("keeps the attempt after a lost receipt and a padding edit, with no second write", async () => {
    clearNotebookSession();
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt" },
      reflection: pending,
    });
    renderNotebook(onSave, vi.fn().mockResolvedValue([]));
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "observation A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    const before = readNotebookDraft("flower");
    const box = screen.getByPlaceholderText("Add what you observed.") as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    fireEvent.change(box, {
      target: { value: "  observation A  " },
    });
    const after = readNotebookDraft("flower");
    expect(after.phase).toBe("uncertain");
    expect(after.writeBlocked).toBe(true);
    expect(after.attempt).toEqual(before.attempt);
    expect(after.note).toBe("observation A");
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].attemptId).toBe(before.attempt?.attemptId);
    expect(onSave.mock.calls[0][0].idempotencyKey).toBe(before.attempt?.idempotencyKey);
    expect(onSave.mock.calls[0][0].note).toBe("observation A");
  });

  it("keeps newer text B while a Timeline check confirms submitted A", async () => {
    clearNotebookSession();
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "acknowledged", entry: entryA },
      reflection: pending,
    });
    renderNotebook(onSave, vi.fn().mockResolvedValue([entryA]));
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "observation A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    await screen.findByRole("button", { name: "Check Timeline" });
    const box = screen.getByPlaceholderText("Add what you observed.") as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    fireEvent.change(box, {
      target: { value: "observation B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    expect(await screen.findByText("Entry found")).toBeInTheDocument();
    expect(readNotebookDraft("flower").note).toBe("observation A");
    expect(readNotebookDraft("flower").verifiedEntry?.note).toBe("observation A");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("stays blocked when the Timeline lookup fails", async () => {
    clearNotebookSession();
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "timeout_after_dispatch" },
      reflection: pending,
    });
    renderNotebook(onSave, vi.fn().mockRejectedValue(new Error("lookup down")));
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "observation A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    await waitFor(() => expect(readNotebookDraft("flower").phase).toBe("uncertain"));
    expect(readNotebookDraft("flower").writeBlocked).toBe(true);
    expect(screen.getByRole("button", { name: "Check Timeline" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saving..." })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps B in the editor after the grower confirms A", async () => {
    clearNotebookSession();
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "acknowledged", entry: entryA },
      reflection: pending,
    });
    renderNotebook(onSave, vi.fn().mockResolvedValue([entryA]));
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "observation A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    await screen.findByRole("button", { name: "Check Timeline" });
    const box = screen.getByPlaceholderText("Add what you observed.") as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    fireEvent.change(box, {
      target: { value: "observation B" },
    });
    expect(box).toHaveValue("observation A");
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, that's it" }));
    expect(screen.getByPlaceholderText("Add what you observed.")).toHaveValue("");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Saving..." })).not.toBeInTheDocument();
  });

  it("sends one write for repeated clicks, then settles a late response after remount", async () => {
    clearNotebookSession();
    let finish: (value: unknown) => void = () => {};
    const onSave = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const props = {
      tents: [tent],
      readingsByTent: {},
      onSave,
      onFindEntry: vi.fn().mockResolvedValue([]),
    };
    const first = render(<FieldNotebook {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "observation A" },
    });
    const save = screen.getByRole("button", { name: "Save to Flower Tent 2" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
    const submitted = onSave.mock.calls[0][0];
    first.unmount();
    render(<FieldNotebook {...props} />);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    finish({
      transport: {
        kind: "acknowledged",
        entry: entryA,
      },
      reflection: {
        timelineHasEntry: true,
        countIncludesEntry: true,
        lastActivityIncludesEntry: true,
      },
    });
    expect(await screen.findByText(/Saved to Flower Tent 2/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saving..." })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].attemptId).toBe(submitted.attemptId);
    expect(onSave.mock.calls[0][0].idempotencyKey).toBe(submitted.idempotencyKey);
    expect(readNotebookDraft("flower").note).toBe("observation A");
  });
});
