import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
const logRows = () =>
  within(screen.getByRole("region", { name: "Climate reading log table" })).getAllByRole("row");

describe("grow tent climate copy log race", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores a clipboard rejection that arrives after the log changed", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    await act(async () => {
      clipboard.reject(new Error("denied"));
    });
    expect(fallback()).not.toBeInTheDocument();
    expect(screen.queryByText(/Clipboard unavailable/)).not.toBeInTheDocument();
  });

  it("does not announce a stale copy as current after the log changed", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    await act(async () => {
      clipboard.resolve();
      // Let the 20 ms status announcement fire.
      await new Promise((done) => setTimeout(done, 50));
    });
    expect(screen.queryByText(/Copied 1 reading\(s\)/)).not.toBeInTheDocument();
  });

  it("still shows the fallback with every logged reading when the log did not change", async () => {
    const clipboard = deferredClipboard();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    await act(async () => {
      clipboard.reject(new Error("denied"));
    });
    const tsv = (fallback() as HTMLTextAreaElement).value;
    expect(tsv.trim().split("\n")).toHaveLength(logRows().length);
  });
});
