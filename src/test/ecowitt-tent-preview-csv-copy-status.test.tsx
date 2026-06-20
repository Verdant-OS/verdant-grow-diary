import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OperatorEcowittTentPreview from "@/pages/OperatorEcowittTentPreview";

function setDesktop() {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("OperatorEcowittTentPreview — CSV, copy, status, all-tents table", () => {
  beforeEach(() => setDesktop());

  it("renders inline status explanation, separating blockers and warnings", () => {
    render(<OperatorEcowittTentPreview />);
    const exp = screen.getByTestId("dry-run-status-explanation");
    expect(exp).toBeTruthy();
    // default valid + placeholder tent_id → pass with warnings
    expect(exp.getAttribute("data-state")).toBe("pass");
    expect(screen.getByTestId("status-warnings")).toBeTruthy();
    expect(screen.queryByTestId("status-blockers")).toBeNull();
    expect(screen.getByTestId("status-pass-reasons")).toBeTruthy();

    // switch to invalid sample → blocked, blockers section appears
    fireEvent.change(screen.getByTestId("sample-select"), { target: { value: "invalid" } });
    const exp2 = screen.getByTestId("dry-run-status-explanation");
    expect(exp2.getAttribute("data-state")).toBe("blocked");
    expect(screen.getByTestId("status-blockers")).toBeTruthy();
  });

  it("renders CSV export button and triggers client-side download only", () => {
    render(<OperatorEcowittTentPreview />);
    const btn = screen.getByTestId("export-dry-run-csv-button");
    expect(btn).toBeTruthy();

    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => {
      throw new Error("network call attempted");
    });

    fireEvent.click(btn);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders all-tents export preview table with filename, send, blocked, warnings", () => {
    render(<OperatorEcowittTentPreview />);
    expect(screen.getByTestId("dry-run-all-tents-preview")).toBeTruthy();
    const table = screen.getByTestId("all-tents-preview-table");
    expect(table).toBeTruthy();
    for (const k of ["flower", "seedling", "vegetation"]) {
      const row = screen.getByTestId(`all-tents-row-${k}`);
      expect(row).toBeTruthy();
      expect(row.textContent ?? "").toMatch(/verdant-ecowitt-.*-tent-ingest-dry-run\.json/);
      expect(screen.getByTestId(`all-tents-row-${k}-can-send`)).toBeTruthy();
    }
  });

  it("renders copy dry-run payload button and writes JSON to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<OperatorEcowittTentPreview />);
    const btn = screen.getByTestId("copy-dry-run-payload-button");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toMatch(/"not_sent": true/);
    expect(arg).toMatch(/"read_only": true/);
    await waitFor(() => expect(screen.getByTestId("copy-dry-run-status-copied")).toBeTruthy());
  });

  it("handles clipboard-unavailable safely", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    render(<OperatorEcowittTentPreview />);
    fireEvent.click(screen.getByTestId("copy-dry-run-payload-button"));
    await waitFor(() =>
      expect(screen.getByTestId("copy-dry-run-status-unavailable")).toBeTruthy(),
    );
  });

  it("does not leak banned secret/network/device-control terms in new UI sections", () => {
    render(<OperatorEcowittTentPreview />);
    const html = (
      (screen.getByTestId("dry-run-status-explanation").innerHTML ?? "") +
      (screen.getByTestId("dry-run-all-tents-preview").innerHTML ?? "")
    ).toLowerCase();
    for (const banned of [
      "passkey",
      "token",
      "password",
      "secret",
      "private_ip",
      "remote_ip",
      "client_ip",
      "authorization",
      "service_role",
      "bridge_token",
      "fanon",
      "fanoff",
      "pumpon",
      "pumpoff",
    ]) {
      expect(html.includes(banned)).toBe(false);
    }
  });
});
