/**
 * QuickLog hardware readings: pure formatter + render/integration tests.
 *
 * Hardware readings (Spider Farmer pH/EC combo pen, PAR/PPFD meter, etc.)
 * are MANUAL HANDHELD readings. They must:
 *   - never be written to sensor_readings
 *   - never generate alerts or action_queue items
 *   - never be classified as live sensor data
 *   - be optional (Quick Log submission must not be blocked)
 *   - append deterministic formatted text to the note field
 *
 * Post-unification: legacy diary_entries insert is gone — saves go through
 * useQuickLogV2Save → quicklog_save_manual RPC, so the note is asserted
 * via the RPC payload's `p_note` field.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";
import {
  formatHardwareReadingsBlock,
  appendHardwareReadingsToNote,
  hasAnyHardwareReading,
  HARDWARE_READINGS_HEADER,
} from "@/lib/quickLogHardwareReadingsRules";

const ROOT = resolve(__dirname, "../..");
const QUICKLOG_SRC = readFileSync(
  resolve(ROOT, "src/components/QuickLog.tsx"),
  "utf8",
);
const RULES_SRC = readFileSync(
  resolve(ROOT, "src/lib/quickLogHardwareReadingsRules.ts"),
  "utf8",
);

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => saveMock(...a),
    saving: false,
    error: null,
  }),
}));

const updateEqMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: updateEqMock }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
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
    data: [{ id: "plant-1", name: "Test Plant", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    message: vi.fn(),
  },
}));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
  updateEqMock.mockReset();
  updateEqMock.mockResolvedValue({ error: null });
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("formatHardwareReadingsBlock (pure)", () => {
  it("returns empty string when nothing entered", () => {
    expect(formatHardwareReadingsBlock({})).toBe("");
    expect(formatHardwareReadingsBlock(null)).toBe("");
    expect(formatHardwareReadingsBlock(undefined)).toBe("");
    expect(
      formatHardwareReadingsBlock({ inputPh: "", inputEc: "  " }),
    ).toBe("");
  });

  it("formats deterministically with fixed field order", () => {
    const block = formatHardwareReadingsBlock({
      lightDistance: "45",
      ppfdCanopy: "650",
      runoffEc: "1.6",
      runoffPh: "6.0",
      inputEc: "1.4",
      inputPh: "6.2",
    });
    expect(block).toBe(
      [
        HARDWARE_READINGS_HEADER,
        "- Input pH: 6.2",
        "- Input EC/PPM: 1.4",
        "- Runoff pH: 6.0",
        "- Runoff EC/PPM: 1.6",
        "- PPFD canopy: 650",
        "- Light distance: 45",
      ].join("\n"),
    );
  });

  it("only emits filled fields", () => {
    const block = formatHardwareReadingsBlock({
      inputPh: "6.1",
      ppfdCanopy: "700",
    });
    expect(block).toBe(
      [HARDWARE_READINGS_HEADER, "- Input pH: 6.1", "- PPFD canopy: 700"].join("\n"),
    );
  });

  it("appendHardwareReadingsToNote appends with blank-line separator", () => {
    expect(appendHardwareReadingsToNote("Watered today", { inputPh: "6.2" })).toBe(
      `Watered today\n\n${HARDWARE_READINGS_HEADER}\n- Input pH: 6.2`,
    );
  });

  it("appendHardwareReadingsToNote returns trimmed note when readings empty", () => {
    expect(appendHardwareReadingsToNote("  Watered  ", {})).toBe("Watered");
  });

  it("hasAnyHardwareReading detects any non-blank field", () => {
    expect(hasAnyHardwareReading({})).toBe(false);
    expect(hasAnyHardwareReading({ inputPh: "  " })).toBe(false);
    expect(hasAnyHardwareReading({ ppfdCanopy: "650" })).toBe(true);
  });
});

describe("QuickLog hardware readings UI", () => {
  it("renders Hardware readings helper area with manual handheld disclosure", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const section = screen.getByTestId("quicklog-hardware-readings");
    expect(section).toBeInTheDocument();
    expect(within(section).getByText(/Hardware readings/i)).toBeInTheDocument();
    const helper = screen.getByTestId("quicklog-hardware-helper");
    expect(helper.textContent).toMatch(/manual handheld/i);
    expect(helper.textContent).toMatch(/not live sensor data/i);
    expect(within(section).getByText("Feed/Input pH")).toBeInTheDocument();
    expect(within(section).getByText("Feed/Input EC (mS/cm)")).toBeInTheDocument();
    expect(within(section).getByText("Runoff pH")).toBeInTheDocument();
    expect(within(section).getByText("Runoff EC (mS/cm)")).toBeInTheDocument();
    expect(within(section).getByText(/PPFD canopy/)).toBeInTheDocument();
    expect(within(section).getByText(/Light distance/)).toBeInTheDocument();
  });

  it("submits an observation through the RPC adapter (no hardware readings)", async () => {
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Looking healthy today" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload.p_action).toBe("note");
    expect(payload.p_target_type).toBe("plant");
    expect(payload.p_target_id).toBe("plant-1");
    expect(payload.p_note).toBe("Looking healthy today");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("appends deterministic hardware-readings block to RPC p_note when filled", async () => {
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Watered today" },
    });
    const section = screen.getByTestId("quicklog-hardware-readings");
    const inputs = section.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "6.2" } });
    fireEvent.change(inputs[1], { target: { value: "1.4" } });
    fireEvent.change(inputs[4], { target: { value: "650" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload.p_action).toBe("note");
    expect(payload.p_note).toBe(
      [
        "Watered today",
        "",
        HARDWARE_READINGS_HEADER,
        "- Feed/Input pH: 6.2",
        "- Feed/Input EC (mS/cm): 1.4",
        "- PPFD canopy: 650",
      ].join("\n"),
    );
  });

  it("never writes hardware readings to sensor_readings / action_queue / alerts (RPC-only save path)", async () => {
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Reading" },
    });
    const section = screen.getByTestId("quicklog-hardware-readings");
    const inputs = section.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "6.2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    // Static guarantee: no `.from("sensor_readings"|"action_queue"|"alerts").insert` exists in QuickLog source.
    expect(QUICKLOG_SRC).not.toMatch(
      /\.from\(\s*["'](sensor_readings|action_queue|alerts)["']\s*\)\s*\.insert/,
    );
  });
});

describe("QuickLog static safety scan", () => {
  it("does not reference forbidden integration/automation tokens for hardware readings", () => {
    const combined = QUICKLOG_SRC + "\n" + RULES_SRC;
    for (const banned of [
      /service_role/,
      /\bmqtt\b/i,
      /home[\s_-]?assistant/i,
      /pi[\s_-]?bridge/i,
      /\bactuator\b/i,
      /device_command/i,
      /\bautopilot\b/i,
    ]) {
      expect(combined).not.toMatch(banned);
    }
  });

  it("rules helper does not import Supabase or React", () => {
    expect(RULES_SRC).not.toMatch(/@\/integrations\/supabase/);
    expect(RULES_SRC).not.toMatch(/from\s+["']react["']/);
  });

  it("QuickLog still uses activeGrowId for workspace scoping", () => {
    expect(QUICKLOG_SRC).toMatch(/activeGrowId/);
  });

  it("QuickLog does not insert into diary_entries, sensor_readings, action_queue, or alerts", () => {
    for (const t of ["diary_entries", "sensor_readings", "action_queue", "alerts"]) {
      expect(QUICKLOG_SRC).not.toMatch(
        new RegExp(`\\.from\\(\\s*["']${t}["']\\s*\\)\\s*\\.insert`),
      );
    }
  });
});
