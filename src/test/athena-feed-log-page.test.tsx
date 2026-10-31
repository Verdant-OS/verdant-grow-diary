import { act, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/lib/athenaFeedLogAnalytics", () => ({
  trackFeedLogEvent: vi.fn(),
}));

import { trackFeedLogEvent } from "@/lib/athenaFeedLogAnalytics";
import {
  ATHENA_FEED_LOG_CTA_HREF,
  ATHENA_FEED_LOG_DISCLAIMER,
  ATHENA_FEED_LOG_FAQ,
  ATHENA_FEED_LOG_H1,
  feedLogCsvFilename,
} from "@/lib/athenaFeedLogRules";
import AthenaFeedLog from "@/pages/AthenaFeedLog";

function renderPage() {
  return render(
    <MemoryRouter>
      <AthenaFeedLog />
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

describe("public Athena feed chart log page", () => {
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

  it("renders the approved title, disclaimer, blank plan, and FAQ", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: ATHENA_FEED_LOG_H1 })).toBeInTheDocument();
    expect(screen.getAllByText(ATHENA_FEED_LOG_DISCLAIMER)).toHaveLength(2);
    expect(screen.getByLabelText("Week 1, Product 1, planned")).toHaveValue("");
    expect(screen.getByText("Avg temp (°F)")).toBeInTheDocument();
    for (const entry of ATHENA_FEED_LOG_FAQ) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
    }
    const ctas = screen.getAllByRole("link", { name: /Keep this log in Verdant/i });
    expect(ctas).toHaveLength(3);
    expect(ctas.map((link) => link.getAttribute("href"))).toEqual([
      ATHENA_FEED_LOG_CTA_HREF,
      ATHENA_FEED_LOG_CTA_HREF,
      ATHENA_FEED_LOG_CTA_HREF,
    ]);
    expect(
      screen.queryByRole("link", { name: "Advanced Nutrients feeding chart log" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("table").closest("[data-layout]")).toHaveAttribute(
      "data-layout",
      "desktop",
    );
    expect(document.body.style.overflowX).not.toBe("hidden");
  });

  it("keeps radio labels at least 44px and scrolls the table inside its region", () => {
    renderPage();
    const radio = screen.getByRole("radio", { name: "Blended" });
    expect(radio.closest("label")?.className).toContain("min-h-11");
    const region = screen.getByRole("region", { name: "Weekly feed log table" });
    expect(region.className).toContain("overflow-x-auto");
    expect(region.getAttribute("tabindex")).toBe("0");
  });

  it("calculates a deviation, switches line without filling values, and exports without storage", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Week 1, Product 1, planned"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Week 1, Product 1, actual"), {
      target: { value: "2.5" },
    });
    expect(screen.getByText("+0.50")).toBeInTheDocument();
    expect(screen.getByText("125")).toBeInTheDocument();
    expect(screen.getByText("⚠ Over plan")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Blended" }));
    expect(screen.getByLabelText("Week 1, Product 1, planned")).toHaveValue("2");
    expect(screen.getByTestId("planned-helper").textContent).toMatch(/Blended/);
    expect(screen.queryByLabelText("Measuring method")).not.toBeInTheDocument();
    expect(trackFeedLogEvent).toHaveBeenCalledWith("feed_log_line_changed", { line: "blended" });

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    click.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(trackFeedLogEvent).toHaveBeenCalledWith("feed_log_csv_exported", expect.any(Object));
    expect(JSON.stringify(vi.mocked(trackFeedLogEvent).mock.calls)).not.toMatch(/2\.5/);
  });

  it("triggers a csv download without cancelling the click", async () => {
    const blobs: Blob[] = [];
    const revoke = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:feed-log";
      }),
      revokeObjectURL: revoke,
    });
    const clicks: { event: MouseEvent; anchor: HTMLAnchorElement }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      this.dispatchEvent(event);
      clicks.push({ event, anchor: this });
    });

    renderPage();
    fireEvent.change(screen.getByLabelText("Week 1, Product 1, planned"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Week 1, Product 1, actual"), {
      target: { value: "2.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(clicks).toHaveLength(1);
    expect(clicks[0].event.defaultPrevented).toBe(false);
    expect(clicks[0].anchor.download).toBe(feedLogCsvFilename(new Date()));
    expect(clicks[0].anchor.isConnected).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
    expect(trackFeedLogEvent).toHaveBeenCalledWith("feed_log_csv_exported", { row_count: 12 });
    const csvText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blobs[0]);
    });
    expect(csvText).toContain("2.5");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(clicks[0].anchor.isConnected).toBe(false);
    expect(revoke).toHaveBeenCalledWith("blob:feed-log");
    expect(
      screen.getByText("CSV downloaded. Nothing is saved in your browser."),
    ).toBeInTheDocument();

    vi.mocked(trackFeedLogEvent).mockClear();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => {
        throw new Error("blob failed");
      }),
      revokeObjectURL: revoke,
    });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(trackFeedLogEvent).not.toHaveBeenCalledWith("feed_log_csv_exported", expect.anything());
    expect(screen.getByText("CSV download is unavailable in this browser.")).toBeInTheDocument();
    click.mockRestore();
  });

  it("adds a week and uses the phone layout query", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add week" }));
    expect(screen.getByLabelText("Week 13 stage")).toBeInTheDocument();
    expect(trackFeedLogEvent).toHaveBeenCalledWith("feed_log_row_added", { row_count: 13 });
    mockViewport(false);
    renderPage();
    expect(screen.getAllByRole("table")[1].closest("[data-layout]")).toHaveAttribute(
      "data-layout",
      "phone",
    );
  });
});
