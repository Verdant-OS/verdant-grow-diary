import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/autopotFeedLogAnalytics", () => ({ trackAutopotLogEvent: vi.fn() }));

import AutopotStashNutrientsFeedLog from "@/pages/AutopotStashNutrientsFeedLog";

function renderPage() {
  return render(
    <MemoryRouter>
      <AutopotStashNutrientsFeedLog />
    </MemoryRouter>,
  );
}

function addEntry(gallons: string) {
  fireEvent.change(screen.getByLabelText("Volume added (gal)"), { target: { value: gallons } });
  fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
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

const fallback = () =>
  screen.queryByLabelText(/Clipboard access was unavailable/) as HTMLTextAreaElement | null;

describe("AutoPot feed log timers and copy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the status announcement timer when the page unmounts", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { unmount } = renderPage();
    addEntry("2");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears a pending print call when the page unmounts", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
    unmount();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(print).not.toHaveBeenCalled();
  });

  it("ignores a clipboard rejection that arrives after the log changed", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    addEntry("2");
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    addEntry("3");
    await act(async () => {
      clipboard.reject(new Error("denied"));
    });
    expect(fallback()).not.toBeInTheDocument();
  });

  it("does not announce a stale copy after the log changed", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    addEntry("2");
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    addEntry("3");
    await act(async () => {
      clipboard.resolve();
      await new Promise((done) => setTimeout(done, 50));
    });
    expect(screen.queryByText(/Copied 1 AutoPot log entry/)).not.toBeInTheDocument();
  });

  it("still shows both entries in the fallback when the log did not change", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    addEntry("2");
    addEntry("3");
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    await act(async () => {
      clipboard.reject(new Error("denied"));
    });
    expect(fallback()?.value.trim().split("\n")).toHaveLength(3);
  });
});
