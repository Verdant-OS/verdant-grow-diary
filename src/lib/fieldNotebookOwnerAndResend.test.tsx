import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
} from "@/components/FieldNotebook";
import FieldNotebookTimelineRecovery from "@/components/FieldNotebookTimelineRecovery";
import { applyTransport, emptyDraft } from "@/lib/fieldNotebookOutcomeRules";
import {
  forgetNotebookMemory,
  notebookDrafts,
  notebookSessionOwner,
  readNotebookDraft,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";
import { formatSaveAgainSendsOriginal } from "@/lib/fieldNotebookViewModel";
import { AuthProvider } from "@/store/auth";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  listeners: [] as Array<() => void | Promise<void>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      getUser: (...args: unknown[]) => mocks.getUser(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
      onAuthStateChange: (listener: () => void | Promise<void>) => {
        mocks.listeners.push(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                const index = mocks.listeners.indexOf(listener);
                if (index >= 0) mocks.listeners.splice(index, 1);
              },
            },
          },
        };
      },
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

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

const entry = {
  growEventId: "11111111-1111-4111-8111-111111111111",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "leaves are pale",
  occurredAt: "2025-01-08T15:24:00.000Z",
};

function sessionFor(id: string) {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    expires_at: 4102444800,
    token_type: "bearer",
    user: { id, email: `${id}@example.com`, email_confirmed_at: "2026-07-01T00:00:00Z" },
  };
}

function notebookSave() {
  return vi.fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>();
}

