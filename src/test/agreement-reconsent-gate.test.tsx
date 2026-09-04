/**
 * AgreementReconsentGate — the blocking re-consent modal.
 *
 * The pure gap math is covered in agreementConsent.test.ts; this pins the GATE
 * behavior itself, which is security-critical:
 *   - blocks a signed-in user who is missing a current-version agreement,
 *   - does NOT block when the user is current,
 *   - is suppressed on /auth and /welcome (and other read-first routes),
 *   - fails OPEN on a read error: a non-blocking banner (not a dialog) with
 *     Retry, the route underneath stays usable, nothing is granted or written,
 *     and a successful retry that then finds a real gap shows the consent form,
 *   - records acceptance via record_own_agreement_acceptances (auth.uid() only;
 *     no client-trusted user_id on the write path).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
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

function renderGate(pathname = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <button type="button" data-testid="outside-control">
        Protected route control
      </button>
      <AgreementReconsentGate />
    </MemoryRouter>,
  );
}

const verifyErrorBanner = () => screen.findByTestId("agreement-reconsent-verify-error");
/** True when Radix has hidden the route from assistive tech behind a modal. */
const routeHiddenBehindModal = () =>
  screen.getByTestId("outside-control").closest('[aria-hidden="true"]') !== null;

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

  it("is suppressed on /welcome (verify-error is not shown on marketing)", async () => {
    mockAcceptances = [];
    mockReadError = { message: "network blip" };
    renderGate("/welcome");
    await waitFor(() =>
      expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull(),
    );
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    expect(eqSpy).not.toHaveBeenCalled();
  });

  it("fails OPEN on a read error: a non-blocking banner, no consent form, no sign-out control", async () => {
    mockReadError = { message: "network blip" };
    renderGate("/grows");
    const banner = await verifyErrorBanner();
    expect(banner).toHaveAttribute("role", "status");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(routeHiddenBehindModal()).toBe(false);
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
    expect(signOutSpy).not.toHaveBeenCalled();
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
  it("Retry re-runs the acceptance read and clears the banner once the read succeeds", async () => {
    mockReadError = { message: "network blip" };
    renderGate("/grows");
    await verifyErrorBanner();
    expect(eqSpy).toHaveBeenCalledTimes(1);

    mockReadError = null;
    mockAcceptances = CURRENT_ROWS;
    await userEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    await waitFor(() => expect(eqSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull(),
    );
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("keeps the banner mounted and Retry disabled while a Retry read is in flight", async () => {
    mockReadError = { message: "network blip" };
    renderGate("/grows");
    await verifyErrorBanner();

    let settle: (value: { data: unknown[]; error: unknown }) => void = () => {};
    eqSpy.mockImplementationOnce(
      () =>
        new Promise<{ data: unknown[]; error: unknown }>((resolve) => {
          settle = resolve;
        }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^retry$/i }));
    await waitFor(() => expect(eqSpy).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId("agreement-reconsent-verify-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retrying/i })).toBeDisabled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(signOutSpy).not.toHaveBeenCalled();

    await act(async () => {
      settle({ data: CURRENT_ROWS, error: null });
    });
    await waitFor(() =>
      expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull(),
    );
  });

  it("a Retry that then finds a real gap shows the complete-agreements form, not marketing", async () => {
    mockReadError = { message: "network blip" };
    renderGate("/grows");
    await verifyErrorBanner();

    mockReadError = null;
    mockAcceptances = [];
    await userEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(await screen.findByTestId("agreement-reconsent-gate")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("agreement-reconsent-verify-error")).toBeNull();
    expect(signOutSpy).not.toHaveBeenCalled();
  });
});
