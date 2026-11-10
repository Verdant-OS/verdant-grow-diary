import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldNotebook from "@/components/FieldNotebook";
import {
  applyTransport,
  draftAfterTimelineCheck,
  emptyDraft,
  mayRetry,
  type FieldNotebookAttempt,
} from "@/lib/fieldNotebookOutcomeRules";
import { clearNotebookSession } from "@/lib/fieldNotebookSession";

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

describe("uncertain save with no event id", () => {
  it("keeps Check Timeline, keeps the note, and lets Save send the same attempt", async () => {
    clearNotebookSession();
    const attempt: FieldNotebookAttempt = {
      attemptId: "attempt-1",
      tentId: "flower",
      tentName: "Flower Tent 2",
      note: "maybe saved",
      idempotencyKey: "idem-1",
    };
    const uncertain = applyTransport(
      { ...emptyDraft("flower"), note: "maybe saved", phase: "saving", attempt },
      { kind: "dispatched_no_receipt" },
      pending,
    );
    const checked = draftAfterTimelineCheck(uncertain, "maybe saved", { status: "none" });
    expect(checked.note).toBe("maybe saved");
    expect(checked.phase).toBe("uncertain");
    expect(checked.writeBlocked).toBe(true);
    expect(mayRetry(checked)).toBe(false);

    const onSave = vi
      .fn()
      .mockResolvedValueOnce({
        transport: { kind: "dispatched_no_receipt" },
        reflection: pending,
      })
      .mockResolvedValueOnce({
        transport: {
          kind: "acknowledged",
          entry: {
            growEventId: "11111111-1111-4111-8111-111111111111",
            tentId: "flower",
            tentName: "Flower Tent 2",
            note: "maybe saved",
            occurredAt: "2025-01-08T15:24:00.000Z",
          },
        },
        reflection: {
          timelineHasEntry: true,
          countIncludesEntry: true,
          lastActivityIncludesEntry: true,
        },
      });
    render(
      <FieldNotebook
        tents={[tent]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={vi.fn().mockResolvedValue([])}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "maybe saved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Check Timeline" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add what you observed.")).toHaveValue("maybe saved");
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("offers Retry for a confirmed failure and not Check Timeline", async () => {
    clearNotebookSession();
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "definitive_rejection" },
      reflection: pending,
    });
    render(
      <FieldNotebook
        tents={[tent]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={vi.fn().mockResolvedValue([])}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "still here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check Timeline" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add what you observed.")).toHaveValue("still here");
  });
});
