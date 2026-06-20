import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import OperatorEcowittTentPreview from "@/pages/OperatorEcowittTentPreview";

function setMobile(isMobile: boolean) {
  const width = isMobile ? 400 : 1200;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: isMobile,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("OperatorEcowittTentPreview — local evidence handoff", () => {
  beforeEach(() => setMobile(false));

  it("loads valid sample by default and renders LIVE for Flower", () => {
    render(<OperatorEcowittTentPreview />);
    expect(screen.getByTestId("tent-label").textContent).toBe("Flower Tent");
    expect(screen.getByTestId("source-status").textContent).toBe("LIVE");
    expect(screen.getByTestId("read-only-copy").textContent).toMatch(/Read-only preview/i);
    expect(screen.getByTestId("evidence-copy").textContent).toMatch(/EcoWitt MQTT sample/i);
    expect(screen.getByTestId("source-label").textContent).toMatch(/sample/i);
  });

  it("sample dropdown switches between valid / degraded / invalid", () => {
    render(<OperatorEcowittTentPreview />);
    const select = screen.getByTestId("sample-select") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "degraded" } });
    expect(screen.getByTestId("source-status").textContent).toMatch(/DEGRADED|INVALID/);
    expect(screen.getByTestId("stale-warning")).toBeTruthy();

    fireEvent.change(select, { target: { value: "invalid" } });
    expect(screen.getByTestId("source-status").textContent).toBe("INVALID");
    expect(screen.getByTestId("invalid-reasons")).toBeTruthy();

    fireEvent.change(select, { target: { value: "valid" } });
    expect(screen.getByTestId("source-status").textContent).toBe("LIVE");
  });

  it("desktop tent tabs switch tents on the same sample", () => {
    render(<OperatorEcowittTentPreview />);
    fireEvent.click(screen.getByTestId("tent-tab-seedling"));
    expect(screen.getByTestId("tent-label").textContent).toBe("Seedling Tent");
    fireEvent.click(screen.getByTestId("tent-tab-vegetation"));
    expect(screen.getByTestId("tent-label").textContent).toBe("Vegetation Tent");
  });

  it("mobile thumb-friendly selector selects Flower / Seedling / Vegetation", () => {
    setMobile(true);
    render(<OperatorEcowittTentPreview />);
    // useIsMobile reads innerWidth in an effect, so we need to flush.
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    const seedling = screen.queryByTestId("mobile-tent-seedling");
    // If hook hasn't toggled in jsdom env, we still must verify selector exists once mobile.
    expect(seedling).toBeTruthy();
    fireEvent.click(seedling!);
    expect(screen.getByTestId("tent-label").textContent).toBe("Seedling Tent");
    fireEvent.click(screen.getByTestId("mobile-tent-vegetation"));
    expect(screen.getByTestId("tent-label").textContent).toBe("Vegetation Tent");
    fireEvent.click(screen.getByTestId("mobile-tent-flower"));
    expect(screen.getByTestId("tent-label").textContent).toBe("Flower Tent");
  });

  it("redacted raw payload toggle hidden by default, shows on click, no private fields", () => {
    render(<OperatorEcowittTentPreview />);
    expect(screen.queryByTestId("redacted-raw-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("raw-toggle"));
    const panel = screen.getByTestId("redacted-raw-panel");
    expect(panel).toBeTruthy();
    const text = panel.textContent ?? "";
    expect(text).not.toMatch(/PASSKEY/i);
    expect(text).not.toMatch(/\bMAC\b/);
    expect(text).not.toMatch(/token/i);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toMatch(/station/i);
    // toggle hides again
    fireEvent.click(screen.getByTestId("raw-toggle"));
    expect(screen.queryByTestId("redacted-raw-panel")).toBeNull();
  });

  it("page never renders PASSKEY/MAC/token/password/station anywhere, even with raw open", () => {
    render(<OperatorEcowittTentPreview />);
    fireEvent.click(screen.getByTestId("raw-toggle"));
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/PASSKEY/i);
    expect(body).not.toMatch(/\bMAC\b/);
    expect(body).not.toMatch(/token/i);
    expect(body).not.toMatch(/password/i);
    expect(body).not.toMatch(/stationtype/i);
  });

  it("stale warning renders when sample is older than freshness window", () => {
    render(<OperatorEcowittTentPreview />);
    fireEvent.change(screen.getByTestId("sample-select"), { target: { value: "degraded" } });
    expect(screen.getByTestId("stale-warning").textContent).toMatch(/Stale evidence/i);
  });
});
