import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EcowittLiveProofPanel } from "@/components/EcowittLiveProofPanel";
import type { EcowittProofRow } from "@/lib/ecowittLiveProofRules";

const NOW = new Date("2026-06-19T12:00:00Z");
const iso = (offMs: number) => new Date(NOW.getTime() + offMs).toISOString();
const min = (m: number) => m * 60_000;

function row(o: Partial<EcowittProofRow>): EcowittProofRow {
  return {
    id: "r",
    tent_id: "t-1",
    source: "live",
    captured_at: iso(-min(1)),
    raw_payload: { vendor: "ecowitt", PASSKEY: "should-never-render" },
    metric: "rh",
    value: 55,
    unit: "%",
    ...o,
  };
}

describe("<EcowittLiveProofPanel />", () => {
  it("renders calm empty state when no rows", () => {
    render(<EcowittLiveProofPanel tentId="t-1" rows={[]} now={NOW} />);
    expect(screen.getByTestId("ecowitt-live-proof-panel").dataset.tone).toBe("neutral");
    expect(screen.getByTestId("ecowitt-live-proof-accepted").textContent).toBe("0");
    expect(screen.getByTestId("ecowitt-live-proof-rejected").textContent).toBe("0");
    expect(screen.getByText(/No EcoWitt readings observed/i)).toBeTruthy();
  });

  it("renders accepted/rejected with proof-window copy", () => {
    render(
      <EcowittLiveProofPanel
        tentId="t-1"
        rows={[
          row({ id: "a" }),
          row({ id: "b", metric: "rh", value: 100 }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("ecowitt-live-proof-accepted").textContent).toBe("1");
    expect(screen.getByTestId("ecowitt-live-proof-rejected").textContent).toBe("1");
    expect(
      screen.getByText(/in the current\s+proof window \(last 24 hours\)/i),
    ).toBeTruthy();
    expect(screen.getByTestId("ecowitt-live-proof-window-label").textContent).toMatch(
      /last 24 hours/,
    );
  });

  it("surfaces legacy bridge copy for source=ecowitt", () => {
    render(
      <EcowittLiveProofPanel
        tentId="t-1"
        rows={[row({ source: "ecowitt", raw_payload: null })]}
        now={NOW}
      />,
    );
    const panel = screen.getByTestId("ecowitt-live-proof-panel");
    expect(panel.dataset.legacyBridge).toBe("true");
    expect(screen.getByText(/EcoWitt bridge source/i)).toBeTruthy();
  });

  it("does not render raw payload values or secrets", () => {
    const { container } = render(
      <EcowittLiveProofPanel tentId="t-1" rows={[row({})]} now={NOW} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/PASSKEY/);
    expect(text).not.toMatch(/raw_payload/);
    expect(text).not.toMatch(/should-never-render/);
  });
});
