import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PlantQuickLog from "@/components/PlantQuickLog";
import { QUICK_LOG_ACTION_CHIPS } from "@/lib/tenSecondQuickCheckRules";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save, saving: false, error: null }),
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "fixture-user" } }) }));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "fahrenheit",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

beforeEach(() => {
  save.mockReset().mockResolvedValue({ ok: true, growEventId: "fixture-event", reused: false });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:fixture-photo"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Reopen quick log</button>
      <PlantQuickLog
        open={open}
        onOpenChange={setOpen}
        plantId="fixture-plant"
        plantName="Fixture plant"
        growId="fixture-grow"
        tentId="fixture-tent"
      />
    </>
  );
}

function renderLog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

const chip = (name: string) => screen.getByRole("button", { name: `Log action ${name}` });
const note = () => screen.getByRole("textbox", { name: "Quick Log grow action note" });
const saveButton = () => screen.getByRole("button", { name: "Save Quick Log" });
const editNote = (value: string) => fireEvent.change(note(), { target: { value } });

describe("PlantQuickLog independent action toggles", () => {
  it("explains multi-selection and exposes persistent selected styling and aria-pressed", () => {
    renderLog();
    expect(screen.getByText("Choose any that apply. Tap again to remove.")).toBeInTheDocument();
    for (const name of QUICK_LOG_ACTION_CHIPS)
      expect(chip(name)).toHaveAttribute("aria-pressed", "false");
    const unselectedStyle = chip("Watered").className;
    fireEvent.click(chip("Watered"));
    fireEvent.click(chip("Fed"));
    expect(chip("Watered")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Fed")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Watered").className).not.toBe(unselectedStyle);
    expect(chip("Note")).toHaveAttribute("aria-pressed", "false");
  });

  it.each(QUICK_LOG_ACTION_CHIPS.filter((name) => name !== "Photo only"))(
    "%s can be removed and re-added without deselecting another action",
    (name) => {
      renderLog();
      const other = name === "Fed" ? "Watered" : "Fed";
      fireEvent.click(chip(other));
      fireEvent.click(chip(name));
      expect(note()).toHaveValue(`${other}.\n${name}.`);
      fireEvent.click(chip(name));
      expect(note()).toHaveValue(`${other}.`);
      expect(chip(other)).toHaveAttribute("aria-pressed", "true");
      expect(chip(name)).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(chip(name));
      expect(note()).toHaveValue(`${other}.\n${name}.`);
    },
  );

  it("reflects manual note edits and ignores action words inside grower sentences", () => {
    renderLog();
    editNote("Watered yesterday; waiting for dryback.\n  fed!  \nResponse check: Same.");
    expect(chip("Watered")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Fed")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip("Fed"));
    expect(note()).toHaveValue("Watered yesterday; waiting for dryback.\nResponse check: Same.");
    editNote("Watered.\nResponse check: Same.");
    expect(chip("Watered")).toHaveAttribute("aria-pressed", "true");
    editNote("Response check: Same.");
    expect(chip("Watered")).toHaveAttribute("aria-pressed", "false");
  });

  it("preserves prose, response context, indentation and blank lines when toggling", () => {
    renderLog();
    const prose =
      "  Watered yesterday, no change today.  \n\nResponse check: Worse.\n  Watch tips.  \n";
    editNote(prose);
    fireEvent.click(chip("Watered"));
    expect(note()).toHaveValue(`${prose}\nWatered.`);
    fireEvent.click(chip("Watered"));
    expect(note()).toHaveValue(prose);
    expect(screen.getByText("Ready to save this plant response follow-up.")).toBeInTheDocument();
  });

  it("saves only remaining action lines through the unchanged note payload adapter", async () => {
    renderLog();
    editNote("Watch leaf tips.");
    for (const name of ["Watered", "Fed", "Note", "Note", "Watered"]) fireEvent.click(chip(name));
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({
      p_action: "note",
      p_note: "Watch leaf tips.\nFed.",
    });
  });

  it("keeps an all-deselected empty note unsavable", () => {
    renderLog();
    fireEvent.click(chip("Watered"));
    fireEvent.click(chip("Fed"));
    fireEvent.click(chip("Watered"));
    fireEvent.click(chip("Fed"));
    expect(note()).toHaveValue("");
    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(save).not.toHaveBeenCalled();
  });

  it("resets notes and every selection after closing and reopening", () => {
    renderLog();
    fireEvent.click(chip("Watered"));
    fireEvent.click(chip("Fed"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Reopen quick log" }));
    expect(note()).toHaveValue("");
    for (const name of QUICK_LOG_ACTION_CHIPS)
      expect(chip(name)).toHaveAttribute("aria-pressed", "false");
    expect(saveButton()).toBeDisabled();
  });

  it("Photo only without an attachment adds no note and stays unsavable", () => {
    renderLog();
    fireEvent.click(chip("Photo only"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add a photo before marking this as photo only.",
    );
    expect(note()).toHaveValue("");
    expect(saveButton()).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["plant-quick-log-photo-input", "plant-quick-log-photo-library-input"])(
    "%s already clears the Photo only error when a photo is selected",
    (input) => {
      renderLog();
      fireEvent.click(chip("Photo only"));
      expect(screen.getByRole("alert")).toBeInTheDocument();
      fireEvent.change(screen.getByTestId(input), {
        target: { files: [new File(["fixture"], "fixture.jpg", { type: "image/jpeg" })] },
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeInTheDocument();
      expect(note()).toHaveValue("");
      expect(saveButton()).toBeEnabled();
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("Photo only toggles its note line independently when a photo is attached", () => {
    renderLog();
    fireEvent.change(screen.getByTestId("plant-quick-log-photo-library-input"), {
      target: { files: [new File(["fixture"], "fixture.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(chip("Photo only"));
    expect(note()).toHaveValue("Photo only.");
    fireEvent.click(chip("Photo only"));
    expect(note()).toHaveValue("");
    expect(saveButton()).toBeEnabled();
    expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeInTheDocument();
  });

  it("Photo only can be deselected after its photo is removed but cannot be re-added", () => {
    renderLog();
    fireEvent.change(screen.getByTestId("plant-quick-log-photo-library-input"), {
      target: { files: [new File(["fixture"], "fixture.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(chip("Photo only"));
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(screen.queryByTestId("plant-quick-log-photo-preview")).not.toBeInTheDocument();
    expect(chip("Photo only")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip("Photo only"));
    expect(note()).toHaveValue("");
    expect(chip("Photo only")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.click(chip("Photo only"));
    expect(note()).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add a photo before marking this as photo only.",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("Photo only can be deselected from manual note edits without a photo or loss of prose", () => {
    renderLog();
    const prose = "Response check: Same.\n  Watered yesterday; no change today.  \n";
    editNote(`${prose}\n  PHOTO ONLY!!  `);
    expect(chip("Photo only")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip("Photo only"));
    expect(note()).toHaveValue(prose);
    expect(chip("Photo only")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(chip("Photo only"));
    expect(note()).toHaveValue(prose);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add a photo before marking this as photo only.",
    );
    expect(screen.getByText("Ready to save this plant response follow-up.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
