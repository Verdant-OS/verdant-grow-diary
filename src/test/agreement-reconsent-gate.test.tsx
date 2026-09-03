/**
 * AgreementReconsentGate — the blocking re-consent modal.
 *
 * The pure gap math is covered in agreementConsent.test.ts; this pins the GATE
 * behavior itself, which is security-critical:
 *   - blocks a signed-in user who is missing a current-version agreement,
 *   - does NOT block when the user is current,
 *   - is suppressed on /auth (and other read-first routes),
 *   - fails CLOSED on a read error (shows a retry/sign-out block, not access),
 *   - the verify-error block is RECOVERABLE: Retry re-runs the read, Close and
 *     Escape dismiss it without signing out, a dismissal is re-checked on the
 *     next page, and the consent form itself stays non-dismissible,
 *   - records acceptance via record_own_agreement_acceptances (auth.uid() only;
 *     no client-trusted user_id on the write path).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "@/lib/react-router-compat";
import { AgreementReconsentGate } from "@/components/AgreementReconsentGate";
import { CURRENT_AGREEMENT_LIST } from "@/constants/agreements";
import { RECORD_OWN_AGREEMENT_ACCEPTANCES_RPC } from "@/lib/agreementAcceptanceService";

const CURRENT_ROWS = CURRENT_AGREEMENT_LIST.map((a) => ({
  agreement_type: a.type,
  version: a.version,
}));

let mockAcceptances: Array<{ agreement_type: string; version: string }> = [];
let mockReadError: unknown = null;
const { eqSpy, rpcSpy, signOutSpy } = vi.hoisted(() => ({
  eqSpy: vi.fn((_column?: string, _value?: string) =>
    Promise.resolve({ data: [] as unknown[], error: null as unknown }),
  ),
  rpcSpy: vi.fn((_fn: string, _args: unknown) => Promise.resolve({ data: 2, error: null })),
  signOutSpy: vi.fn(),
}));
// STABLE reference: useAuth must return the same object (and same nested `user`)
// on every render. A fresh object literal per call would give the gate's effect a
// new `user` identity each render → unbounded re-render/re-query loop that hangs
// the file (the #188/#189 failure class). The component is also hardened to key
// on user.id, but the mock must not reintroduce the churn.
const authValue = {
  user: { id: "u1", email: "grower@example.com" },
  loading: false,
  signOut: signOutSpy,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => eqSpy(column, value),
      }),
    }),
    rpc: rpcSpy,
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => authValue,
}));

beforeEach(() => {
  mockAcceptances = [];
  mockReadError = null;
  eqSpy.mockReset();
  eqSpy.mockImplementation(() => Promise.resolve({ data: mockAcceptances, error: mockReadError }));
  rpcSpy.mockClear();
  signOutSpy.mockClear();
});

/** In-app navigation, the way a grower moves between pages (no remount). */
function GoTo({ to }: { to: string }) {
  const nav = useNavigate();
  return (
    <button type="button" onClick={() => nav(to)}>
      go {to}
    </button>
  );
}

function renderGate(pathname = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <GoTo to="/plants" />
      <AgreementReconsentGate />
    </MemoryRouter>,
  );
}

const verifyErrorDialog = () => screen.findByTestId("agreement-reconsent-verify-error");

