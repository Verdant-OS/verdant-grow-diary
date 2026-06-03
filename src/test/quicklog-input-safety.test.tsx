/**
 * QuickLog input safety contract — fixes 8/14/16.
 *
 *  - No raw "EC / PPM" label.
 *  - "Add more details" exposes an EC value + EC unit selector.
 *  - Duplicate pH inputs removed from "more details" (consolidated into
 *    the Hardware readings section).
 *  - Free-text fields disable browser autocomplete/autocorrect so the
 *    OS suggestion bar doesn't obscure inputs on mobile.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: vi.fn(), saving: false, error: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G", stage: "veg" }],
    activeGrow: { id: "g1", name: "G", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [{ id: "p1", name: "P", tent_id: "t1", grow_id: "g1" }] }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("QuickLog input safety", () => {
  it("no ambiguous 'EC / PPM' label remains anywhere in the dialog", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Add more details"));
    expect(dialog.textContent ?? "").not.toMatch(/EC\s*\/\s*PPM/i);
    expect(dialog.textContent ?? "").not.toMatch(/Input\s+EC\/PPM/i);
    expect(dialog.textContent ?? "").not.toMatch(/Runoff\s+EC\/PPM/i);
  });

  it("More details exposes an EC value field and explicit EC unit selector", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Add more details"));
    expect(within(dialog).getByTestId("quicklog-details-ec-value")).toBeInTheDocument();
    expect(within(dialog).getByTestId("quicklog-details-ec-unit")).toBeInTheDocument();
  });

  it("does not render duplicate pH inputs in 'More details' (consolidated into Hardware readings)", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Add more details"));
    // pH lives only in the Hardware readings section now.
    const hardware = within(dialog).getByTestId("quicklog-hardware-readings");
    expect(within(hardware).getByText("Feed/Input pH")).toBeInTheDocument();
    expect(within(hardware).getByText("Runoff pH")).toBeInTheDocument();
    // Count of pH labels across the dialog matches the count inside the
    // hardware section — no duplicates leak out into "More details".
    const allPh = within(dialog).getAllByText(/\bpH\b/);
    const hwPh = within(hardware).getAllByText(/\bpH\b/);
    expect(allPh.length).toBe(hwPh.length);
  });

  it("free-text fields disable browser autocomplete and autocorrect", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.getAttribute("autocomplete")).toBe("off");
    expect(textarea.getAttribute("autocorrect")).toBe("off");

    fireEvent.click(within(dialog).getByText("Add more details"));
    const nutrients = within(dialog)
      .getByText("Nutrients")
      .parentElement!.querySelector("input") as HTMLInputElement;
    expect(nutrients.getAttribute("autocomplete")).toBe("off");
    expect(nutrients.getAttribute("autocorrect")).toBe("off");
    expect(nutrients.getAttribute("spellcheck")).toBe("false");
  });

  it("save remains enabled (only disabled while busy)", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const btn = within(dialog).getByRole("button", { name: /save entry/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
