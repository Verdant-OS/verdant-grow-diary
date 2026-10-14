import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import GrowTargetsEditor from "@/components/GrowTargetsEditor";

const mocks = vi.hoisted(() => ({
  unit: "fahrenheit" as "fahrenheit" | "celsius",
  row: null as Record<string, unknown> | null,
  upsert: vi.fn(),
  toast: vi.fn(),
  user: { id: "fixture-user" },
  forceEnabled: false,
}));

vi.mock("@/components/ui/button", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/button")>();
  return {
    ...original,
    Button: (props: ComponentProps<typeof original.Button>) => (
      <original.Button {...props} disabled={mocks.forceEnabled ? false : props.disabled} />
    ),
  };
});

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => mocks.unit,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }),
      }),
      upsert: mocks.upsert,
    })),
  },
}));

async function openEditor() {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <GrowTargetsEditor open growId="fixture-grow" onSaved={onSaved} onOpenChange={onOpenChange} />,
  );
  await screen.findByLabelText("Temperature min");
  return { onSaved, onOpenChange };
}

function enter(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("GrowTargetsEditor validation and persistence (#2016)", () => {
  beforeEach(() => {
    mocks.unit = "fahrenheit";
    mocks.row = null;
    mocks.forceEnabled = false;
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    mocks.toast.mockReset();
  });

  it("blocks the reported impossible ranges and marks every invalid bound inline", async () => {
    await openEditor();
    for (const [label, value] of [
      ["Temperature min", "-40"],
      ["Temperature max", "-10"],
      ["Humidity min", "120"],
      ["Humidity max", "150"],
      ["VPD min", "-2"],
      ["VPD max", "-1"],
      ["PPFD min", "-100"],
      ["PPFD max", "-50"],
    ])
      enter(label, value);
    expect(screen.getByRole("button", { name: "Save targets" })).toBeDisabled();
    for (const label of ["Temperature", "Humidity", "VPD", "PPFD"]) {
      for (const bound of ["min", "max"]) {
        const input = screen.getByLabelText(`${label} ${bound}`);
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input).toHaveAccessibleDescription(/between/);
      }
    }
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("shows every reversed pair at once", async () => {
    await openEditor();
    for (const [label, min, max] of [
      ["Temperature", "80", "70"],
      ["Humidity", "70", "40"],
      ["VPD", "2", "1"],
    ]) {
      enter(`${label} min`, min);
      enter(`${label} max`, max);
    }
    for (const label of ["Temperature", "Humidity", "VPD"]) {
      expect(screen.getByLabelText(`${label} min`)).toHaveAccessibleDescription(/min must be.*max/);
      expect(screen.getByLabelText(`${label} max`)).toHaveAttribute("aria-invalid", "true");
    }
    expect(screen.getByRole("button", { name: "Save targets" })).toBeDisabled();
  });

  it("rejects an invalid save in the handler even if button disabling is bypassed", async () => {
    mocks.forceEnabled = true;
    const callbacks = await openEditor();
    enter("Humidity min", "120");
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Check ranges" }));
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
  });

  it("blocks an unfinished native number instead of treating it as a blank bound", async () => {
    await openEditor();
    enter("Humidity min", "40");
    // Browsers expose an unfinished exponent/sign as value="", badInput=true.
    // jsdom sanitizes the value but does not implement that validity flag.
    Object.defineProperty(screen.getByLabelText("Humidity min"), "validity", {
      configurable: true,
      value: { badInput: true },
    });
    enter("Humidity min", "");
    expect(screen.getByRole("button", { name: "Save targets" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each(["fahrenheit", "celsius"] as const)(
    "preserves valid %s saves, zero bounds, blanks and callbacks",
    async (unit) => {
      mocks.unit = unit;
      const callbacks = await openEditor();
      enter("Temperature min", unit === "fahrenheit" ? "68" : "20");
      enter("Temperature max", unit === "fahrenheit" ? "82.4" : "28");
      enter("Soil temp min", unit === "fahrenheit" ? "64.4" : "18");
      enter("Humidity min", "0");
      enter("PPFD max", "3000");
      expect(screen.getByRole("button", { name: "Save targets" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await waitFor(() => expect(mocks.upsert).toHaveBeenCalledOnce());
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          grow_id: "fixture-grow",
          user_id: "fixture-user",
          temp_min: 20,
          temp_max: 28,
          soil_temp_min: 18,
          soil_temp_max: null,
          rh_min: 0,
          rh_max: null,
          ppfd_min: null,
          ppfd_max: 3000,
        }),
        { onConflict: "grow_id" },
      );
      await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
      expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
    },
  );

  it("flags loaded impossible targets until corrected, then saves the correction", async () => {
    mocks.row = { rh_min: 120, rh_max: 150 };
    await openEditor();
    expect(screen.getByRole("button", { name: "Save targets" })).toBeDisabled();
    enter("Humidity min", "40");
    enter("Humidity max", "60");
    expect(screen.getByRole("button", { name: "Save targets" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    await waitFor(() =>
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ rh_min: 40, rh_max: 60 }),
        { onConflict: "grow_id" },
      ),
    );
  });
});