describe("AgreementReconsentGate", () => {
  it("blocks a signed-in user with a missing/stale agreement", async () => {
    mockAcceptances = []; // no acceptances on file -> every current agreement is a gap
    renderGate();
    expect(await screen.findByTestId("agreement-reconsent-gate")).toBeInTheDocument();
  });

  it("keeps the blocking form scrollable inside a short mobile viewport", async () => {
    mockAcceptances = [];
    renderGate();

    expect(await screen.findByTestId("agreement-reconsent-gate")).toHaveClass(
      "max-h-[calc(100dvh-2rem)]",
      "overflow-y-auto",
    );
  });

  it("does not block when the user holds all current versions", async () => {
    mockAcceptances = CURRENT_ROWS;
    renderGate();
    await waitFor(() => expect(eqSpy).toHaveBeenCalled());
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull();
  });

  it("is suppressed on /auth (does not even query)", async () => {
    mockAcceptances = []; // would be a gap, but the route is suppressed
    renderGate("/auth");
    // give effects a chance to run
    await waitFor(() => expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull());
    expect(eqSpy).not.toHaveBeenCalled();
  });

  it("is suppressed on /welcome (verify-error dialog is not shown)", async () => {
    mockAcceptances = [];
    mockReadError = { message: "network blip" };
    renderGate("/welcome");
    await waitFor(() =>
      expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull(),
    );
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    expect(eqSpy).not.toHaveBeenCalled();
  });

  it("fails CLOSED on a read error: shows a retry/sign-out block, not access", async () => {
    mockReadError = { message: "network blip" };
    renderGate();
    expect(await screen.findByTestId("agreement-reconsent-verify-error")).toBeInTheDocument();
    // must NOT silently grant access, and must NOT show the accept form
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });

  it("records acceptance via auth.uid() RPC — no client-trusted user_id", async () => {
    mockAcceptances = [];
    renderGate();
    await screen.findByTestId("agreement-reconsent-gate");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /accept and continue/i }));
    await waitFor(() => expect(rpcSpy).toHaveBeenCalledTimes(1));
    const [fn, args] = rpcSpy.mock.calls[0];
    expect(fn).toBe(RECORD_OWN_AGREEMENT_ACCEPTANCES_RPC);
    expect(args).toEqual({
      p_acceptances: expect.any(Array),
    });
    const payloads = (args as { p_acceptances: unknown[] }).p_acceptances;
    expect(payloads).toHaveLength(CURRENT_AGREEMENT_LIST.length);
    for (const row of payloads) {
      expect(row).not.toHaveProperty("user_id");
      expect(row).toEqual(
        expect.objectContaining({
          agreement_type: expect.any(String),
          version: expect.any(String),
          effective_date: expect.any(String),
        }),
      );
    }
  });
});

describe("AgreementReconsentGate verify-error recovery", () => {
  it("Retry re-runs the acceptance read and clears the block once the read succeeds", async () => {
    mockReadError = { message: "network blip" };
    renderGate();
    await verifyErrorDialog();
    expect(eqSpy).toHaveBeenCalledTimes(1);

    // The transient failure clears; the grower is current.
    mockReadError = null;
    mockAcceptances = CURRENT_ROWS;
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(eqSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull(),
    );
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("a Retry that fails again stays on the block, counts the attempt, and never signs out", async () => {
    mockReadError = { message: "network blip" };
    renderGate();
    await verifyErrorDialog();
    expect(screen.queryByTestId("agreement-reconsent-verify-attempts")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(eqSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("agreement-reconsent-verify-attempts")).toHaveTextContent(
      /attempt 2/i,
    );

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(eqSpy).toHaveBeenCalledTimes(3));
    expect(await screen.findByTestId("agreement-reconsent-verify-attempts")).toHaveTextContent(
      /attempt 3/i,
    );

    expect(screen.getByTestId("agreement-reconsent-verify-error")).toBeInTheDocument();
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("Close dismisses the verify-error without signing out and without claiming consent", async () => {
    mockReadError = { message: "network blip" };
    renderGate();
    await verifyErrorDialog();

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

    await waitFor(() =>
      expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    // Dismissing is not consent: no acceptance form, no acceptance write, no sign-out.
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(signOutSpy).not.toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalledTimes(1);
  });

  it("Escape dismisses the verify-error the same way", async () => {
    mockReadError = { message: "network blip" };
    renderGate();
    await verifyErrorDialog();

    fireEvent.keyDown(screen.getByRole("button", { name: /retry/i }), {
      key: "Escape",
      code: "Escape",
    });

    await waitFor(() =>
      expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull(),
    );
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("a dismissal is re-checked on the next page: consent stays fail-closed, not bypassed", async () => {
    mockReadError = { message: "network blip" };
    renderGate();
    await verifyErrorDialog();
    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));
    await waitFor(() =>
      expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull(),
    );

    // The read works again on the next page, and finds no acceptances on file.
    mockReadError = null;
    mockAcceptances = [];
    await userEvent.click(screen.getByRole("button", { name: "go /plants" }));

    await waitFor(() => expect(eqSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("agreement-reconsent-gate")).toBeInTheDocument();
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("the consent form itself is not dismissible: Close is inert on the acceptance gate", async () => {
    mockAcceptances = [];
    renderGate();
    await screen.findByTestId("agreement-reconsent-gate");

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

    expect(screen.getByTestId("agreement-reconsent-gate")).toBeInTheDocument();
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(signOutSpy).not.toHaveBeenCalled();
  });
});
