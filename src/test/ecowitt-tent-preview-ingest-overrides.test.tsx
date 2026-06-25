import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("OperatorEcowittTentPreview — overrides, field map, all-tent export", () => {
  beforeEach(() => setDesktop());

  it("renders identity override panel and field map panel", () => {
    render(<OperatorEcowittTentPreview />);
    expect(screen.getByTestId("dry-run-identity-overrides")).toBeTruthy();
    expect(screen.getByTestId("dry-run-field-map")).toBeTruthy();
    expect(screen.getByTestId("field-map-row-air_temp_f")).toBeTruthy();
    expect(screen.getByTestId("field-map-row-humidity_pct")).toBeTruthy();
  });

  it("editing tent_id override updates dry-run JSON preview only", () => {
    render(<OperatorEcowittTentPreview />);
    const realUuid = "11111111-2222-4333-8444-555555555555";
    fireEvent.change(screen.getByTestId("override-tent-id"), {
      target: { value: realUuid },
    });
    const json = screen.getByTestId("dry-run-payload-json").textContent ?? "";
    expect(json).toContain(realUuid);
  });

  it("missing required metric is visible as blocked in field map and dry-run", () => {
    render(<OperatorEcowittTentPreview />);
    fireEvent.change(screen.getByTestId("sample-select"), {
      target: { value: "invalid" },
    });
    expect(screen.getByTestId("dry-run-can-send").textContent).toBe("BLOCKED");
    expect(screen.getByTestId("dry-run-blocked-reasons")).toBeTruthy();
  });

  it("warnings render separately from blocked reasons", () => {
    render(<OperatorEcowittTentPreview />);
    // The default placeholder tent_id + missing device_identity should warn.
    const warnings = screen.queryByTestId("dry-run-warnings");
    expect(warnings).toBeTruthy();
    expect(warnings!.textContent).toMatch(/non_uuid_tent_id_preview_only/);
  });

  it("all-tent export button renders and triggers per-tent downloads only", () => {
    render(<OperatorEcowittTentPreview />);
    const btn = screen.getByTestId("export-dry-run-all-tents-button");
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

    // 3 tents
    expect(createObjectURL).toHaveBeenCalledTimes(3);
    expect(clickSpy).toHaveBeenCalledTimes(3);
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("override + field map UI never leaks banned secret/network words", () => {
    render(<OperatorEcowittTentPreview />);
    const html = (
      (screen.getByTestId("dry-run-identity-overrides").innerHTML ?? "") +
      (screen.getByTestId("dry-run-field-map").innerHTML ?? "")
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
    ]) {
      expect(html.includes(banned)).toBe(false);
    }
  });
});
