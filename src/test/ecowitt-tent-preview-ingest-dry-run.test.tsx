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

describe("OperatorEcowittTentPreview — ingest dry-run panel", () => {
  beforeEach(() => setDesktop());

  it("renders the dry-run panel with 'nothing has been sent' notice", () => {
    render(<OperatorEcowittTentPreview />);
    expect(screen.getByTestId("ingest-dry-run-preview")).toBeTruthy();
    expect(screen.getByTestId("dry-run-notice").textContent).toMatch(
      /Dry run only\. Nothing has been sent\./,
    );
    expect(screen.getByTestId("dry-run-can-send").textContent).toBe("YES");
    const json = screen.getByTestId("dry-run-payload-json").textContent ?? "";
    expect(json).toMatch(/"not_sent": true/);
    expect(json).toMatch(/"read_only": true/);
  });

  it("blocks send when the snapshot is invalid", () => {
    render(<OperatorEcowittTentPreview />);
    fireEvent.click(screen.getByTestId("tent-tab-seedling"));
    fireEvent.change(screen.getByTestId("sample-select"), {
      target: { value: "invalid" },
    });
    expect(screen.getByTestId("dry-run-can-send").textContent).toBe("BLOCKED");
    expect(screen.getByTestId("dry-run-blocked-reasons")).toBeTruthy();
  });

  it("export button triggers client-side download only (no fetch)", () => {
    render(<OperatorEcowittTentPreview />);
    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => {
      throw new Error("network call attempted");
    });

    fireEvent.click(screen.getByTestId("export-dry-run-button"));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dry-run panel never exposes private fields", () => {
    render(<OperatorEcowittTentPreview />);
    const html =
      (screen.getByTestId("ingest-dry-run-preview").innerHTML ?? "").toLowerCase();
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
