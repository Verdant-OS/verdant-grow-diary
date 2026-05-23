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

const insertMock = vi.fn();
const updateEqMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      // Track which tables get written to via the chain
      return {
        insert: (payload: unknown) => insertMock(table, payload),
        update: () => ({ eq: updateEqMock }),
        select: () => ({
          eq: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          }),
        }),
      };
    },
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
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
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
    // Each required field is present
    expect(within(section).getByText("Input pH")).toBeInTheDocument();
    expect(within(section).getByText("Input EC/PPM")).toBeInTheDocument();
    expect(within(section).getByText("Runoff pH")).toBeInTheDocument();
    expect(within(section).getByText("Runoff EC/PPM")).toBeInTheDocument();
    expect(within(section).getByText(/PPFD canopy/)).toBeInTheDocument();
    expect(within(section).getByText(/Light distance/)).toBeInTheDocument();
  });

  it("submits without hardware readings (fields are optional)", async () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Watered today" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const [table, payload] = insertMock.mock.calls[0];
    expect(table).toBe("diary_entries");
    expect(payload.note).toBe("Watered today");
    expect(payload.grow_id).toBe("grow-1");
    expect(payload.user_id).toBe("user-1"); // server-side ownership comes from RLS; field is allowed
    expect(toastError).not.toHaveBeenCalled();
  });

  it("appends deterministic hardware-readings block to the note when filled", async () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Watered today" },
    });
    const section = screen.getByTestId("quicklog-hardware-readings");
    const inputs = section.querySelectorAll("input");
    // Order in DOM matches field order in the rules helper
    fireEvent.change(inputs[0], { target: { value: "6.2" } }); // inputPh
    fireEvent.change(inputs[1], { target: { value: "1.4" } }); // inputEc
    fireEvent.change(inputs[4], { target: { value: "650" } }); // ppfdCanopy

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const [, payload] = insertMock.mock.calls[0];
    expect(payload.note).toBe(
      [
        "Watered today",
        "",
        HARDWARE_READINGS_HEADER,
        "- Input pH: 6.2",
        "- Input EC/PPM: 1.4",
        "- PPFD canopy: 650",
      ].join("\n"),
    );
  });

  it("never writes hardware readings to sensor_readings or action_queue", async () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Reading" },
    });
    const section = screen.getByTestId("quicklog-hardware-readings");
    const inputs = section.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "6.2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    for (const call of insertMock.mock.calls) {
      const [table] = call;
      expect(table).not.toBe("sensor_readings");
      expect(table).not.toBe("action_queue");
      expect(table).not.toBe("alerts");
    }
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

  it("QuickLog payload still includes grow_id from activeGrowId", () => {
    expect(QUICKLOG_SRC).toMatch(/grow_id:\s*activeGrowId/);
  });

  it("QuickLog does not insert into sensor_readings, action_queue, or alerts", () => {
    expect(QUICKLOG_SRC).not.toMatch(
      /\.from\(\s*["']sensor_readings["']\s*\)\s*\.insert/,
    );
    expect(QUICKLOG_SRC).not.toMatch(/\.from\(\s*["']action_queue["']\s*\)/);
    expect(QUICKLOG_SRC).not.toMatch(/\.from\(\s*["']alerts["']\s*\)/);
  });
});
