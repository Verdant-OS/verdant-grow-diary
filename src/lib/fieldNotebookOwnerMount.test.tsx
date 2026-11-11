import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
} from "@/components/FieldNotebook";
import FieldNotebookTimelineRecovery from "@/components/FieldNotebookTimelineRecovery";
import { useNotebookSessionOwner } from "@/hooks/useNotebookSessionOwner";
import { emptyDraft } from "@/lib/fieldNotebookOutcomeRules";
import {
  adoptNotebookSessionOwner,
  forgetNotebookMemory,
  notebookDrafts,
  notebookSessionOwner,
  readNotebookDraft,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";
import { formatRetractedLine } from "@/lib/fieldNotebookViewModel";
import { AuthProvider, useAuth } from "@/store/auth";

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

const privateNote = "account A private note";

function sessionFor(id: string) {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    expires_at: 4102444800,
    token_type: "bearer",
    user: { id, email: `${id}@example.com`, email_confirmed_at: "2026-07-01T00:00:00Z" },
  };
}

function privateDraft() {
  return {
    ...emptyDraft("flower"),
    note: privateNote,
    phase: "uncertain" as const,
    writeBlocked: true,
    recoverySurface: "timeline" as const,
    attempt: {
      attemptId: "attempt-a",
      idempotencyKey: "key-a",
      note: privateNote,
      tentId: "flower",
      tentName: "Flower Tent 2",
    },
  };
}

/** Same shape as AppShell's signed-out return: the owner hook stays mounted and the notebook does not. */
function OwnerAboveGate({ children }: { children?: ReactNode }) {
  useNotebookSessionOwner();
  const { user } = useAuth();
  if (!user) return null;
  return <>{children}</>;
}

