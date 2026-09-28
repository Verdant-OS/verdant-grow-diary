import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BreedingLogContainer } from "@/components/genetics/BreedingLogContainer";

const io = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: io.rpc, functions: { invoke: io.invoke } },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: io.invalidate }),
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/genetics/breedingAuditLog", () => ({ emitBreedingAuditEvent: io.audit }));
vi.mock("sonner", () => ({ toast: { success: io.success, error: io.error, warning: vi.fn() } }));

const missing = {
  data: null,
  error: {
    code: "PGRST202",
    message: "Could not find the function public.breeding_log_save_event in the schema cache",
  },
};
const browserMethods = {
  hasPointerCapture: () => false,
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  scrollIntoView: () => {},
};
const originalMethods = Object.fromEntries(
  Object.keys(browserMethods).map((key) => [
    key,
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
  ]),
);
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("PointerEvent", MouseEvent);
  // jsdom does not implement these browser APIs used by Radix Select.
  for (const [key, value] of Object.entries(browserMethods)) {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value });
  }
  io.rpc.mockResolvedValue(missing);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of Object.keys(browserMethods)) {
    const original = originalMethods[key];
    if (original) Object.defineProperty(HTMLElement.prototype, key, original);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
});

async function select(label: string, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("missing breeding RPC preserves the real form draft", () => {
  it.each([
    {
      event: "Isolation Start",
      type: "isolation_start",
      optedIn: false,
      detailLabel: null,
      detail: null,
    },
    {
      event: "Isolation Start",
      type: "isolation_start",
      optedIn: true,
      detailLabel: null,
      detail: null,
    },
    {
      event: "Reversal Application",
      type: "reversal_application",
      optedIn: false,
      detailLabel: "Reversal method",
      detail: "Colloidal silver",
    },
    {
      event: "Pollen Shed Observed",
      type: "pollen_shed_observed",
      optedIn: false,
      detailLabel: "Pollen shed intensity",
      detail: "Heavy",
    },
  ])(
    "retains $event and optedIn=$optedIn through repeated retries",
    async ({ event, type, optedIn, detailLabel, detail }) => {
      const onCreated = vi.fn();
      render(
        <BreedingLogContainer
          activeGrowId="grow-a"
          plants={[
            { id: "plant-a", name: "Selected plant", tent_id: "tent-a" },
            { id: "plant-b", name: "Other plant", tent_id: "tent-b" },
          ]}
          onCreated={onCreated}
          onCancel={vi.fn()}
        />,
      );
      await select("Plant", "Selected plant");
      await select("Event Type", event);
      if (detailLabel && detail) await select(detailLabel, detail);
      if (optedIn) await userEvent.click(screen.getByRole("checkbox"));
      const form = screen.getByRole("button", { name: "Log Event" }).closest("form")!;
      await userEvent.click(screen.getByRole("button", { name: "Log Event" }));
      await screen.findByTestId("audit-rpc-missing-fallback");
      expect(screen.queryByRole("combobox", { name: "Plant" })).toBeNull();
      expect(io.rpc).toHaveBeenCalledTimes(1);
      fireEvent.submit(form);
      expect(io.rpc).toHaveBeenCalledTimes(1);
      expect(io.rpc.mock.calls[0][1]).toMatchObject({
        p_grow_id: "grow-a",
        p_plant_id: "plant-a",
        p_tent_id: "tent-a",
        p_event_type: type,
      });
      const firstArgs = io.rpc.mock.calls[0][1];
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(screen.getByRole("combobox", { name: "Plant" })).toHaveTextContent("Selected plant");
      expect(screen.getByRole("combobox", { name: "Event Type" })).toHaveTextContent(event);
      if (detailLabel && detail)
        expect(screen.getByRole("combobox", { name: detailLabel })).toHaveTextContent(detail);
      expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", String(optedIn));
      expect(io.rpc).toHaveBeenCalledTimes(1); // Retry reveals the draft, never silently resubmits.
      expect(io.invoke).not.toHaveBeenCalled();
      expect(io.audit).not.toHaveBeenCalled();
      expect(io.success).not.toHaveBeenCalled();
      expect(onCreated).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Log Event" }));
      await screen.findByTestId("audit-rpc-missing-fallback");
      expect(io.rpc.mock.calls[1][1]).toEqual(firstArgs); // Same target, details and idempotency key.
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(screen.getByRole("combobox", { name: "Plant" })).toHaveTextContent("Selected plant");
      expect(io.invoke).not.toHaveBeenCalled();
    },
  );

  it("saves the retained draft only after an explicit second Log Event press", async () => {
    const onCreated = vi.fn();
    render(
      <BreedingLogContainer
        activeGrowId="grow-a"
        plants={[{ id: "plant-a", name: "Selected plant", tent_id: "tent-a" }]}
        onCreated={onCreated}
        onCancel={vi.fn()}
      />,
    );
    await select("Plant", "Selected plant");
    await select("Event Type", "Isolation Start");
    await userEvent.click(screen.getByRole("button", { name: "Log Event" }));
    await screen.findByTestId("audit-rpc-missing-fallback");
    const firstArgs = io.rpc.mock.calls[0][1];
    io.rpc.mockResolvedValue({ data: { ok: true, grow_event_id: "event-a" }, error: null });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(io.rpc).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Log Event" }));
    expect(io.rpc).toHaveBeenCalledTimes(2);
    expect(io.rpc.mock.calls[1][1]).toEqual(firstArgs);
    expect(onCreated).toHaveBeenCalledOnce();
    expect(io.success).toHaveBeenCalledOnce();
    expect(io.invoke).not.toHaveBeenCalled();
  });

  it("forwards Dismiss without replaying the failed submission", async () => {
    const onCancel = vi.fn();
    render(
      <BreedingLogContainer
        activeGrowId="grow-a"
        plants={[{ id: "plant-a", name: "Selected plant", tent_id: "tent-a" }]}
        onCreated={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await select("Plant", "Selected plant");
    await select("Event Type", "Isolation Start");
    await userEvent.click(screen.getByRole("button", { name: "Log Event" }));
    await screen.findByTestId("audit-rpc-missing-fallback");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(io.rpc).toHaveBeenCalledOnce();
    expect(io.invoke).not.toHaveBeenCalled();
  });
});
