import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
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
    user: { id: "user-1" },
    loading: false,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "QA Test", tent_id: "tent-1", grow_id: "grow-1" },
      { id: "plant-2", name: "QA Two", tent_id: "tent-2", grow_id: "grow-1" },
    ],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      { id: "tent-1", name: "Flower", grow_id: "grow-1" },
      { id: "tent-2", name: "Veg", grow_id: "grow-1" },
    ],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test", is_archived: false }] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: vi.fn(),
}));

vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "fahrenheit" as const,
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import {
  QUICK_LOG_OBSERVATION_DRAFT_FORM_ID,
  QUICK_LOG_OBSERVATION_DRAFT_LEAVE_WARNING,
} from "@/lib/quickLogObservationDraftRules";
import { writeBrowserSessionFormDraft } from "@/lib/sessionFormDraftStore";

function renderSheet(target: string | null, onOpenChange: (open: boolean) => void = () => {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={onOpenChange} defaultTargetKey={target} />
    </QueryClientProvider>,
  );
}

const storedDraftText = () =>
  Array.from({ length: window.sessionStorage.length }, (_, i) => {
    const key = window.sessionStorage.key(i);
    return key ? (window.sessionStorage.getItem(key) ?? "") : "";
  }).join("\n");

describe("Quick Log observation draft stays on its target (#2806)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not restore a plant or tent draft when Quick Log opens with no target", async () => {
    renderSheet("tent:tent-1");
    fireEvent.change(await screen.findByTestId("qlv2-note"), {
      target: { value: "SYNTH H2-d" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    await waitFor(() => expect(storedDraftText()).toContain("SYNTH H2-d"));
    cleanup();

    renderSheet(null);
    expect(screen.queryByDisplayValue("SYNTH H2-d")).toBeNull();
    expect(screen.queryByTestId("qlv2-draft-restored")).toBeNull();
  });

  it("keeps the draft for target X when a note is typed for target Y", async () => {
    renderSheet("plant:plant-1");
    fireEvent.change(await screen.findByTestId("qlv2-note"), {
      target: { value: "Leaves on A" },
    });
    await waitFor(() => expect(storedDraftText()).toContain("Leaves on A"));
    cleanup();

    renderSheet("plant:plant-2");
    fireEvent.change(await screen.findByTestId("qlv2-note"), {
      target: { value: "Leaves on B" },
    });
    await waitFor(() => expect(storedDraftText()).toContain("Leaves on B"));
    expect(storedDraftText()).toContain("Leaves on A");
    cleanup();

    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("Leaves on A");
    cleanup();

    renderSheet("plant:plant-2");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("Leaves on B");
  });

  it("warns on Cancel, browser Back, and refresh for a typed note, then restores that target", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onOpenChange = vi.fn();
    const view = renderSheet("plant:plant-1", onOpenChange);
    fireEvent.change(await screen.findByTestId("qlv2-note"), {
      target: { value: "Half typed note" },
    });
    await waitFor(() => expect(storedDraftText()).toContain("Half typed note"));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledWith(QUICK_LOG_OBSERVATION_DRAFT_LEAVE_WARNING);
    expect(onOpenChange).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onOpenChange).not.toHaveBeenCalled();

    const refresh = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(refresh);
    expect(refresh.defaultPrevented).toBe(true);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    view.unmount();

    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("Half typed note");
  });

  it("adopts a legacy single-slot draft only for the target it names", async () => {
    writeBrowserSessionFormDraft("user-1", QUICK_LOG_OBSERVATION_DRAFT_FORM_ID, {
      form: {
        selectedKey: "tent:tent-1",
        action: "feed",
        volumeMl: "",
        note: "SYNTH H2-d",
        temperatureC: "",
        humidityPct: "",
        vpdKpa: "",
      },
      saveFailed: false,
      idempotencyKey: null,
      tempEntryUnit: null,
      chipStatus: null,
    });

    renderSheet(null);
    expect(screen.queryByDisplayValue("SYNTH H2-d")).toBeNull();
    expect(storedDraftText()).toContain("SYNTH H2-d");
    cleanup();

    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    expect(storedDraftText()).toContain("SYNTH H2-d");
    cleanup();

    renderSheet("tent:tent-1");
    expect(await screen.findByLabelText("Feeding note (optional)")).toHaveValue("SYNTH H2-d");
  });

  it("does not warn on Cancel or refresh when the form is empty", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onOpenChange = vi.fn();
    renderSheet("plant:plant-1", onOpenChange);
    await screen.findByTestId("qlv2-note");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    const refresh = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(refresh);
    expect(refresh.defaultPrevented).toBe(false);
  });
});
