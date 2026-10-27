import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/publicFeedLogAnalytics", () => ({
  trackFeedLogEvent: vi.fn(),
}));

import { trackFeedLogEvent } from "@/lib/publicFeedLogAnalytics";
import PublicFeedLog from "@/pages/PublicFeedLog";

const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn(() => "blob:feed-log");

function renderPage() {
  return render(
    <MemoryRouter>
      <PublicFeedLog />
    </MemoryRouter>,
  );
}

describe("public feed log CSV download", () => {
  beforeEach(() => {
    vi.mocked(trackFeedLogEvent).mockClear();
    revokeObjectURL.mockClear();
    createObjectURL.mockReset();
    createObjectURL.mockImplementation(() => "blob:feed-log");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("appends the anchor, clicks it, removes it, and defers revoke", async () => {
    renderPage();
    const seen: { anchor: HTMLAnchorElement | null; click: MouseEvent | null } = {
      anchor: null,
      click: null,
    };
    const append = vi.spyOn(document.body, "appendChild");
    const realCreate = document.createElement.bind(document);
    const create = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = realCreate(tag);
      if (tag === "a") {
        seen.anchor = element as HTMLAnchorElement;
        element.addEventListener("click", (event) => {
          seen.click = event as MouseEvent;
        });
      }
      return element;
    });

    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(append).toHaveBeenCalledWith(seen.anchor);
    expect(seen.anchor?.isConnected).toBe(false);
    expect(seen.click).not.toBeNull();
    expect(seen.click?.defaultPrevented).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(trackFeedLogEvent).toHaveBeenCalledWith("feed_log_csv_exported", { row_count: 12 });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:feed-log");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "CSV downloaded to this device. This page did not store the log.",
    );
    create.mockRestore();
    append.mockRestore();
  });

  it("announces export unavailable and skips analytics when the blob URL throws", async () => {
    createObjectURL.mockImplementation(() => {
      throw new Error("blob unavailable");
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(trackFeedLogEvent).not.toHaveBeenCalledWith("feed_log_csv_exported", expect.anything());
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(screen.getByRole("status")).toHaveTextContent("CSV export unavailable");
    expect(screen.queryByText(/CSV downloaded/i)).not.toBeInTheDocument();
  });
});
