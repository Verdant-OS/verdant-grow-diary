import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
} from "@/components/FieldNotebook";
import { clearPrivateClientStateBeforeAuthIdentityChange } from "@/lib/authIdentityTransitionFence";
import { emptyDraft } from "@/lib/fieldNotebookOutcomeRules";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  forgetNotebookMemory,
  readNotebookDraft,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";
import { AUTH_LAST_RESOLVED_IDENTITY_STORAGE_KEY, AuthProvider, useAuth } from "@/store/auth";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  listeners: [] as Array<(event: string, session: unknown) => void | Promise<void>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      getUser: (...args: unknown[]) => mocks.getUser(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
      onAuthStateChange: (listener: (event: string, session: unknown) => void | Promise<void>) => {
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

const attempt = {
  attemptId: "attempt-1",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "leaves are pale",
  idempotencyKey: "same-key",
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
) {
  return render(
    <FieldNotebook
      tents={[tent]}
      readingsByTent={{}}
      onSave={onSave}
      onFindEntry={vi.fn().mockResolvedValue({ availability: "unavailable" })}
    />,
  );
}

describe("uncertain save recovery", () => {
  beforeEach(() => {
    clearNotebookSession();
    adoptNotebookSessionOwner("account-a");
    mocks.listeners.length = 0;
    mocks.getSession.mockReset();
    mocks.signOut.mockReset();
  });

  it("stays uncertain when Save again is rejected outright", async () => {
    const onSave = notebookSave()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({
        transport: { kind: "definitive_rejection", reason: "not_authenticated" },
        reflection: NONE,
      });
    renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");
    expect(screen.getByRole("button", { name: "Save again (won't duplicate)" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).toBe(onSave.mock.calls[0]?.[0].idempotencyKey);
    expect(readNotebookDraft("flower").phase).toBe("uncertain");
  });

  it("offers a new note when the same key was retracted and does not replace that key", async () => {
    const onSave = notebookSave()
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE })
      .mockResolvedValueOnce({ transport: { kind: "idempotency_retracted" }, reflection: NONE })
      .mockResolvedValueOnce({ transport: { kind: "dispatched_no_receipt" }, reflection: NONE });
    renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save again (won't duplicate)" }));
    expect(
      await screen.findByText(
        "This note was removed from Timeline. It stays here so you can copy it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save again (won't duplicate)" })).toBeNull();
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");
    expect(screen.getByLabelText("Observation")).toHaveAttribute("readonly");
    const originalKey = onSave.mock.calls[0]?.[0].idempotencyKey as string;
    expect(readNotebookDraft("flower").attempt?.idempotencyKey).toBe(originalKey);
    fireEvent.click(screen.getByRole("button", { name: "Start a new note" }));
    expect(readNotebookDraft("flower").attempt).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    expect(onSave.mock.calls[2]?.[0].idempotencyKey).not.toBe(originalKey);
    expect(onSave.mock.calls[2]?.[0].note).toBe("leaves are pale");
  });

  it("keeps going when storage throws during Save", async () => {
    const onSave = notebookSave().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt" },
      reflection: NONE,
    });
    renderNotebook(onSave);
    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "leaves are pale" },
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(
      await screen.findByRole("button", { name: "Save again (won't duplicate)" }),
    ).toBeEnabled();
    expect(screen.queryByText("Saving...")).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("does not throw when reading localStorage is blocked", () => {
    const real = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      forgetNotebookMemory();
      expect(() => adoptNotebookSessionOwner("account-a")).not.toThrow();
      expect(() =>
        writeNotebookDraft({
          ...emptyDraft("flower"),
          note: "leaves are pale",
          phase: "uncertain",
          writeBlocked: true,
          attempt,
        }),
      ).not.toThrow();
      expect(() => adoptNotebookSessionOwner(null, "account-a")).not.toThrow();
    } finally {
      if (real) Object.defineProperty(window, "localStorage", real);
    }
  });
});

describe("same-tab auth restore", () => {
  beforeEach(() => {
    clearNotebookSession();
    forgetNotebookMemory();
    window.sessionStorage.clear();
    mocks.listeners.length = 0;
    mocks.getSession.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockImplementation(async () => {
      mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
      for (const listener of [...mocks.listeners]) await listener("SIGNED_OUT", null);
      return { error: null };
    });
  });

  it("restores the stored note through AuthProvider and clears it on sign-out", async () => {
    window.sessionStorage.setItem(AUTH_LAST_RESOLVED_IDENTITY_STORAGE_KEY, "user-a");
    window.localStorage.setItem(
      "verdant.fieldNotebook.v1:user-a",
      JSON.stringify([
        {
          ...emptyDraft("flower"),
          note: "leaves are pale",
          phase: "uncertain",
          writeBlocked: true,
          attempt,
        },
      ]),
    );
    forgetNotebookMemory();
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("user-a") }, error: null });

    function SignOut() {
      const { signOut } = useAuth();
      return (
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      );
    }

    render(
      <AuthProvider
        onBeforeAuthIdentityChange={(previous, next) =>
          clearPrivateClientStateBeforeAuthIdentityChange({ clear: () => {} }, next, previous)
        }
      >
        <FieldNotebook
          tents={[tent]}
          readingsByTent={{}}
          onSave={notebookSave()}
          onFindEntry={vi.fn()}
        />
        <SignOut />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Save again (won't duplicate)" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Check Timeline" })).toBeEnabled();
    expect(screen.getByLabelText("Observation")).toHaveValue("leaves are pale");
    expect(screen.queryByText("Saving...")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(window.localStorage.getItem("verdant.fieldNotebook.v1:user-a")).toBeNull(),
    );
  });
});
