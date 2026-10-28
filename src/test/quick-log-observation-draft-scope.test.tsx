import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const unitState = vi.hoisted(() => ({ unit: "fahrenheit" as "fahrenheit" | "celsius" }));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => unitState.unit,
}));

// Radix's Select relies on pointer-capture APIs jsdom does not implement.
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
    else delete (elementPrototype as Record<string, unknown>)[name];
  }
});

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import {
  QUICK_LOG_OBSERVATION_DRAFT_RESTORED_COPY,
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

const noteValue = (el: HTMLElement) => (el as HTMLTextAreaElement).value;

/** One mounted sheet whose open state and target change, as AppShell drives it. */
function renderMountedSheet(target: string | null, open: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const tree = (t: string | null, o: boolean) => (
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={o} onOpenChange={() => {}} defaultTargetKey={t} />
    </QueryClientProvider>
  );
  const view = render(tree(target, open));
  return { rerender: (t: string | null, o: boolean) => view.rerender(tree(t, o)) };
}

const storedDraftText = () =>
  Array.from({ length: window.sessionStorage.length }, (_, i) => {
    const key = window.sessionStorage.key(i);
    return key ? (window.sessionStorage.getItem(key) ?? "") : "";
  }).join("");

async function failNoteOn(target: string, reason: string) {
  rpcMock.mockResolvedValue({ data: { ok: false, reason }, error: null });
  renderSheet(target);
  const note = await screen.findByTestId("qlv2-note");
  fireEvent.change(note, { target: { value: "First leaves look pale" } });
  fireEvent.click(screen.getByTestId("qlv2-save"));
  await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(window.sessionStorage.length).toBeGreaterThan(0));
  cleanup();
}

