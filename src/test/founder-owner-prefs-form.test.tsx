/**
 * FounderOwnerPrefsForm — happy-path invoke coverage.
 *
 * Covers:
 *  - Loads the caller's founder row via useMyFounderRow.
 *  - Submitting valid prefs calls supabase.functions.invoke("save-founder-prefs")
 *    with the parsed (trimmed, https-only) body and refetches on success.
 *  - Client-side zod validation blocks a non-https link before invoke fires.
 *  - Server-reported error surfaces without calling refetch.
 *  - Refunded rows disable the submit button (no invoke).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FounderOwnerPrefsForm from "@/components/FounderOwnerPrefsForm";
import type { MyFounderRow } from "@/hooks/useMyFounderRow";

const invokeSpy = vi.fn();
const refetchSpy = vi.fn(async () => {});
const toastSpy = vi.fn();

let mockRow: MyFounderRow | null = {
  founder_number: 7,
  display_name: "Alice",
  display_style: "custom_name",
  show_on_wall: true,
  optional_link: null,
  status: "confirmed",
};
let mockLoading = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeSpy(...args),
    },
  },
}));

vi.mock("@/hooks/useMyFounderRow", () => ({
  useMyFounderRow: () => ({
    loading: mockLoading,
    row: mockRow,
    refetch: refetchSpy,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

beforeEach(() => {
  invokeSpy.mockReset();
  refetchSpy.mockClear();
  toastSpy.mockClear();
  mockLoading = false;
  mockRow = {
    founder_number: 7,
    display_name: "Alice",
    display_style: "custom_name",
    show_on_wall: true,
    optional_link: null,
    status: "confirmed",
  };
});

describe("FounderOwnerPrefsForm — invoke happy path", () => {
  it("submits parsed prefs to save-founder-prefs and refetches", async () => {
    invokeSpy.mockResolvedValue({ data: { ok: true }, error: null });
    const user = userEvent.setup();
    render(<FounderOwnerPrefsForm />);

    const link = screen.getByLabelText(/Optional link/i);
    await user.clear(link);
    await user.type(link, "  https://verdant.example/me  ");

    await user.click(screen.getByRole("button", { name: /save founder settings/i }));

    await waitFor(() => expect(invokeSpy).toHaveBeenCalledTimes(1));
    expect(invokeSpy).toHaveBeenCalledWith("save-founder-prefs", {
      body: {
        display_name: "Alice",
        display_style: "custom_name",
        show_on_wall: true,
        optional_link: "https://verdant.example/me",
      },
    });
    await waitFor(() => expect(refetchSpy).toHaveBeenCalled());
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/saved/i) }),
    );
  });

  it("blocks non-https link client-side before invoke fires", async () => {
    const user = userEvent.setup();
    render(<FounderOwnerPrefsForm />);

    const link = screen.getByLabelText(/Optional link/i);
    await user.clear(link);
    await user.type(link, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: /save founder settings/i }));

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/https/i);
  });

  it("surfaces server error without refetching", async () => {
    invokeSpy.mockResolvedValue({
      data: { ok: false, error: "update_failed" },
      error: null,
    });
    const user = userEvent.setup();
    render(<FounderOwnerPrefsForm />);

    await user.click(screen.getByRole("button", { name: /save founder settings/i }));

    await waitFor(() => expect(invokeSpy).toHaveBeenCalled());
    expect(refetchSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/update_failed/);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("locks the form for refunded seats", async () => {
    mockRow = { ...(mockRow as MyFounderRow), status: "refunded" };
    render(<FounderOwnerPrefsForm />);
    expect(
      screen.getByRole("button", { name: /save founder settings/i }),
    ).toBeDisabled();
    expect(screen.getByText(/refunded/i)).toBeInTheDocument();
  });
});