function renderNotebook(
  onSave: (request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>,
  onFindEntry: (
    tentId: string,
    knownEventId: string | null,
    idempotencyKey?: string | null,
  ) => Promise<unknown> = vi.fn().mockResolvedValue({ availability: "unavailable" }),
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

async function saveUntilUncertain(
  onSave: ReturnType<typeof notebookSave>,
  note = "leaves are pale",
) {
  fireEvent.change(screen.getByLabelText("Observation"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
  expect(await screen.findByRole("button", { name: "Save again (won't duplicate)" })).toBeEnabled();
  expect(onSave).toHaveBeenCalledTimes(1);
}

describe("notebook owner follows the signed-in user", () => {
  beforeEach(() => {
    forgetNotebookMemory();
    window.sessionStorage.clear();
    mocks.listeners.length = 0;
    mocks.getSession.mockReset();
    mocks.signOut.mockReset();
  });

  it("keeps account A's note off account B's Timeline recovery", async () => {
    let session: ReturnType<typeof sessionFor> | null = sessionFor("user-a");
    mocks.getSession.mockImplementation(async () => ({ data: { session }, error: null }));

    const onSave = notebookSave().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt" },
      reflection: NONE,
    });

    render(
      <AuthProvider>
        <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={onSave} onFindEntry={vi.fn()} />
        <FieldNotebookTimelineRecovery />
      </AuthProvider>,
    );

    await waitFor(() => expect(notebookSessionOwner()).toBe("user-a"));
    await saveUntilUncertain(onSave);
    expect(readNotebookDraft("flower").note).toBe("leaves are pale");
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");

    session = null;
    await act(async () => {
      await Promise.all(mocks.listeners.map((listener) => listener()));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await waitFor(() => expect(notebookSessionOwner()).toBeNull());
    expect(screen.queryByDisplayValue("leaves are pale")).not.toBeInTheDocument();
    expect(notebookDrafts().some((draft) => draft.note.includes("leaves are pale"))).toBe(false);

    session = sessionFor("user-b");
    await act(async () => {
      await Promise.all(mocks.listeners.map((listener) => listener()));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await waitFor(() => expect(notebookSessionOwner()).toBe("user-b"));
    expect(screen.queryByText("leaves are pale")).not.toBeInTheDocument();
    expect(readNotebookDraft("flower").note).toBe("");
    expect(readNotebookDraft("flower").attempt).toBeNull();
  });
});

describe("Save again after an uncertain send", () => {
  beforeEach(() => {
    forgetNotebookMemory();
  });

  it("stays uncertain when Save again is offline and keeps the same key", async () => {
    const onSave = notebookSave()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({ transport: { kind: "offline_before_dispatch" }, reflection: NONE });
    renderNotebook(onSave);
    await saveUntilUncertain(onSave);
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Save again (won't duplicate)" })).toBeEnabled();
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    expect(onSave.mock.calls[1]?.[0].note).toBe("leaves are pale");
    expect(readNotebookDraft("flower").phase).toBe("uncertain");
  });

  it("sends the original note when the box was edited", async () => {
    const onSave = notebookSave()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE });
    renderNotebook(onSave);
    await saveUntilUncertain(onSave);
    expect(screen.getByText(formatSaveAgainSendsOriginal())).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale — edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]?.[0].note).toBe("leaves are pale");
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale — edited");
    expect(screen.queryByText(/Saved to/)).toBeNull();
  });

  it("shows a clear failure when Save again is rejected as target_not_owned", async () => {
    const onSave = notebookSave()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "target_not_owned" },
        reflection: NONE,
      });
    renderNotebook(onSave);
    await saveUntilUncertain(onSave);
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Save again (won't duplicate)" })).toBeNull();
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");
  });

  it("drops a stale save reply that arrives after the attempt changed", async () => {
    const onSave = notebookSave().mockImplementation(async () => {
      const current = readNotebookDraft("flower");
      writeNotebookDraft({
        ...current,
        phase: "uncertain",
        writeBlocked: true,
        attempt: current.attempt
          ? { ...current.attempt, attemptId: "replaced-attempt" }
          : current.attempt,
      });
      return {
        transport: {
          kind: "acknowledged" as const,
          entry: { ...entry, note: current.attempt?.note ?? entry.note },
        },
        reflection: {
          timelineHasEntry: true,
          countIncludesEntry: true,
          lastActivityIncludesEntry: true,
        },
      };
    });
    renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Saved to/)).toBeNull();
    expect(readNotebookDraft("flower").phase).not.toBe("saved");
    expect(readNotebookDraft("flower").attempt?.attemptId).toBe("replaced-attempt");
  });

  it("keeps the note when Check Timeline returns during Save again", async () => {
    let finishFind: (value: unknown) => void = () => {};
    const findPending = new Promise((resolve) => {
      finishFind = resolve;
    });
    let finishSave: (value: FieldNotebookSaveResponse) => void = () => {};
    const onSave = notebookSave()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSave = resolve;
          }),
      );
    renderNotebook(onSave, () => findPending as Promise<{ availability: "unavailable" }>);
    await saveUntilUncertain(onSave);
    const key = onSave.mock.calls[0]?.[0].idempotencyKey;
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Save again (won't duplicate)" }));
    await act(async () => {
      finishFind({
        availability: "authoritative",
        candidates: [entry],
        matchedEventId: entry.growEventId,
      });
    });
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Yes, that's it" })).toBeNull();
    finishSave({ transport: { kind: "offline_before_dispatch" }, reflection: NONE });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(key);
    expect(onSave.mock.calls[1]?.[0].note).toBe("leaves are pale");
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");
    expect(screen.getByRole("button", { name: "Save again (won't duplicate)" })).toBeEnabled();
  });

  it("returns to the note from a Timeline match without clearing the text", async () => {
    const onSave = notebookSave().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt" },
      reflection: NONE,
    });
    renderNotebook(
      onSave,
      vi.fn().mockResolvedValue({
        availability: "authoritative",
        candidates: [entry],
        matchedEventId: entry.growEventId,
      }),
    );
    await saveUntilUncertain(onSave);
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back to note" }));
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");
    expect(screen.getByRole("button", { name: "Save again (won't duplicate)" })).toBeEnabled();
  });
});

describe("proving rejection on a resend", () => {
  it("clears to a failure only when the rejection proves no row", () => {
    const draft = {
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "uncertain" as const,
      writeBlocked: true,
      attempt: {
        attemptId: "a1",
        tentId: "flower",
        tentName: "Flower Tent 2",
        note: "leaves are pale",
        idempotencyKey: "same-key",
      },
    };
    const owned = applyTransport(
      draft,
      { kind: "definitive_rejection", reason: "target_not_owned" },
      NONE,
    );
    expect(owned.phase).toBe("clear_failure");
    expect(owned.attempt?.idempotencyKey).toBe("same-key");
    const offline = applyTransport(draft, { kind: "offline_before_dispatch" }, NONE);
    expect(offline.phase).toBe("uncertain");
    expect(offline.writeBlocked).toBe(true);
    expect(offline.attempt?.idempotencyKey).toBe("same-key");
  });
});
