import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/growTentClimateAnalytics", () => ({ trackClimateToolEvent: vi.fn() }));

import GrowTentTemperatureHumidityChart from "@/pages/GrowTentTemperatureHumidityChart";

function renderPage() {
  return render(
    <MemoryRouter>
      <GrowTentTemperatureHumidityChart />
    </MemoryRouter>,
  );
}

describe("grow tent climate page timers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the status announcement timer when the page unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears a pending print call when the page unmounts", () => {
    vi.useFakeTimers();
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Print blank log sheet" }));
    unmount();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(print).not.toHaveBeenCalled();
  });

  it("still announces and prints while the page is mounted", () => {
    vi.useFakeTimers();
    const print = vi.fn();
    vi.stubGlobal("print", print);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Print blank log sheet" }));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(print).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Opening print dialog for a 14-row blank tent climate log sheet."),
    ).toBeInTheDocument();
  });
});
