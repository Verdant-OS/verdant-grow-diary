import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

const storage = vi.hoisted(() => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
}));

vi.mock("@/lib/publicFeedLogAnalytics", () => ({
  trackFeedLogEvent: vi.fn(),
}));

import { trackFeedLogEvent } from "@/lib/publicFeedLogAnalytics";
import { FEED_LOG_FAQ, PUBLIC_FEED_LOG_H1 } from "@/lib/publicFeedLogRules";
import PublicFeedLog from "@/pages/PublicFeedLog";

function renderPage() {
  return render(
    <MemoryRouter>
      <PublicFeedLog />
    </MemoryRouter>,
  );
}

function mockViewport(matchesDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchesDesktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("public Advanced Nutrients feeding chart log page", () => {
  beforeEach(() => {
    vi.mocked(trackFeedLogEvent).mockClear();
    storage.setItem.mockClear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    mockViewport(true);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:feed-log"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders the approved title, blank plan, and the brief FAQ", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: PUBLIC_FEED_LOG_H1 })).toBeInTheDocument();
    expect(screen.getByLabelText("Week 1 product 1 planned")).toHaveValue("");
    expect(screen.getByText("Avg temp (°F)")).toBeInTheDocument();
    for (const entry of FEED_LOG_FAQ) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
    }
    expect(screen.queryByText(/saved on this device/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Keep this log in Verdant/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("table").closest("[data-layout]")).toHaveAttribute(
      "data-layout",
      "desktop",
    );
  });

  it("calculates a deviation and exports without writing storage", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Week 1 product 1 planned"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Week 1 product 1 actual"), {
      target: { value: "2.5" },
    });
    expect(screen.getByText("+0.50")).toBeInTheDocument();
    expect(screen.getByText(/125%/)).toBeInTheDocument();
    expect(screen.getByText("Over plan")).toBeInTheDocument();
    expect(screen.getByText("Weeks outside your tolerance: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(trackFeedLogEvent).toHaveBeenCalledWith("feed_log_csv_exported", expect.any(Object));
    expect(JSON.stringify(vi.mocked(trackFeedLogEvent).mock.calls)).not.toMatch(/Veg|2\.5/);
  });

  it("adds a week on the desktop table", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add week" }));
    expect(screen.getByLabelText("Week 13 stage")).toBeInTheDocument();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(trackFeedLogEvent).toHaveBeenCalledWith("feed_log_row_added", { row_count: 13 });
  });

  it("marks the phone layout from the viewport query", () => {
    mockViewport(false);
    renderPage();
    expect(screen.getByRole("table").closest("[data-layout]")).toHaveAttribute(
      "data-layout",
      "phone",
    );
    expect(screen.getByLabelText("Week 1 product 1 planned")).toBeInTheDocument();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
