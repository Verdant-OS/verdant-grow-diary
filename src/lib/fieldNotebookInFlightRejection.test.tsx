import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
} from "@/components/FieldNotebook";
import { formatNotSavedLine, formatUncertainLine } from "@/lib/fieldNotebookViewModel";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  forgetNotebookMemory,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";
import { emptyDraft } from "@/lib/fieldNotebookOutcomeRules";

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
  onFindEntry: (
    tentId: string,
    knownEventId: string | null,
    idempotencyKey?: string | null,
  ) => Promise<unknown> = vi.fn().mockResolvedValue([]),
) {
  return render(
    <FieldNotebook
      tents={[tent]}
      readingsByTent={{}}
      onSave={onSave}
      onFindEntry={onFindEntry as never}
    />,
  );
}

beforeEach(() => {
  clearNotebookSession();
  adoptNotebookSessionOwner("account-a");
});

describe("a reload during Save again", () => {
  it("reads the stored draft back without the rejection flag", async () => {
    let release: (value: FieldNotebookSaveResponse) => void = () => {};
    const pending = new Promise<FieldNotebookSaveResponse>((resolve) => {
      release = resolve;
    });
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      })
      .mockImplementationOnce(() => pending);
    const view = renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    await screen.findByText(formatNotSavedLine());
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    const stored = localStorage.getItem("verdant.fieldNotebook.v1:account-a");
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('"saveAgainRejected":true');
    view.unmount();
    forgetNotebookMemory();
    adoptNotebookSessionOwner("account-a");
    renderNotebook(vi.fn());
    expect(screen.queryByText(formatNotSavedLine())).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
    expect(screen.getByText(formatUncertainLine())).toBeInTheDocument();
    release({ transport: { kind: "timeout_after_dispatch" }, reflection: NONE });
  });
});

describe("Check Timeline does not restore a rejection the resend already left", () => {
  it("keeps the timeout when the check resolves afterwards", async () => {
    let releaseCheck: (value: unknown) => void = () => {};
    const pendingCheck = new Promise((resolve) => {
      releaseCheck = resolve;
    });
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      })
      .mockResolvedValueOnce({
        transport: { kind: "timeout_after_dispatch" },
        reflection: NONE,
      });
    renderNotebook(onSave, () => pendingCheck);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    await screen.findByText(formatNotSavedLine());
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await screen.findByText(formatUncertainLine());
    releaseCheck([]);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
    expect(screen.queryByText(formatNotSavedLine())).not.toBeInTheDocument();
    expect(onSave.mock.calls[2]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
  });

  it("applies the timeout when the check resolves first", async () => {
    let releaseSave: (value: FieldNotebookSaveResponse) => void = () => {};
    const pendingSave = new Promise<FieldNotebookSaveResponse>((resolve) => {
      releaseSave = resolve;
    });
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      })
      .mockImplementationOnce(() => pendingSave);
    renderNotebook(onSave, async () => []);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    await screen.findByText(formatNotSavedLine());
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    releaseSave({ transport: { kind: "timeout_after_dispatch" }, reflection: NONE });
    await screen.findByText(formatUncertainLine());
    expect(screen.queryByText(formatNotSavedLine())).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
    expect(onSave.mock.calls[2]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
  });
});

describe("Start a new note stays on an uncertain rejection", () => {
  it("does not offer it from another phase that still carries the flag", () => {
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "check_found",
      saveAgainRejected: true,
      writeBlocked: true,
    });
    renderNotebook(vi.fn());
    expect(screen.queryByRole("button", { name: "Start a new note" })).not.toBeInTheDocument();
  });
});