describe("Quick Log observation draft scope and ambiguous outcomes (#2541 P2s)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    rpcMock.mockReset();
    unitState.unit = "fahrenheit";
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("does not restore plant A's draft when the sheet opens for plant B", async () => {
    await failNoteOn("plant:plant-1", "invalid_details");
    renderSheet("plant:plant-2");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    expect(screen.queryByTestId("qlv2-draft-restored")).toBeNull();
  });

  it("restores the draft for the same target and says so", async () => {
    await failNoteOn("plant:plant-1", "invalid_details");
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    expect(screen.getByTestId("qlv2-draft-restored")).toHaveTextContent(
      QUICK_LOG_OBSERVATION_DRAFT_RESTORED_COPY,
    );
  });

  it("restores the words but not the target when the sheet opens with none", async () => {
    await failNoteOn("plant:plant-1", "invalid_details");
    renderSheet(null);
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    expect(screen.getByTestId("qlv2-draft-restored")).toHaveTextContent(
      QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
    );
    // The grower picks the target; the draft never does.
    expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toHaveTextContent(
      "Choose a tent or plant",
    );
    // The old target's failed save does not follow the words.
    expect(screen.queryByText(QUICK_LOG_OBSERVATION_SAVE_ERROR)).toBeNull();
  });

  it("forgets a draft the grower deleted back to empty (review 5677784998)", async () => {
    renderSheet("plant:plant-1");
    const note = await screen.findByTestId("qlv2-note");
    fireEvent.change(note, { target: { value: "abc" } });
    await waitFor(() => expect(window.sessionStorage.length).toBeGreaterThan(0));
    fireEvent.change(note, { target: { value: "" } });
    cleanup();
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    expect(screen.queryByTestId("qlv2-draft-restored")).toBeNull();
  });

  it("keeps plant A's draft when the sheet opens for plant B and nothing is typed", async () => {
    await failNoteOn("plant:plant-1", "invalid_details");
    renderSheet("plant:plant-2");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    cleanup();
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
  });

  it("keeps a restored temperature in the unit it was typed in (Codex review)", async () => {
    unitState.unit = "celsius";
    renderSheet("plant:plant-1");
    fireEvent.change(await screen.findByLabelText(/^Temp \(/), { target: { value: "25" } });
    await waitFor(() => expect(window.sessionStorage.length).toBeGreaterThan(0));
    cleanup();
    unitState.unit = "fahrenheit";
    renderSheet("plant:plant-1");
    expect(await screen.findByLabelText(/^Temp \(/)).toHaveValue("25");
    // Typed as 25 °C; the new Fahrenheit preference must not relabel it.
    expect(screen.getByText(/^Temp \(/)).toHaveTextContent("°C");
  });

  it("keeps the chip's ownership of its response line across a restore (Codex review)", async () => {
    renderSheet("plant:plant-1");
    fireEvent.click(await screen.findByTestId("qlv2-response-chip-better"));
    await waitFor(() => expect(window.sessionStorage.length).toBeGreaterThan(0));
    cleanup();
    renderSheet("plant:plant-1");
    expect(noteValue(await screen.findByTestId("qlv2-note"))).toContain("Response check:");
    fireEvent.click(screen.getByLabelText("Target"));
    fireEvent.click(await screen.findByRole("option", { name: /QA Two/ }));
    // Plant 1's response must not ride the retarget onto plant 2.
    await waitFor(() =>
      expect(noteValue(screen.getByTestId("qlv2-note"))).not.toContain("Response check:"),
    );
  });

  it("drops a chip's response line when the draft returns with no target", async () => {
    renderSheet("plant:plant-1");
    fireEvent.click(await screen.findByTestId("qlv2-response-chip-better"));
    const typed = await screen.findByTestId("qlv2-note");
    fireEvent.change(typed, { target: { value: `${noteValue(typed)}\nLeaves look pale` } });
    await waitFor(() => expect(window.sessionStorage.length).toBeGreaterThan(0));
    cleanup();
    renderSheet(null);
    const note = await screen.findByTestId("qlv2-note");
    // Positive control: the draft did come back, just without the chip's line.
    expect(screen.getByTestId("qlv2-draft-restored")).toBeInTheDocument();
    expect(noteValue(note)).toContain("Leaves look pale");
    expect(noteValue(note)).not.toContain("Response check:");
  });

  it("keeps plant A's failed draft when the same mounted sheet reopens for plant B", async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, reason: "invalid_details" }, error: null });
    const sheet = renderMountedSheet("plant:plant-1", true);
    fireEvent.change(await screen.findByTestId("qlv2-note"), {
      target: { value: "First leaves look pale" },
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(storedDraftText()).toContain('"saveFailed":true'));

    sheet.rerender("plant:plant-1", false);
    sheet.rerender("plant:plant-2", true);
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    // Plant A's draft and its failed-save state survive the untouched open.
    expect(storedDraftText()).toContain("First leaves look pale");
    expect(storedDraftText()).toContain('"saveFailed":true');

    sheet.rerender("plant:plant-2", false);
    sheet.rerender("plant:plant-1", true);
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-note")).toHaveValue("First leaves look pale"),
    );
    expect(screen.getByText(QUICK_LOG_OBSERVATION_SAVE_ERROR)).toBeInTheDocument();
  });

  it("keeps a restored chip line when the mounted sheet returns from another plant (Codex review)", async () => {
    const sheet = renderMountedSheet("plant:plant-1", true);
    fireEvent.click(await screen.findByTestId("qlv2-response-chip-better"));
    await waitFor(() => expect(storedDraftText()).toContain("Response check:"));

    sheet.rerender("plant:plant-1", false);
    sheet.rerender("plant:plant-2", true);
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    sheet.rerender("plant:plant-2", false);
    sheet.rerender("plant:plant-1", true);

    await waitFor(() =>
      expect(noteValue(screen.getByTestId("qlv2-note"))).toContain("Response check:"),
    );
    // Give the retarget effect its chance to run; the line must survive it.
    await act(async () => undefined);
    expect(noteValue(screen.getByTestId("qlv2-note"))).toContain("Response check:");
    expect(storedDraftText()).toContain("Response check:");
  });

  it("pins: an ambiguous outcome keeps its key through a reload (durable recovery owns it)", async () => {
    await failNoteOn("plant:plant-1", "receipt_unverified");
    const firstKey = rpcMock.mock.calls[0]?.[1]?.p_idempotency_key;
    expect(firstKey).toBeTruthy();
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "evt-1", environment_event_id: null, reused: true },
      error: null,
    });
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    // An ambiguous outcome is never reported as a definitive "could not save".
    expect(screen.queryByText(QUICK_LOG_OBSERVATION_SAVE_ERROR)).toBeNull();
    const save = screen.queryByTestId("qlv2-save-retry") ?? screen.getByTestId("qlv2-save");
    fireEvent.click(save);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock.mock.calls[1]?.[1]?.p_idempotency_key).toBe(firstKey);
  });
});
