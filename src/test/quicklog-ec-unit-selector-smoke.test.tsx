/**
 * Bug #13 — EC unit selector smoke test.
 *
 * Renders Quick Log, expands "Add more details", opens the EC unit selector,
 * and asserts all four labels from EC_UNIT_LABEL render and are mutually
 * distinct. A passing test supports a Bug #13 CLOSE CANDIDATE status; it does
 * NOT close Bug #13 on its own — visual evidence from the live authenticated
 * UI is still required (see docs/evidence/bug-13-ec-ppm-selector-checklist.md).
 *
 * No production code is changed by this test. No fake-live source label is
 * introduced. Manual Quick Log entries remain manual.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";
import { EC_UNIT_LABEL } from "@/constants/units";

// Radix Select uses pointer-capture APIs and scrollIntoView that jsdom
// doesn't implement. Shim them so the selector can open in the test env.
beforeAll(() => {
  if (!(Element.prototype as unknown as { hasPointerCapture?: unknown })
    .hasPointerCapture) {
    (Element.prototype as unknown as { hasPointerCapture: () => boolean })
      .hasPointerCapture = () => false;
  }
  (Element.prototype as unknown as { releasePointerCapture: () => void })
    .releasePointerCapture = () => {};
  (Element.prototype as unknown as { scrollIntoView: () => void })
    .scrollIntoView = () => {};
});

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
  usePlants: () => ({
    data: [{ id: "p1", name: "P", tent_id: "t1", grow_id: "g1" }],
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("Bug #13 — EC unit selector smoke", () => {
  it("opens the EC unit selector and renders all four distinct labels", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Add more details"));

    const trigger = within(dialog).getByTestId("quicklog-details-ec-unit");
    expect(trigger).toBeInTheDocument();

    // Open the Radix Select via keyboard (portal-rendered list).
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });

    const listbox = screen.getByRole("listbox");
    const optionTexts = Array.from(
      listbox.querySelectorAll('[role="option"]'),
    ).map((el) => (el.textContent ?? "").trim());

    // All four labels from the canonical constant render.
    for (const label of Object.values(EC_UNIT_LABEL)) {
      expect(optionTexts).toContain(label);
    }

    // Exactly four options, no duplicates, no extra entries.
    expect(optionTexts.length).toBe(4);
    expect(new Set(optionTexts).size).toBe(4);

    // µS/cm vs mS/cm are visually distinct labels.
    expect(optionTexts).toContain("EC mS/cm");
    expect(optionTexts).toContain("EC µS/cm");
    expect("EC mS/cm").not.toBe("EC µS/cm");

    // PPM 500 scale vs PPM 700 scale are visually distinct labels.
    expect(optionTexts).toContain("PPM 500 scale");
    expect(optionTexts).toContain("PPM 700 scale");
    expect("PPM 500 scale").not.toBe("PPM 700 scale");

    // No fake-live source label leaks into the selector.
    const joined = optionTexts.join(" | ").toLowerCase();
    expect(joined).not.toMatch(/\blive\b/);
    expect(joined).not.toMatch(/\bdemo\b/);
    expect(joined).not.toMatch(/\bstale\b/);
    expect(joined).not.toMatch(/\binvalid\b/);
  });
});
