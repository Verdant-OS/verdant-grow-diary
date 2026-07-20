/**
 * DiaryRangeReportPage — render states with mocked hooks: locked when
 * the server denies (even with a pro client hint), all sections when
 * allowed, print action title-swap, invalid draft range error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DiaryRangeReportPage from "@/pages/DiaryRangeReportPage";

const mockCheck = vi.fn();
vi.mock("@/hooks/usePremiumExportServerGate", () => ({
  checkPremiumExportEntitlement: (...args: unknown[]) => mockCheck(...args),
}));

const mockEntitlements = vi.fn();
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => mockEntitlements(),
}));

const mockData = vi.fn();
vi.mock("@/hooks/useDiaryRangeReportData", () => ({
  useDiaryRangeReportData: (...args: unknown[]) => mockData(...args),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ activeGrowId: "grow-1" }),
}));

function proEntitlement() {
  return {
    loading: false,
    lookupFailed: false,
    entitlement: { isActive: true, capabilities: { advancedExports: true } },
    refetch: async () => {},
  };
}

function freeEntitlement() {
  return {
    loading: false,
    lookupFailed: false,
    entitlement: { isActive: true, capabilities: { advancedExports: false } },
    refetch: async () => {},
  };
}

const READY_DATA = {
  status: "ready",
  error: null,
  data: {
    grow: { id: "grow-1", name: "Blue Dream", stage: "veg" },
    diaryEntries: [
      {
        id: "d1",
        note: "",
        photo_url: "https://signed.example/a.jpg",
        entry_at: "2026-07-05T10:00:00.000Z",
        details: { event_type: "watering", watering_amount_ml: 400 },
      },
    ],
    growEvents: [],
    harvests: [],
    sensorReadings: [
      { metric: "temperature_c", value: 22, ts: "2026-07-05T10:00:00Z", source: "manual" },
    ],
  },
};

function renderPage(url = "/reports/diary-range?growId=grow-1&start=2026-07-01&end=2026-07-10") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DiaryRangeReportPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockEntitlements.mockReturnValue(proEntitlement());
  mockData.mockReturnValue(READY_DATA);
  mockCheck.mockResolvedValue({ ok: true, state: "allowed", reason: null, displayPlanId: "pro_monthly" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("gating", () => {
  it("locks when the server denies even with a pro client hint", async () => {
    mockCheck.mockResolvedValue({
      ok: false,
      state: "denied",
      reason: "upgrade_required",
      displayPlanId: "free",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("diary-range-report-page-locked")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("diary-range-report-paywall")).toBeInTheDocument();
    expect(screen.getByTestId("diary-range-report-server-gate-message")).toBeInTheDocument();
    expect(screen.queryByTestId("diary-range-report-page")).not.toBeInTheDocument();
  });

  it("locks immediately for a free client hint while the server decides", () => {
    mockEntitlements.mockReturnValue(freeEntitlement());
    mockCheck.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId("diary-range-report-page-locked")).toBeInTheDocument();
  });

  it("fails closed on a network error", async () => {
    mockCheck.mockResolvedValue({
      ok: false,
      state: "network_error",
      reason: "network_error",
      displayPlanId: null,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("diary-range-report-page-locked")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("diary-range-report-page-locked").getAttribute("data-server-gate-status")).toBe("error");
    expect(screen.queryByTestId("diary-range-report-paywall")).not.toBeInTheDocument();
    expect(screen.getByTestId("diary-range-report-entitlement-retry")).toBeInTheDocument();
  });

  it("treats entitlement lookup failure as retryable verification, not a paywall", async () => {
    mockCheck.mockResolvedValue({
      ok: false,
      state: "verification_failed",
      reason: "entitlement_lookup_failed",
      displayPlanId: null,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("diary-range-report-page-locked")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("diary-range-report-page-locked").getAttribute("data-server-gate-status")).toBe("error");
    expect(screen.queryByTestId("diary-range-report-paywall")).not.toBeInTheDocument();
    expect(screen.getByTestId("diary-range-report-entitlement-retry")).toBeInTheDocument();
  });

  it("does not turn an invalid gate request into an upgrade prompt", async () => {
    mockCheck.mockResolvedValue({
      ok: false,
      state: "invalid_request",
      reason: "invalid_request",
      displayPlanId: null,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("diary-range-report-page-locked")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("diary-range-report-page-locked")).toHaveAttribute(
      "data-server-gate-status",
      "error",
    );
    expect(screen.queryByTestId("diary-range-report-paywall")).not.toBeInTheDocument();
  });

  it("requests the diary_range_report feature with the page scope", async () => {
    renderPage();
    await waitFor(() => expect(mockCheck).toHaveBeenCalled());
    expect(mockCheck).toHaveBeenCalledWith("diary_range_report", {
      growId: "grow-1",
      startDate: "2026-07-01",
      endDate: "2026-07-10",
    });
  });
});

describe("allowed rendering", () => {
  it("renders header, all six sections, photos, and the safety footer", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("diary-range-report-page")).toBeInTheDocument(),
    );
    for (const id of [
      "diary-range-report-header",
      "diary-range-report-watering",
      "diary-range-report-feeding",
      "diary-range-report-training",
      "diary-range-report-environment",
      "diary-range-report-photos",
      "diary-range-report-harvest",
      "diary-range-report-safety-footer",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId("diary-range-report-watering").textContent).toContain("400 ml");
    const img = screen
      .getByTestId("diary-range-report-photos")
      .querySelector("img") as HTMLImageElement;
    expect(img?.src).toContain("signed.example");
  });

  it("print swaps the document title to the deterministic filename and restores it", async () => {
    const printSpy = vi.fn();
    const originalPrint = window.print;
    window.print = printSpy as typeof window.print;
    try {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId("diary-range-report-page")).toBeInTheDocument(),
      );
      const before = document.title;
      let titleDuringPrint = "";
      printSpy.mockImplementation(() => {
        titleDuringPrint = document.title;
      });
      fireEvent.click(screen.getByTestId("diary-range-report-print"));
      expect(printSpy).toHaveBeenCalledTimes(1);
      expect(titleDuringPrint).toBe(
        "verdant-diary-report-blue-dream-2026-07-01-to-2026-07-10",
      );
      await waitFor(() => expect(document.title).toBe(before));
    } finally {
      window.print = originalPrint;
    }
  });

  it("shows the range error and disables apply for an inverted draft range", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("diary-range-report-page")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("diary-range-report-start-date"), {
      target: { value: "2026-07-20" },
    });
    expect(screen.getByTestId("diary-range-report-range-error")).toBeInTheDocument();
    expect(
      (screen.getByTestId("diary-range-report-apply-range") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
