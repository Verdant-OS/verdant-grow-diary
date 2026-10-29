import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/autoflowerWeekPlanAnalytics", () => ({ trackAutoflowerPlannerEvent: vi.fn() }));

import AutoflowerWeekByWeek from "@/pages/AutoflowerWeekByWeek";

function renderPage() {
  return render(
    <MemoryRouter>
      <AutoflowerWeekByWeek />
    </MemoryRouter>,
  );
}

function setPlantName(value: string) {
  fireEvent.change(screen.getByLabelText(/Plant name/), { target: { value } });
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

describe("autoflower planner timers and copy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the status announcement timer when the page unmounts", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("print", vi.fn());
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a clipboard rejection that arrives after the plan changed", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    setPlantName("Plant A");
    fireEvent.click(screen.getByRole("button", { name: "Copy plan" }));
    setPlantName("Plant B");
    await act(async () => {
      clipboard.reject(new Error("denied"));
    });
    expect(fallback()).not.toBeInTheDocument();
  });

  it("does not announce a stale copy after the plan changed", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Copy plan" }));
    setPlantName("Plant B");
    await act(async () => {
      clipboard.resolve();
      await new Promise((done) => setTimeout(done, 50));
    });
    expect(screen.queryByText(/Copied \d+-week autoflower plan/)).not.toBeInTheDocument();
  });

  it("still shows the current plan in the fallback when the plan did not change", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    setPlantName("Plant B");
    fireEvent.click(screen.getByRole("button", { name: "Copy plan" }));
    await act(async () => {
      clipboard.reject(new Error("denied"));
    });
    expect(fallback()?.value).toContain("Plant B");
  });
});
