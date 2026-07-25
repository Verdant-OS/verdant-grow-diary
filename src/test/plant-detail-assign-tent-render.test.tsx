/**
 * Behavioral regression test for the prod bug: on a freshly created plant
 * with no grow_id, the "Assign to tent" quick-action showed a dead-end
 * error ("missing grow context") while Edit Plant's Tent dropdown — which
 * lists every tent across every grow with no grow requirement — worked.
 *
 * This renders the real AssignTentDialog (no source-string matching) for a
 * grow-less plant and drives it end to end: open, see cross-grow tent
 * options, pick one, submit, and confirm only plants.tent_id is written.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AssignTentDialog from "@/components/AssignTentDialog";

// Radix Select uses pointer-capture APIs and scrollIntoView jsdom lacks.
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

const updateMock = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
const insertMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "plants") return { update: updateMock };
      if (table === "diary_entries") return { insert: insertMock };
      throw new Error(`unexpected table in test: ${table}`);
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

// Tents spanning multiple grows, mirroring the prod repro (Seedling A,
// Vegetation, Flower, QA Test Tent, Male Tent, Seedling Tent, Starter Tent).
const TENTS = [
  { id: "t1", name: "Seedling A", grow_id: "g1", is_archived: false },
  { id: "t2", name: "Vegetation", grow_id: "g1", is_archived: false },
  { id: "t3", name: "Flower", grow_id: "g2", is_archived: false },
  { id: "t4", name: "QA Test Tent", grow_id: "g3", is_archived: false },
  { id: "t5", name: "Male Tent", grow_id: "g4", is_archived: false },
];
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: TENTS, isLoading: false }),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() },
}));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  updateMock.mockClear();
  insertMock.mockClear();
  toastSuccess.mockClear();
});

describe("AssignTentDialog · plant missing grow context (regression)", () => {
  it("lists tents across all grows instead of dead-ending on 'missing grow context'", () => {
    renderWithClient(
      <AssignTentDialog plantId="p1" growId={null} currentTentId={null} />,
    );
    fireEvent.click(screen.getByTestId("plant-detail-assign-tent"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByTestId("assign-tent-no-grow")).toBeNull();
    expect(dialog.textContent).not.toMatch(/missing grow context/i);

    const trigger = within(dialog).getByTestId("assign-tent-select");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });

    const listbox = screen.getByRole("listbox");
    const optionTexts = Array.from(
      listbox.querySelectorAll('[role="option"]'),
    ).map((el) => (el.textContent ?? "").trim());

    // Tents from every grow are offered, not just one grow's tents.
    for (const t of TENTS) {
      expect(optionTexts).toContain(t.name);
    }
  });

  it("assigning a tent from any grow writes only plants.tent_id (no grow_id write, no diary entry when growId is absent)", async () => {
    renderWithClient(
      <AssignTentDialog plantId="p1" growId={null} currentTentId={null} />,
    );
    fireEvent.click(screen.getByTestId("plant-detail-assign-tent"));
    const dialog = screen.getByRole("dialog");

    const trigger = within(dialog).getByTestId("assign-tent-select");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.click(screen.getByTestId("assign-tent-option-t3")); // Flower, grow g2

    fireEvent.click(within(dialog).getByTestId("assign-tent-submit"));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith({ tent_id: "t3" });
    expect(insertMock).not.toHaveBeenCalled();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Plant assigned to tent"));
  });
});
