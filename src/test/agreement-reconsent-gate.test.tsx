/**
 * AgreementReconsentGate — the blocking re-consent modal.
 *
 * The pure gap math is covered in agreementConsent.test.ts; this pins the GATE
 * behavior itself, which is security-critical:
 *   - blocks a signed-in user who is missing a current-version agreement,
 *   - does NOT block when the user is current,
 *   - is suppressed on /auth (and other read-first routes),
 *   - fails CLOSED on a read error (shows a retry/sign-out block, not access),
 *   - records acceptance append-only (ON CONFLICT DO NOTHING via ignoreDuplicates),
 *     which is the fix for the RLS-lockout bug (no UPDATE policy exists).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgreementReconsentGate } from "@/components/AgreementReconsentGate";
import { CURRENT_AGREEMENT_LIST } from "@/constants/agreements";

const CURRENT_ROWS = CURRENT_AGREEMENT_LIST.map((a) => ({
  agreement_type: a.type,
  version: a.version,
}));

let mockAcceptances: Array<{ agreement_type: string; version: string }> = [];
let mockReadError: unknown = null;
const eqSpy = vi.fn(() => Promise.resolve({ data: mockAcceptances, error: mockReadError }));
const upsertSpy = vi.fn(
  (_rows: unknown[], _opts: { onConflict: string; ignoreDuplicates?: boolean }) =>
    Promise.resolve({ error: null }),
);
const signOutSpy = vi.fn();
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
      select: () => ({ eq: eqSpy }),
      upsert: upsertSpy,
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => authValue,
}));

beforeEach(() => {
  mockAcceptances = [];
  mockReadError = null;
  eqSpy.mockClear();
  upsertSpy.mockClear();
  signOutSpy.mockClear();
});

function renderGate(pathname = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AgreementReconsentGate />
    </MemoryRouter>,
  );
}

describe("AgreementReconsentGate", () => {
  it("blocks a signed-in user with a missing/stale agreement", async () => {
    mockAcceptances = []; // no acceptances on file -> every current agreement is a gap
    renderGate();
    expect(await screen.findByTestId("agreement-reconsent-gate")).toBeInTheDocument();
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

  it("fails CLOSED on a read error: shows a retry/sign-out block, not access", async () => {
    mockReadError = { message: "network blip" };
    renderGate();
    expect(await screen.findByTestId("agreement-reconsent-verify-error")).toBeInTheDocument();
    // must NOT silently grant access, and must NOT show the accept form
    expect(screen.queryByTestId("agreement-reconsent-gate")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });

  it("records acceptance append-only (ignoreDuplicates) — the RLS-lockout fix", async () => {
    mockAcceptances = [];
    renderGate();
    await screen.findByTestId("agreement-reconsent-gate");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /accept and continue/i }));
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1));
    const [rows, opts] = upsertSpy.mock.calls[0];
    expect(Array.isArray(rows)).toBe(true);
    expect(opts.onConflict).toBe("user_id,agreement_type,version");
    expect(opts.ignoreDuplicates).toBe(true);
  });
});
