import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
} from "@/components/FieldNotebook";
import {
  applyTransport,
  definitiveRejectionProvesNoRow,
  emptyDraft,
  type NotebookDraft,
} from "@/lib/fieldNotebookOutcomeRules";
import { formatNotSavedLine, formatUncertainLine } from "@/lib/fieldNotebookViewModel";
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

const attempt = {
  attemptId: "attempt-1",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "leaves are pale",
  idempotencyKey: "same-key-0001",
};

function blockedDraft(): NotebookDraft {
  return {
    ...emptyDraft("flower"),
    note: "leaves are pale",
    phase: "uncertain",
    attempt,
    writeBlocked: true,
  };
}

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

describe("post-key-lookup rejections only", () => {
  it("does not set the flag for auth, offline, transport, timeout, or no receipt", () => {
    const blocked = blockedDraft();
    const quiet = [
      { kind: "definitive_rejection", reason: "not_authenticated" },
      { kind: "definitive_rejection", reason: "invalid_idempotency_key" },
      { kind: "definitive_rejection", reason: "target_unresolved" },
      { kind: "definitive_rejection", reason: "invalid_action" },
      { kind: "offline_before_dispatch" },
      { kind: "dispatched_no_receipt" },
      { kind: "timeout_after_dispatch" },
      { kind: "connection_lost_after_dispatch" },
      { kind: "http_error_after_dispatch", status: 500 },
    ] as const;
    for (const transport of quiet) {
      expect(applyTransport(blocked, transport, NONE).saveAgainRejected).not.toBe(true);
    }
    expect(
      applyTransport(blocked, { kind: "definitive_rejection", reason: "target_not_owned" }, NONE)
        .saveAgainRejected,
    ).toBe(true);
    expect(definitiveRejectionProvesNoRow("not_authenticated")).toBe(false);
    expect(definitiveRejectionProvesNoRow("target_not_owned")).toBe(true);
  });
});

describe("a proven rejection does not stick", () => {
  beforeEach(() => {
    clearNotebookSession();
    adoptNotebookSessionOwner("account-a");
  });

  it("hides Start a new note after a later Save again succeeds and sends nothing else", async () => {
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      })
      .mockResolvedValueOnce({
        transport: {
          kind: "acknowledged",
          entry: {
            growEventId: "event-1",
            tentId: "flower",
            tentName: "Flower Tent 2",
            note: "leaves are pale",
            occurredAt: "2026-11-10T18:00:00.000Z",
          },
        },
        reflection: {
          timelineHasEntry: true,
          countIncludesEntry: true,
          lastActivityIncludesEntry: true,
        },
      });
    renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    expect(await screen.findByText(formatNotSavedLine())).toBeInTheDocument();
    expect(screen.queryByText(formatUncertainLine())).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(3);
  });

  it("does not carry the flag into the next note or a reload", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start a new note" }));
    expect(readNotebookDraft("flower").saveAgainRejected).toBeUndefined();
    expect(readNotebookDraft("flower").phase).toBe("editing");
    first.unmount();
    renderNotebook(onSave);
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
    expect(readNotebookDraft("flower").saveAgainRejected).toBeUndefined();
  });

  it("mints a fresh key only after Start a new note and an explicit Save", async () => {
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      })
      .mockResolvedValue({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE });
    renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    await screen.findByRole("button", { name: "Start a new note" });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    expect(onSave.mock.calls[2]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
  });

  it("mints a fresh key when Start a new note is clicked while the rejection is current", async () => {
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      })
      .mockResolvedValue({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE });
    renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start a new note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    expect(onSave.mock.calls[2]?.[0].idempotencyKey).not.toBe(
      onSave.mock.calls[0]?.[0].idempotencyKey,
    );
  });
});
