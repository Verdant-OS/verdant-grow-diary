/**
 * Quick Log draft keeps Water and Feed details (audit 2026-11-11).
 *
 * The session draft stored the note and basic readings only. Closing the
 * sheet and reopening it reset the Water and Feed forms, so typed volume, pH
 * and runoff were gone with no notice.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_FORM_DRAFT_VERSION } from "@/lib/sessionFormDraftRules";
import {
  QUICK_LOG_OBSERVATION_DRAFT_FORM_ID,
  isQuickLogObservationDraftEmpty,
  parseQuickLogObservationDraft,
  quickLogDraftSlotHeldByOtherTarget,
  quickLogFeedingDraftFields,
  quickLogWateringDraftFields,
  restorableQuickLogObservationDraft,
} from "@/lib/quickLogObservationDraftRules";
import { EMPTY_QUICKLOG_FEEDING_FORM } from "@/lib/quickLogFeedingFormViewModel";
import { EMPTY_QUICKLOG_WATERING_FORM } from "@/lib/quickLogWateringFormViewModel";
import { EMPTY_QUICKLOG_V2_FORM } from "@/lib/quickLogV2Rules";

const rpcMock = vi.fn();

const testState = vi.hoisted(() => ({
  userId: "user-1",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: testState.userId },
    loading: false,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "QA Test", tent_id: "tent-1", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test", is_archived: false }] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function draftKey(userId: string) {
  return `verdant.session-form.${SESSION_FORM_DRAFT_VERSION}.${userId}.${QUICK_LOG_OBSERVATION_DRAFT_FORM_ID}`;
}

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function storedDraft(): string {
  return window.sessionStorage.getItem(draftKey("user-1")) ?? "";
}

function input(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`missing input #${id}`);
  return el;
}

const WATER_FORM = {
  ...EMPTY_QUICKLOG_V2_FORM,
  selectedKey: "plant:plant-1",
  action: "water" as const,
};
const FEED_FORM = {
  ...EMPTY_QUICKLOG_V2_FORM,
  selectedKey: "plant:plant-1",
  action: "feed" as const,
};

describe("quickLogWateringDraftFields", () => {
  it("is null for an empty form and for a volume only the prefill wrote", () => {
    expect(quickLogWateringDraftFields(EMPTY_QUICKLOG_WATERING_FORM, null)).toBeNull();
    expect(
      quickLogWateringDraftFields({ ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500" }, "500"),
    ).toBeNull();
  });

  it("keeps a typed volume, a changed prefill, zero, and any other detail", () => {
    const typed = { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500" };
    expect(quickLogWateringDraftFields(typed, null)).toBe(typed);
    expect(quickLogWateringDraftFields(typed, "750")).toBe(typed);
    const retyped = { ...typed, volumeEntryText: "500" };
    expect(quickLogWateringDraftFields(retyped, "500")).toBe(retyped);
    const zero = { ...EMPTY_QUICKLOG_WATERING_FORM, runoffMl: "0" };
    expect(quickLogWateringDraftFields(zero, null)).toBe(zero);
    const withPh = { ...typed, ph: "6.2" };
    expect(quickLogWateringDraftFields(withPh, "500")).toBe(withPh);
    const feel = { ...EMPTY_QUICKLOG_WATERING_FORM, potWeightFeel: "light" as const };
    expect(quickLogWateringDraftFields(feel, null)).toBe(feel);
  });
});

describe("quickLogFeedingDraftFields", () => {
  const defaults = {
    ...EMPTY_QUICKLOG_FEEDING_FORM,
    lineId: "line-1",
    products: [{ name: "Grow A", amount: "2", unit: "ml_per_l" }],
    volumeMl: "1000",
  };

  it("is null for a pristine form, a note alone, and untouched defaults", () => {
    expect(quickLogFeedingDraftFields(EMPTY_QUICKLOG_FEEDING_FORM, null)).toBeNull();
    expect(
      quickLogFeedingDraftFields({ ...EMPTY_QUICKLOG_FEEDING_FORM, note: "Cloudy" }, null),
    ).toBeNull();
    expect(quickLogFeedingDraftFields({ ...defaults, note: "Cloudy" }, defaults)).toBeNull();
  });

  it("keeps typed readings and an edited recipe, without the note", () => {
    expect(
      quickLogFeedingDraftFields({ ...EMPTY_QUICKLOG_FEEDING_FORM, ph: "6.0", note: "n" }, null),
    ).toEqual({ ...EMPTY_QUICKLOG_FEEDING_FORM, ph: "6.0" });
    const edited = { ...defaults, products: [{ name: "Grow A", amount: "3", unit: "ml_per_l" }] };
    expect(quickLogFeedingDraftFields(edited, defaults)).toEqual(edited);
    expect(quickLogFeedingDraftFields(defaults, null)).toEqual(defaults);
  });
});

describe("parseQuickLogObservationDraft with Water and Feed details", () => {
  it("round-trips Water details and drops anything it does not recognise", () => {
    const parsed = parseQuickLogObservationDraft({
      form: WATER_FORM,
      watering: {
        volumeMl: "500",
        ph: "6.2",
        runoffMl: "0",
        potWeightFeel: "light",
        mediumSurface: "soaked",
        drainage: 7,
        volumeEntryUnit: "L",
        volumeEntryText: "0.5",
        waterTempC: null,
        injected: "x",
      },
      wateringTempEntryUnit: "fahrenheit",
      feeding: { ph: "5.8" },
    });
    expect(parsed?.watering).toEqual({
      ...EMPTY_QUICKLOG_WATERING_FORM,
      volumeMl: "500",
      ph: "6.2",
      runoffMl: "0",
      potWeightFeel: "light",
      volumeEntryUnit: "L",
      volumeEntryText: "0.5",
    });
    expect(parsed?.wateringTempEntryUnit).toBe("fahrenheit");
    expect(parsed?.feeding).toBeUndefined();
  });

  it("round-trips Feed details and repairs a malformed product list", () => {
    const parsed = parseQuickLogObservationDraft({
      form: FEED_FORM,
      feeding: {
        lineId: "line-1",
        ph: "6.0",
        note: "must not come from here",
        products: [{ name: "Grow A", amount: "2" }, "junk", null],
      },
      watering: { ph: "6.2" },
    });
    expect(parsed?.feeding).toEqual({
      ...EMPTY_QUICKLOG_FEEDING_FORM,
      lineId: "line-1",
      ph: "6.0",
      products: [{ name: "Grow A", amount: "2", unit: "ml_per_l" }],
    });
    expect(parsed?.watering).toBeUndefined();
    expect(
      parseQuickLogObservationDraft({ form: FEED_FORM, feeding: { products: "x" } })?.feeding
        ?.products,
    ).toEqual(EMPTY_QUICKLOG_FEEDING_FORM.products);
  });

  it("reads an older draft with no detail blocks", () => {
    const parsed = parseQuickLogObservationDraft({ form: { ...WATER_FORM, note: "old" } });
    expect(parsed?.watering).toBeUndefined();
    expect(parsed?.feeding).toBeUndefined();
    expect(parsed?.form.note).toBe("old");
  });
});

describe("draft emptiness and restore with details", () => {
  const watering = { ...EMPTY_QUICKLOG_WATERING_FORM, ph: "6.2" };

  it("treats details as content", () => {
    expect(isQuickLogObservationDraftEmpty(WATER_FORM)).toBe(true);
    expect(isQuickLogObservationDraftEmpty(WATER_FORM, null, { watering })).toBe(false);
    expect(isQuickLogObservationDraftEmpty(WATER_FORM, null, { watering: null })).toBe(true);
  });

  it("restores a details-only draft for its own target and never for another", () => {
    const stored = parseQuickLogObservationDraft({ form: WATER_FORM, watering });
    expect(restorableQuickLogObservationDraft(stored, "plant:plant-1")?.watering).toEqual(watering);
    expect(restorableQuickLogObservationDraft(stored, "plant:plant-2")).toBeNull();
    const untargeted = restorableQuickLogObservationDraft(stored, null);
    expect(untargeted?.form.selectedKey).toBeNull();
    expect(untargeted?.watering).toEqual(watering);
  });
});

describe("quickLogDraftSlotHeldByOtherTarget", () => {
  it("is true only when a stored draft belongs to a different target", () => {
    const stored = parseQuickLogObservationDraft({ form: { ...WATER_FORM, note: "A" } });
    expect(quickLogDraftSlotHeldByOtherTarget(null, "plant:plant-2")).toBe(false);
    expect(quickLogDraftSlotHeldByOtherTarget(stored, "plant:plant-1")).toBe(false);
    expect(quickLogDraftSlotHeldByOtherTarget(stored, "plant:plant-2")).toBe(true);
    expect(quickLogDraftSlotHeldByOtherTarget(stored, null)).toBe(true);
  });
});

describe("Quick Log sheet keeps Water and Feed details across a reopen", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.userId = "user-1";
    rpcMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("restores typed Water volume, pH and runoff", async () => {
    const first = renderSheet();
    await screen.findByTestId("qlv2-note");
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(input("qlv2-volume"), { target: { value: "500" } });
    fireEvent.change(input("qlv2-water-ph"), { target: { value: "6.2" } });
    fireEvent.change(input("qlv2-water-runoff-ml"), { target: { value: "0" } });
    await waitFor(() => expect(storedDraft()).toContain('"ph":"6.2"'));
    first.unmount();

    renderSheet();
    await waitFor(() => expect(input("qlv2-water-ph")).toHaveValue("6.2"));
    expect(input("qlv2-volume")).toHaveValue("500");
    expect(input("qlv2-water-runoff-ml")).toHaveValue("0");
    expect(screen.getByTestId("qlv2-draft-restored")).toHaveTextContent(
      "Restored your unsaved entry for this target.",
    );
  });

  it("restores typed Feed volume and pH", async () => {
    const first = renderSheet();
    await screen.findByTestId("qlv2-note");
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    fireEvent.change(input("qlv2-feed-volume"), { target: { value: "1000" } });
    fireEvent.change(input("qlv2-feed-ph"), { target: { value: "6.0" } });
    await waitFor(() => expect(storedDraft()).toContain('"ph":"6.0"'));
    first.unmount();

    renderSheet();
    await waitFor(() => expect(input("qlv2-feed-ph")).toHaveValue("6.0"));
    expect(input("qlv2-feed-volume")).toHaveValue("1000");
    expect(screen.getByTestId("qlv2-draft-restored")).toBeVisible();
  });

  it("stores no draft when Water is opened and nothing is typed", async () => {
    renderSheet();
    await screen.findByTestId("qlv2-note");
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    await screen.findByTestId("qlv2-watering-form");
    expect(storedDraft()).toBe("");
  });

  it("clears the draft once the typed Water details are removed", async () => {
    renderSheet();
    await screen.findByTestId("qlv2-note");
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(input("qlv2-water-ph"), { target: { value: "6.2" } });
    await waitFor(() => expect(storedDraft()).toContain('"ph":"6.2"'));
    fireEvent.change(input("qlv2-water-ph"), { target: { value: "" } });
    await waitFor(() => expect(storedDraft()).toBe(""));
  });
});
