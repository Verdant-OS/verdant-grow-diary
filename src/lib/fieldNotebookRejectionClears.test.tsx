import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
} from "@/components/FieldNotebook";
import {
  applyTransport,
  draftAfterTimelineCheck,
  emptyDraft,
  type NotebookDraft,
} from "@/lib/fieldNotebookOutcomeRules";
import { formatNotSavedLine, formatUncertainLine } from "@/lib/fieldNotebookViewModel";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  readNotebookDraft,
  writeNotebookDraft,
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

const entry = {
  growEventId: "event-1",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "leaves are pale",
  occurredAt: "2026-11-10T18:00:00.000Z",
};

function renderNotebook(
  onSave: (request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>,
  onFindEntry: ComponentProps<typeof FieldNotebook>["onFindEntry"] = vi.fn().mockResolvedValue([]),
) {
  return render(
    <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={onSave} onFindEntry={onFindEntry} />,
  );
}

async function rejectThenResend(third: FieldNotebookSaveResponse | Error): Promise<{
  onSave: ReturnType<typeof vi.fn>;
  unmount: () => void;
}> {
  const onSave = vi.fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>();
  onSave
    .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
    .mockResolvedValueOnce({
      transport: { kind: "definitive_rejection", reason: "target_not_owned" },
      reflection: NONE,
    });
  if (third instanceof Error) onSave.mockRejectedValueOnce(third);
  else onSave.mockResolvedValueOnce(third);
  const view = renderNotebook(onSave);
  fireEvent.change(screen.getByLabelText("Observation"), {
    target: { value: "leaves are pale" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
  fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
  await screen.findByText(formatNotSavedLine());
  fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
  return { onSave, unmount: () => view.unmount() };
}

function expectUncertainSameKey(onSave: ReturnType<typeof vi.fn>) {
  expect(screen.queryByText(formatNotSavedLine())).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
  expect(screen.getByText(formatUncertainLine())).toBeInTheDocument();
  expect(onSave.mock.calls[2]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
  expect(readNotebookDraft("flower").saveAgainRejected).not.toBe(true);
}

beforeEach(() => {
  clearNotebookSession();
  adoptNotebookSessionOwner("account-a");
});

describe("a sent Save again with no reply drops a proven rejection", () => {
  it("drops it after a timeout", async () => {
    const { onSave } = await rejectThenResend({
      transport: { kind: "timeout_after_dispatch" },
      reflection: NONE,
    });
    expectUncertainSameKey(onSave);
  });

  it("drops it after the connection is lost", async () => {
    const { onSave } = await rejectThenResend({
      transport: { kind: "connection_lost_after_dispatch" },
      reflection: NONE,
    });
    expectUncertainSameKey(onSave);
  });

  it("drops it when the reply never arrives", async () => {
    const { onSave } = await rejectThenResend({
      transport: { kind: "dispatched_no_receipt" },
      reflection: NONE,
    });
    expectUncertainSameKey(onSave);
  });

  it("drops it when the save throws", async () => {
    const { onSave } = await rejectThenResend(new Error("no reply"));
    expectUncertainSameKey(onSave);
  });

  it("does not restore the flag when the same tab reloads", async () => {
    const { onSave, unmount } = await rejectThenResend({
      transport: { kind: "timeout_after_dispatch" },
      reflection: NONE,
    });
    expectUncertainSameKey(onSave);
    unmount();
    renderNotebook(vi.fn());
    expect(screen.queryByText(formatNotSavedLine())).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
    expect(screen.getByText(formatUncertainLine())).toBeInTheDocument();
    expect(readNotebookDraft("flower").saveAgainRejected).not.toBe(true);
  });
});

describe("each way off a proven rejection clears the flag on its own", () => {
  function rejected(): NotebookDraft {
    return {
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "uncertain",
      writeBlocked: true,
      saveAgainRejected: true,
      attempt: {
        attemptId: "attempt-1",
        tentId: "flower",
        tentName: "Flower Tent 2",
        note: "leaves are pale",
        idempotencyKey: "same-key-0001",
      },
    };
  }

  it("clears the flag when the key is retracted", () => {
    const next = applyTransport(rejected(), { kind: "idempotency_retracted" }, NONE);
    expect(next.idempotencyRetracted).toBe(true);
    expect(next.saveAgainRejected).not.toBe(true);
  });

  it("clears the flag when the acknowledgement does not match", () => {
    const next = applyTransport(
      rejected(),
      { kind: "acknowledged", entry: { ...entry, note: "a different note" } },
      NONE,
    );
    expect(next.phase).toBe("uncertain");
    expect(next.saveAgainRejected).not.toBe(true);
  });

  it("clears the flag when the server acked but Timeline does not show it yet", () => {
    const next = applyTransport(rejected(), { kind: "acknowledged", entry }, NONE);
    expect(next.phase).toBe("uncertain");
    expect(next.knownEventId).toBe("event-1");
    expect(next.saveAgainRejected).not.toBe(true);
  });

  it("clears the flag when Timeline finds the row", () => {
    const next = draftAfterTimelineCheck(
      { ...rejected(), knownEventId: "event-1" },
      "leaves are pale",
      { status: "found", entry },
    );
    expect(next.phase).toBe("check_found");
    expect(next.saveAgainRejected).not.toBe(true);
  });

  it("shows the found row after a rejection when Timeline has it", async () => {
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      });
    renderNotebook(onSave, async () => ({
      availability: "authoritative" as const,
      candidates: [entry],
      matchedEventId: entry.growEventId,
    }));
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    await screen.findByText(formatNotSavedLine());
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    expect(await screen.findByRole("button", { name: "Yes, that's it" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
    expect(readNotebookDraft("flower").saveAgainRejected).not.toBe(true);
  });

  it("clears the flag when a new save starts from a rejected draft", async () => {
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "editing",
      saveAgainRejected: true,
    });
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValue({
        transport: { kind: "offline_before_dispatch" },
        reflection: NONE,
      });
    renderNotebook(onSave);
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    await screen.findByText("Couldn't save. Your note is still here.");
    expect(readNotebookDraft("flower").saveAgainRejected).not.toBe(true);
  });
});
