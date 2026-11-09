import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldNotebook, { type FieldNotebookSaveResponse } from "@/components/FieldNotebook";
import FieldNotebookTimelineRecovery from "@/components/FieldNotebookTimelineRecovery";
import {
  acknowledgeFound,
  applyTransport,
  draftAfterTimelineCheck,
  emptyDraft,
  maySubmit,
  type FieldNotebookServerEntry,
} from "@/lib/fieldNotebookOutcomeRules";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";

const entry: FieldNotebookServerEntry = {
  growEventId: "11111111-1111-4111-8111-111111111111",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "hello",
  occurredAt: "2025-01-08T15:24:00.000Z",
};

const paddedEntry: FieldNotebookServerEntry = { ...entry, note: "  hello  " };

const attempt = {
  attemptId: "a1",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "hello",
  idempotencyKey: "idem-1",
};

const tent = {
  id: "flower",
  name: "Flower Tent 2",
  weekLabel: "—",
  ageLabel: "—",
  startedLabel: "—",
};

const reflected: FieldNotebookSaveResponse = {
  transport: { kind: "acknowledged", entry },
  reflection: {
    timelineHasEntry: true,
    countIncludesEntry: true,
    lastActivityIncludesEntry: true,
  },
};

describe("field notebook identity follow-ups", () => {
  it("treats padding as the same receipt and blocks a second entry", () => {
    const started = {
      ...emptyDraft("flower"),
      note: "  hello",
      phase: "saving" as const,
      attempt,
    };
    const saved = applyTransport(
      started,
      { kind: "acknowledged", entry: paddedEntry },
      reflected.reflection,
    );
    expect(saved.phase).toBe("saved");
    expect(saved.completedNote).toBe("hello");
    expect(maySubmit({ ...saved, phase: "editing", note: "hello  " })).toBe(false);
    const checked = draftAfterTimelineCheck(started, "hello ", {
      status: "found",
      entry: paddedEntry,
    });
    expect(checked.phase).toBe("check_found");
    expect(acknowledgeFound({ ...started, note: " hello " }).note).toBe("");
    expect(acknowledgeFound({ ...started, note: "hello there" }).note).toBe("hello there");
  });

  it("clears an open recovery screen when the account changes directly", async () => {
    clearNotebookSession();
    adoptNotebookSessionOwner("account-a");
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "account A private note",
      phase: "check_none",
      writeBlocked: true,
      recoverySurface: "timeline",
      attempt: { ...attempt, note: "account A private note" },
    });
    render(<FieldNotebookTimelineRecovery />);
    expect(screen.getByText("account A private note")).toBeInTheDocument();
    act(() => {
      adoptNotebookSessionOwner("account-b");
    });
    expect(screen.queryByText("account A private note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("field-notebook-recovery")).not.toBeInTheDocument();
  });

  it("keeps padding on New note and saves a real edit", async () => {
    const onSave = vi.fn().mockResolvedValue(reflected);
    render(
      <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={onSave} onFindEntry={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "  hello  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByText(/Saved to Flower Tent 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New note" })).toBeEnabled();
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "hello " },
    });
    expect(screen.getByRole("button", { name: "New note" })).toBeEnabled();
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "hello again" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ note: "hello again" }));
  });
});
