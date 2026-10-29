import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/harvestWindowAnalytics", () => ({ trackHarvestTrackerEvent: vi.fn() }));

import HarvestWindowTracker from "@/pages/HarvestWindowTracker";

function renderPage() {
  return render(
    <MemoryRouter>
      <HarvestWindowTracker />
    </MemoryRouter>,
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function addCheck(date: string) {
  fill("Date", date);
  fill("Plant", "Plant A");
  fill("% Clear", "26");
  fill("% Cloudy", "70");
  fill("% Amber", "4");
  fireEvent.click(screen.getByRole("button", { name: "Add check" }));
}

function deferredClipboard() {
  let reject: (error: Error) => void = () => {};
  let resolve: () => void = () => {};
  const writeText = vi.fn(
    () =>
      new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  return { reject: (e: Error) => reject(e), resolve: () => resolve() };
}

const fallback = () => screen.queryByLabelText(/Clipboard access was unavailable/);

describe("harvest window tracker timers and copy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the status announcement timer when the page unmounts", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { unmount } = renderPage();
    addCheck("2026-10-01");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears a pending print call when the page unmounts", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Print blank check sheet" }));
    unmount();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(print).not.toHaveBeenCalled();
  });

  it("ignores a clipboard rejection that arrives after the log changed", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    addCheck("2026-10-01");
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    addCheck("2026-10-02");
    await act(async () => {
      clipboard.reject(new Error("denied"));
    });
    expect(fallback()).not.toBeInTheDocument();
  });

  it("does not announce a stale copy after the log changed", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    addCheck("2026-10-01");
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    addCheck("2026-10-02");
    await act(async () => {
      clipboard.resolve();
      await new Promise((done) => setTimeout(done, 50));
    });
    expect(screen.queryByText(/Copied 1 check\(s\)/)).not.toBeInTheDocument();
  });

  it("still shows the fallback with both checks when the log did not change", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    addCheck("2026-10-01");
    addCheck("2026-10-02");
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    await act(async () => {
      clipboard.reject(new Error("denied"));
    });
    const tsv = (fallback() as HTMLTextAreaElement).value;
    expect(tsv.trim().split("\n")).toHaveLength(3);
  });
});
