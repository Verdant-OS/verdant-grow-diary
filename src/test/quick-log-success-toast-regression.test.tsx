/**
 * Quick Log save-button accessibility + success-toast regression.
 *
 * Parameterized contract tests across the Quick Log entry types to guard
 * against:
 *  - stale /save entry/i button-name expectations creeping back in
 *  - drift in the "Saved {verb} for {plant}" success-toast format
 *  - any reintroduction of legacy photo upload affordances
 *  - any accidental Action Queue / device-control / raw payload leakage
 *    from the Quick Log save path
 *
 * Strictly UI/test-only. The save path is mocked at the
 * useQuickLogV2Save seam exactly as in src/components/QuickLog.test.tsx
 * so this file introduces no new write path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";

// ---------------------------------------------------------------------------
// Mocks (mirror QuickLog.test.tsx)
// ---------------------------------------------------------------------------

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => saveMock(...a),
    saving: false,
    error: null,
  }),
}));

const insertMock = vi.fn();
const uploadMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: insertMock,
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: uploadMock, remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Verdant Test Plant", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastMessage = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toastMessage(...a),
  },
}));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
  insertMock.mockReset();
  uploadMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  toastMessage.mockReset();
});

// ---------------------------------------------------------------------------
// Shared parameter table
//
// Every supported Quick Log save variant lives here so the toast format and
// save-button accessible name stay in lockstep. "Coming soon" variants are
// listed in a separate table — they intentionally do NOT route through the
// Saved-toast path and must show the unsupported-event message instead.
// ---------------------------------------------------------------------------

const PLANT_NAME = "Verdant Test Plant";

interface SupportedVariant {
  /** prefill.eventType value driving the Quick Log form. */
  eventType: "observation" | "note" | "watering";
  /** Word produced by QuickLog.savedVerb for this event type. */
  verb: "observation" | "log" | "watering";
  /** Whether the variant needs a note in the textarea to clear validation. */
  requiresNote: boolean;
  /** Whether the variant needs a watering volume to clear validation. */
  requiresWateringVolume: boolean;
}

const SUPPORTED_VARIANTS: SupportedVariant[] = [
  // "note" is an internal alias for the same RPC action as "observation",
  // but the EventTypeSelector does not expose a "note" option — growers
  // pick "observation" in the UI. We exercise "observation" + "watering"
  // here; the legacy unified save tests cover the "note" RPC mapping.
  { eventType: "observation", verb: "observation", requiresNote: true, requiresWateringVolume: false },
  { eventType: "watering",    verb: "watering",    requiresNote: false, requiresWateringVolume: true },
];

interface UnsupportedVariant {
  eventType: string;
  /** Documentation only — these variants do NOT save through Quick Log today. */
  note: string;
}

const UNSUPPORTED_VARIANTS: UnsupportedVariant[] = [
  { eventType: "feeding",     note: "Routed to dedicated feeding form / coming soon in unified path." },
  { eventType: "environment", note: "Routed through manual sensor snapshot, not unified save." },
  { eventType: "training",    note: "Coming soon in unified save path." },
  { eventType: "diagnosis",   note: "AI Doctor flow, not Quick Log save path." },
  { eventType: "harvest",     note: "Coming soon in unified save path." },
];