async function flushAuth() {
  await act(async () => {
    await Promise.all(mocks.listeners.map((listener) => listener()));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

describe("notebook owner without a mounted surface", () => {
  beforeEach(() => {
    forgetNotebookMemory();
    window.sessionStorage.clear();
    mocks.listeners.length = 0;
    mocks.getSession.mockReset();
  });

  async function leaveAThenMountB(kind: "sign-out" | "expiry") {
    let session: ReturnType<typeof sessionFor> | null = sessionFor("user-a");
    mocks.getSession.mockImplementation(async () => ({ data: { session }, error: null }));
    const view = render(
      <AuthProvider>
        <OwnerAboveGate />
      </AuthProvider>,
    );
    await waitFor(() => expect(notebookSessionOwner()).toBe("user-a"));
    writeNotebookDraft(privateDraft());
    expect(readNotebookDraft("flower").note).toBe(privateNote);

    session = null;
    await flushAuth();
    await waitFor(() => expect(notebookSessionOwner()).toBeNull());
    expect(notebookDrafts().some((draft) => draft.note === privateNote)).toBe(false);

    session = sessionFor("user-b");
    view.rerender(
      <AuthProvider>
        <OwnerAboveGate>
          <FieldNotebook
            tents={[tent]}
            readingsByTent={{}}
            onSave={vi.fn()}
            onFindEntry={vi.fn()}
          />
          <FieldNotebookTimelineRecovery />
        </OwnerAboveGate>
      </AuthProvider>,
    );
    await flushAuth();
    await waitFor(() => expect(notebookSessionOwner()).toBe("user-b"));
    expect(screen.queryByText(privateNote)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(privateNote)).not.toBeInTheDocument();
    expect(screen.queryByText("Not sure this saved")).not.toBeInTheDocument();
    expect(kind).toBe(kind);
  }

  it("clears A's note when A signs out with no notebook mounted, then B mounts both surfaces", async () => {
    await leaveAThenMountB("sign-out");
  });

  it("clears A's note when the session expires with no notebook mounted, then B mounts both surfaces", async () => {
    await leaveAThenMountB("expiry");
  });

  it("adopts the signed-in user from Timeline recovery alone", async () => {
    adoptNotebookSessionOwner("user-a");
    writeNotebookDraft(privateDraft());
    const session: ReturnType<typeof sessionFor> | null = sessionFor("user-b");
    mocks.getSession.mockImplementation(async () => ({ data: { session }, error: null }));
    render(
      <AuthProvider>
        <FieldNotebookTimelineRecovery />
      </AuthProvider>,
    );
    await waitFor(() => expect(notebookSessionOwner()).toBe("user-b"));
    expect(screen.queryByText(privateNote)).not.toBeInTheDocument();
  });

  it("adopts the signed-in user from the notebook alone", async () => {
    adoptNotebookSessionOwner("user-a");
    writeNotebookDraft({ ...privateDraft(), recoverySurface: "grow" });
    const session: ReturnType<typeof sessionFor> | null = sessionFor("user-b");
    mocks.getSession.mockImplementation(async () => ({ data: { session }, error: null }));
    render(
      <AuthProvider>
        <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={vi.fn()} onFindEntry={vi.fn()} />
      </AuthProvider>,
    );
    await waitFor(() => expect(notebookSessionOwner()).toBe("user-b"));
    expect(screen.queryByDisplayValue(privateNote)).not.toBeInTheDocument();
  });

  it("keeps AppShell's owner hook above the signed-out return", () => {
    const source = readFileSync("src/components/AppShell.tsx", "utf8");
    const hookAt = source.indexOf("useNotebookSessionOwner()");
    const gateAt = source.indexOf('if (!user || authStatus === "unauthenticated") return null;');
    // @source-scan-justified: the early return is what unmounts the notebook; the call has to stay above it, which is not a runtime value.
    expect(hookAt).toBeGreaterThan(0);
    expect(hookAt).toBeLessThan(gateAt);
  });
});

describe("pinned save guards", () => {
  beforeEach(() => {
    forgetNotebookMemory();
    adoptNotebookSessionOwner("account-a");
  });

  it("drops a Check Timeline result when the attempt id changed and the note is not saving", async () => {
    let release: (value: unknown) => void = () => {};
    const onFindEntry = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValue({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE });
    render(
      <FieldNotebook
        tents={[tent]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={onFindEntry as never}
      />,
    );
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(
      await screen.findByRole("button", { name: "Save again (won't duplicate)" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    await waitFor(() => expect(onFindEntry).toHaveBeenCalled());
    const current = readNotebookDraft("flower");
    writeNotebookDraft({
      ...current,
      phase: "uncertain",
      attempt: current.attempt
        ? { ...current.attempt, attemptId: "attempt-replaced" }
        : current.attempt,
    });
    await act(async () => {
      release({
        availability: "authoritative",
        candidates: [entry],
        matchedEventId: entry.growEventId,
      });
    });
    expect(screen.queryByText("Yes, that's it")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save again (won't duplicate)" })).toBeEnabled();
  });

  it("drops a save reply that arrives after the draft left saving", async () => {
    const onSave = vi.fn(async () => {
      const current = readNotebookDraft("flower");
      writeNotebookDraft({ ...current, phase: "editing" });
      return {
        transport: { kind: "acknowledged" as const, entry },
        reflection: {
          timelineHasEntry: true,
          countIncludesEntry: true,
          lastActivityIncludesEntry: true,
        },
      };
    });
    render(
      <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={onSave} onFindEntry={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.queryByText(/Saved to Flower Tent 2/)).not.toBeInTheDocument();
    expect(readNotebookDraft("flower").phase).not.toBe("saved");
  });

  it("drops a write whose owner is not the stored owner", () => {
    writeNotebookDraft(privateDraft());
    const wrote = writeNotebookDraft({ ...privateDraft(), note: "account B overwrites" }, "user-b");
    expect(wrote).toBe(false);
    expect(readNotebookDraft("flower").note).toBe(privateNote);
  });

  it("hides Save again when the idempotency key was retracted", async () => {
    const onSave = vi
      .fn<(request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>>()
      .mockResolvedValue({ transport: { kind: "idempotency_retracted" }, reflection: NONE });
    render(
      <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={onSave} onFindEntry={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByText(formatRetractedLine())).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save again (won't duplicate)" }),
    ).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
