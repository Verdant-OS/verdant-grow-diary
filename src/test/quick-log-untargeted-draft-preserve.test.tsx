import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

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
    user: { id: "user-1" },
    loading: false,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "QA Test", tent_id: "tent-1", grow_id: "grow-1" },
      { id: "plant-2", name: "QA Two", tent_id: "tent-1", grow_id: "grow-1" },
    ],
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

vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: vi.fn(),
}));

vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "fahrenheit",
}));

const elementPrototype = Element.prototype as Element & {
  hasPointerCapture?: () => boolean;
  setPointerCapture?: () => void;
  releasePointerCapture?: () => void;
  scrollIntoView?: () => void;
};
const PATCHED_ELEMENT_METHODS = [
  "hasPointerCapture",
  "setPointerCapture",
  "releasePointerCapture",
  "scrollIntoView",
] as const;
const originalElementMethods = PATCHED_ELEMENT_METHODS.map(
  (name) => [name, Object.getOwnPropertyDescriptor(Element.prototype, name)] as const,
);
elementPrototype.hasPointerCapture ??= () => false;
elementPrototype.setPointerCapture ??= () => {};
elementPrototype.releasePointerCapture ??= () => {};
elementPrototype.scrollIntoView ??= () => {};
afterAll(() => {
  for (const [name, descriptor] of originalElementMethods) {
    if (descriptor) Object.defineProperty(Element.prototype, name, descriptor);
    else Reflect.deleteProperty(Element.prototype, name);
  }
});

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import {
  QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
  QUICK_LOG_OBSERVATION_SAVE_ERROR,
} from "@/lib/quickLogObservationDraftRules";

function renderSheet(target: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey={target} />
    </QueryClientProvider>,
  );
}

const storedDraftText = () =>
  Array.from({ length: window.sessionStorage.length }, (_, i) => {
    const key = window.sessionStorage.key(i);
    return key ? (window.sessionStorage.getItem(key) ?? "") : "";
  }).join("");

async function failNoteOnPlantA() {
  rpcMock.mockResolvedValue({ data: { ok: false, reason: "invalid_details" }, error: null });
  renderSheet("plant:plant-1");
  fireEvent.change(await screen.findByTestId("qlv2-note"), {
    target: { value: "First leaves look pale" },
  });
  fireEvent.click(screen.getByTestId("qlv2-save"));
  await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(storedDraftText()).toContain('"saveFailed":true'));
  cleanup();
}

describe("Quick Log untargeted open keeps the stored plant draft", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    rpcMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("keeps plant A's failed draft when Quick Log opens with no target and nothing is typed", async () => {
    await failNoteOnPlantA();
    renderSheet(null);
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    expect(screen.getByTestId("qlv2-draft-restored")).toHaveTextContent(
      QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
    );
    expect(screen.queryByText(QUICK_LOG_OBSERVATION_SAVE_ERROR)).toBeNull();
    expect(storedDraftText()).toContain("plant:plant-1");
    expect(storedDraftText()).toContain('"saveFailed":true');
    cleanup();
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    expect(screen.getByText(QUICK_LOG_OBSERVATION_SAVE_ERROR)).toBeInTheDocument();
  });

  it("stores an edit made on the untargeted sheet", async () => {
    await failNoteOnPlantA();
    renderSheet(null);
    fireEvent.change(await screen.findByTestId("qlv2-note"), {
      target: { value: "First leaves look pale still" },
    });
    await waitFor(() => expect(storedDraftText()).toContain("pale still"));
    expect(storedDraftText()).not.toContain("plant:plant-1");
  });
});
