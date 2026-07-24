/**
 * TentIrrigationHistoryPanel — evidence-truth state machine. A failed query
 * never renders the empty state; a partial "could not load older" keeps the
 * loaded rows + a retry so a truncated ledger never reads as complete.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TentIrrigationHistoryPanel } from "@/components/irrigation/TentIrrigationHistoryPanel";
import { useTentIrrigationLedger } from "@/hooks/useTentIrrigationLedger";
import type { IrrigationLedgerRow } from "@/lib/irrigation/irrigationLedgerRules";

vi.mock("@/hooks/useTentIrrigationLedger", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useTentIrrigationLedger: vi.fn() };
});

const mockHook = vi.mocked(useTentIrrigationLedger);

const base = {
  rows: [] as IrrigationLedgerRow[],
  isLoading: false,
  isError: false,
  isOlderError: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
};

const row = (over: Partial<IrrigationLedgerRow> = {}): IrrigationLedgerRow => ({
  id: "w-1",
  kind: "watering",
  occurredAt: "2026-07-20T10:00:00Z",
  plantId: null,
  tentId: "tent-1",
  source: "manual",
  sourceLabel: "Manual log",
  note: null,
  volumeMl: 1000,
  ph: 6.1,
  ecMsCm: 1.8,
  outputEcMsCm: null,
  runoffMl: null,
  runoffPh: null,
  runoffEcMsCm: null,
  waterTempC: null,
  products: [],
  unmeasured: false,
  ...over,
});

beforeEach(() => mockHook.mockReturnValue({ ...base }));

describe("TentIrrigationHistoryPanel states", () => {
  it("loading shows a spinner, not empty", () => {
    mockHook.mockReturnValue({ ...base, isLoading: true });
    render(<TentIrrigationHistoryPanel tentId="tent-1" />);
    expect(screen.queryByTestId("irrigation-empty")).toBeNull();
  });

  it("a failed query renders unavailable (not empty) with a retry", () => {
    mockHook.mockReturnValue({ ...base, isError: true });
    render(<TentIrrigationHistoryPanel tentId="tent-1" />);
    expect(screen.getByTestId("irrigation-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("irrigation-empty")).toBeNull();
  });

  it("true empty-success shows the honest empty state", () => {
    render(<TentIrrigationHistoryPanel tentId="tent-1" />);
    expect(screen.getByTestId("irrigation-empty")).toBeTruthy();
  });

  it("populated shows rows with source label and mS/cm units (never live)", () => {
    mockHook.mockReturnValue({ ...base, rows: [row()] });
    render(<TentIrrigationHistoryPanel tentId="tent-1" />);
    expect(screen.getAllByTestId("irrigation-row")).toHaveLength(1);
    expect(screen.getByTestId("irrigation-row-source").textContent).toBe("Manual log");
    expect(screen.getByText("Input EC (mS/cm)")).toBeTruthy();
    expect(document.body.textContent).not.toContain("µS/cm");
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
  });

  it("an unmeasured row is a truthful 'logged, no measurements' — not omitted", () => {
    mockHook.mockReturnValue({ ...base, rows: [row({ id: "w-2", unmeasured: true, note: "watered" })] });
    render(<TentIrrigationHistoryPanel tentId="tent-1" />);
    expect(screen.getByText(/Logged — no measurements/)).toBeTruthy();
    expect(screen.queryByTestId("irrigation-empty")).toBeNull();
  });

  it("a partial older-page error keeps rows + shows a distinct retry (not complete)", () => {
    mockHook.mockReturnValue({ ...base, rows: [row()], isOlderError: true });
    render(<TentIrrigationHistoryPanel tentId="tent-1" />);
    expect(screen.getAllByTestId("irrigation-row")).toHaveLength(1);
    expect(screen.getByTestId("irrigation-older-error")).toBeTruthy();
    expect(screen.queryByTestId("irrigation-empty")).toBeNull();
  });
});
