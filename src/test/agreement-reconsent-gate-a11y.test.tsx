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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "grower@example.com" },
    session: null,
    loading: false,
    signOut: signOutSpy,
  }),
}));

async function renderGate() {
  const utils = render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AgreementReconsentGate />
    </MemoryRouter>,
  );
  // Wait for the async gap check to resolve and the dialog to render.
  const dialog = await screen.findByRole("dialog");
  return { ...utils, dialog };
}

beforeEach(() => {
  upsertSpy.mockClear();
  signOutSpy.mockClear();
});

describe("AgreementReconsentGate accessibility", () => {
  it("renders a dialog with accessible name and description wired by aria attrs", async () => {
    const { dialog } = await renderGate();

    // Discoverable by role and has an accessible name.
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName();

    // aria-labelledby / aria-describedby point to unique existing elements.
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
    expect(accept.getAttribute("aria-disabled")).toBe("true"); // signalled to AT, not disabled
    accept.focus();
    expect(document.activeElement).toBe(accept);
  });

  it("surfaces exactly one assertive alert and toggles aria-invalid when submitting unchecked", async () => {
    const user = userEvent.setup();
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveAttribute("aria-required", "true");
    expect(checkbox).not.toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: /accept and continue/i }));

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
    const user = userEvent.setup();
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    const accept = screen.getByRole("button", { name: /accept and continue/i });

    await user.click(accept);
    await waitFor(() => expect(document.activeElement).toBe(checkbox));

    await user.click(accept);
    await waitFor(() => expect(document.activeElement).toBe(checkbox));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("wires the visible label to the checkbox by id and toggles when the label is clicked", async () => {
    const user = userEvent.setup();
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    const id = checkbox.getAttribute("id");
    expect(id).toBeTruthy();
    const label = document.querySelector(`label[for="${id}"]`);
    expect(label).not.toBeNull();
    expect(checkbox).toHaveAccessibleName();

    await user.click(label as HTMLElement);
    await waitFor(() => expect(checkbox).toHaveAttribute("aria-checked", "true"));
  });

  it("clears the validation error and lets acceptance proceed exactly once when the box is then checked", async () => {
    const user = userEvent.setup();
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    const accept = screen.getByRole("button", { name: /accept and continue/i });

    // Trigger the error, then check the box: alert should clear and aria-invalid drop.
    await user.click(accept);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(checkbox);
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(checkbox).not.toHaveAttribute("aria-invalid", "true");
    expect(checkbox).toHaveAttribute("aria-required", "true");

    await user.click(accept);
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1));
  });

  it("keeps keyboard focus inside the dialog when tabbing forward and backward", async () => {
    const user = userEvent.setup();
    const { dialog } = await renderGate();

    // Move focus into the dialog first (Radix autofocuses on mount, but be
    // explicit so this assertion is deterministic in jsdom).
    (screen.getByRole("checkbox") as HTMLElement).focus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("suppresses Escape: dialog stays open, no acceptance callback runs, focus stays inside", async () => {
    const user = userEvent.setup();
    const { dialog } = await renderGate();
    (screen.getByRole("checkbox") as HTMLElement).focus();

    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(signOutSpy).not.toHaveBeenCalled();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("suppresses outside pointer interaction: dialog stays open and no consent is recorded", async () => {
    const user = userEvent.setup();
    await renderGate();

    // Attempt an outside click on the page body.
    await user.click(document.body);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("successful path: checking the box and clicking Accept calls persistence exactly once with no alert", async () => {
    const user = userEvent.setup();
    await renderGate();
    const checkbox = screen.getByRole("checkbox");
    const accept = screen.getByRole("button", { name: /accept and continue/i });

    await user.click(checkbox);
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(accept);
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1));

    // Rows are scoped to the mocked user and current agreement set.
    const [rows] = upsertSpy.mock.calls[0] as [Array<{ user_id: string; agreement_type: string; version: string }>];
    expect(rows.every((r) => r.user_id === "u1")).toBe(true);
    expect(rows.map((r) => r.agreement_type).sort()).toEqual(["privacy", "terms"]);
  });
});
