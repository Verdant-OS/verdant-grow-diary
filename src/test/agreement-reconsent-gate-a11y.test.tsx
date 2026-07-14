/**
 * AgreementReconsentGate — accessibility hardening slice.
 *
 * Covers: dialog naming, enabled Accept button, alert announcement, aria
 * state on the checkbox, focus repair after failed submit, label wiring,
 * error clearing, focus trap, Escape suppression, outside-interaction
 * suppression, and the successful single-submission path.
 *
 * Safety: no schema/RLS/edge/auth changes. Supabase client is mocked so
 * no real reads/writes occur.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgreementReconsentGate } from "@/components/AgreementReconsentGate";

const upsertSpy = vi.fn();
const signOutSpy = vi.fn();

// user_agreement_acceptances: return no acceptances -> gate opens.
function makeChain() {
  const result = { data: [] as unknown[], error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => Promise.resolve(result),
    upsert: (...args: unknown[]) => {
      upsertSpy(...args);
      return Promise.resolve({ data: null, error: null });
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => makeChain() },
}));

const MOCK_USER = { id: "u1", email: "grower@example.com" };
const MOCK_AUTH = {
  user: MOCK_USER,
  session: null,
  loading: false,
  signOut: signOutSpy,
};
vi.mock("@/store/auth", () => ({
  useAuth: () => MOCK_AUTH,
}));

async function renderGate() {
  const utils = render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <button data-testid="outside-control" type="button">Outside</button>
      <AgreementReconsentGate />
    </MemoryRouter>,
  );
  const dialog = await screen.findByRole("dialog");
  return { ...utils, dialog };
}

function getDialogFocusables(dialog: HTMLElement): HTMLElement[] {
  const sel =
    'button:not([disabled]), [role="checkbox"]:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  return Array.from(dialog.querySelectorAll<HTMLElement>(sel)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0 || el.tagName === "BUTTON" || el.getAttribute("role") === "checkbox" || el.tagName === "A",
  );
}

beforeEach(() => {
  upsertSpy.mockClear();
  signOutSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("AgreementReconsentGate accessibility", () => {
  it("renders a dialog with accessible name and description wired by aria attrs", async () => {
    const { dialog } = await renderGate();

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName();

    const labelledBy = dialog.getAttribute("aria-labelledby");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(document.querySelectorAll(`#${labelledBy}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${describedBy}`)).toHaveLength(1);
  });

  it("keeps Accept enabled while the consent box is unchecked, and it is keyboard-reachable", async () => {
    await renderGate();
    const accept = screen.getByRole("button", { name: /accept and continue/i });
    expect(accept).not.toBeDisabled();
    expect(accept.getAttribute("aria-disabled")).toBe("true");
    accept.focus();
    expect(document.activeElement).toBe(accept);
  });

  it("surfaces exactly one assertive alert and toggles aria-invalid when submitting unchecked", async () => {
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveAttribute("aria-required", "true");
    expect(checkbox).not.toHaveAttribute("aria-invalid", "true");

    fireEvent.click(screen.getByRole("button", { name: /accept and continue/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    const alert = alerts[0];
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert.textContent ?? "").toMatch(/agree|tick|accept/i);
    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    expect(checkbox).toHaveAttribute("aria-required", "true");
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("moves focus to the checkbox after a failed submission and does not duplicate the alert on repeat", async () => {
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    const accept = screen.getByRole("button", { name: /accept and continue/i });

    fireEvent.click(accept);
    await waitFor(() => expect(document.activeElement).toBe(checkbox));

    fireEvent.click(accept);
    await waitFor(() => expect(document.activeElement).toBe(checkbox));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("wires the visible label to the checkbox by matching htmlFor/id and keeps a valid accessible name", async () => {
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    const id = checkbox.getAttribute("id");
    expect(id).toBeTruthy();
    const label = document.querySelector(`label[for="${id}"]`);
    expect(label).not.toBeNull();
    expect(checkbox).toHaveAccessibleName();
  });

  it("clears the validation error and lets acceptance proceed exactly once when the box is then checked", async () => {
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    const accept = screen.getByRole("button", { name: /accept and continue/i });

    fireEvent.click(accept);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(checkbox).not.toHaveAttribute("aria-invalid", "true");
    expect(checkbox).toHaveAttribute("aria-required", "true");

    fireEvent.click(accept);
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1));
  });

  it("keeps keyboard focus inside the dialog when tabbing forward and backward (bounded)", async () => {
    const user = userEvent.setup();
    const { dialog } = await renderGate();

    const focusables = getDialogFocusables(dialog);
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Forward wrap: focus last, one Tab — must stay inside the dialog.
    last.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByTestId("outside-control")).not.toHaveFocus();

    // Backward wrap: focus first, one Shift+Tab — must stay inside the dialog.
    first.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByTestId("outside-control")).not.toHaveFocus();
  });

  it("suppresses Escape: dialog stays open, no acceptance callback runs, focus stays inside", async () => {
    const { dialog } = await renderGate();
    const checkbox = screen.getByRole("checkbox") as HTMLElement;
    checkbox.focus();

    fireEvent.keyDown(checkbox, { key: "Escape", code: "Escape" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(signOutSpy).not.toHaveBeenCalled();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("suppresses outside pointer interaction: dialog stays open and no consent is recorded", async () => {
    await renderGate();

    const outside = screen.getByTestId("outside-control");
    // Radix intercepts pointerdown/mousedown outside via DismissableLayer;
    // preventDefault in onPointerDownOutside/onInteractOutside keeps the gate open.
    fireEvent.pointerDown(outside);
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(signOutSpy).not.toHaveBeenCalled();
    // Protected content remains — checkbox still there, still required.
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-required", "true");
  });

  it("successful path: checking the box and clicking Accept calls persistence exactly once with no alert", async () => {
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    const accept = screen.getByRole("button", { name: /accept and continue/i });

    fireEvent.click(checkbox);
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(accept);
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1));

    const [rows] = upsertSpy.mock.calls[0] as [Array<{ user_id: string; agreement_type: string; version: string }>];
    expect(rows.every((r) => r.user_id === "u1")).toBe(true);
    expect(rows.map((r) => r.agreement_type).sort()).toEqual(["privacy", "terms"]);
  });
});