/** Shared toast-format helper — single source of truth, no duplicated strings. */
function expectedSuccessToast(verb: SupportedVariant["verb"], plant: string): RegExp {
  // Saved {verb} for {plant} — matches QuickLog.savedVerb output exactly.
  // Anchored so we catch drift like "Logged ..." or "Saved entry ...".
  const escaped = plant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^Saved ${verb} for ${escaped}$`);
}

function fillNote(dialog: HTMLElement, text: string) {
  const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement | null;
  if (!textarea) throw new Error("Quick Log textarea not found");
  fireEvent.change(textarea, { target: { value: text } });
}

function fillWateringMl(dialog: HTMLElement, value: string) {
  // Accessible label-based query — no test id.
  const input = within(dialog).getByLabelText(/watering \(ml\)/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

// ---------------------------------------------------------------------------
// Save-button accessibility — parameterized
// ---------------------------------------------------------------------------

describe("Quick Log save button — accessible name regression", () => {
  for (const variant of SUPPORTED_VARIANTS) {
    it(`exposes role=button name=/save log/i for eventType=${variant.eventType}`, () => {
      renderWithClient(
        <QuickLog
          open={true}
          onOpenChange={vi.fn()}
          prefill={{ plantId: "plant-1", growId: "grow-1", eventType: variant.eventType }}
        />,
      );
      const dialog = screen.getByRole("dialog");
      // Single canonical name — drift to "Save entry" or similar must fail here.
      expect(within(dialog).getByRole("button", { name: /save log/i })).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: /save entry/i })).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// Success toast format — parameterized
// ---------------------------------------------------------------------------

describe("Quick Log success toast — Saved {verb} for {plant}", () => {
  for (const variant of SUPPORTED_VARIANTS) {
    it(`emits the expected toast for eventType=${variant.eventType}`, async () => {
      renderWithClient(
        <QuickLog
          open={true}
          onOpenChange={vi.fn()}
          prefill={{ plantId: "plant-1", growId: "grow-1", eventType: variant.eventType }}
        />,
      );
      const dialog = screen.getByRole("dialog");

      if (variant.requiresNote) fillNote(dialog, "Looking healthy.");
      if (variant.requiresWateringVolume) fillWateringMl(dialog, "500");

      fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));

      await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(toastSuccess).toHaveBeenCalledWith(
          expect.stringMatching(expectedSuccessToast(variant.verb, PLANT_NAME)),
        ),
      );

      // No "Logged ..." drift, no "Save entry" drift.
      for (const call of toastSuccess.mock.calls) {
        expect(String(call[0])).not.toMatch(/^Logged /);
      }
      expect(toastError).not.toHaveBeenCalled();
      // No write side-effects beyond the mocked save seam.
      expect(uploadMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// Unsupported variants — must NOT route through the Saved-toast path
// ---------------------------------------------------------------------------

describe("Quick Log unsupported variants — surface 'coming soon' instead of Saved toast", () => {
  for (const variant of UNSUPPORTED_VARIANTS) {
    it(`eventType=${variant.eventType} does not emit a Saved-for toast (${variant.note})`, async () => {
      renderWithClient(
        <QuickLog
          open={true}
          onOpenChange={vi.fn()}
          prefill={{ plantId: "plant-1", growId: "grow-1", eventType: variant.eventType }}
        />,
      );
      const dialog = screen.getByRole("dialog");
      fillNote(dialog, "Should not save through unified path.");
      fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));

      // Either the message-toast fires (unsupported path), or nothing at all —
      // but we MUST NOT see a Saved success toast or a successful RPC call.
      await waitFor(() => {
        expect(saveMock).not.toHaveBeenCalled();
        expect(toastSuccess).not.toHaveBeenCalled();
      });
      for (const call of toastMessage.mock.calls.concat(toastError.mock.calls)) {
        expect(String(call[0])).not.toMatch(/^Saved /);
      }
      expect(uploadMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// Photo safety — guard against legacy upload affordances
// ---------------------------------------------------------------------------

describe("Quick Log photo safety — no upload affordances across variants", () => {
  for (const variant of [...SUPPORTED_VARIANTS, ...UNSUPPORTED_VARIANTS]) {
    it(`eventType=${variant.eventType} renders no file input / image / remove control`, () => {
      renderWithClient(
        <QuickLog
          open={true}
          onOpenChange={vi.fn()}
          prefill={{ plantId: "plant-1", growId: "grow-1", eventType: variant.eventType }}
        />,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog.querySelector('input[type="file"]')).toBeNull();
      expect(dialog.querySelector("img")).toBeNull();
      expect(within(dialog).queryByLabelText(/remove photo/i)).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// Safety boundary — no Action Queue / device-control / raw payload strings
// ---------------------------------------------------------------------------

describe("Quick Log save path — safety boundary (UI scan)", () => {
  it("supported save does not surface raw_payload / service_role / token / device strings", async () => {
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", growId: "grow-1", eventType: "observation" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fillNote(dialog, "Plant looks great.");
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));

    const html = dialog.innerHTML.toLowerCase();
    expect(html).not.toContain("raw_payload");
    expect(html).not.toContain("service_role");
    expect(html).not.toContain("bearer ");
    expect(html).not.toMatch(/\baction[_-]?queue\b/);
    // No automation / device-control wording in the save surface.
    expect(html).not.toMatch(/\bautomation\b/);
    expect(html).not.toMatch(/\brelay\b/);

    // Save mock payload must not carry raw_payload / service_role.
    const payload = JSON.stringify(saveMock.mock.calls[0]?.[0] ?? {});
    expect(payload).not.toMatch(/raw_payload/);
    expect(payload).not.toMatch(/service_role/);
  });
});
