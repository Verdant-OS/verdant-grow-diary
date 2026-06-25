import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("OperatorEcowittTentPreview — history + diary + export", () => {
  beforeEach(() => setMobile(false));

  it("renders timeline rows for all bundled samples (selecting one updates preview)", () => {
    render(<OperatorEcowittTentPreview />);
    expect(screen.getByTestId("evidence-history")).toBeTruthy();
    for (const k of ["valid", "degraded", "invalid", "just-fresh", "just-stale"]) {
      expect(screen.getByTestId(`history-row-${k}`)).toBeTruthy();
    }
    fireEvent.click(screen.getByTestId("history-row-just-stale"));
    expect(screen.getByTestId("history-row-just-stale").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("stale-warning")).toBeTruthy();
  });

  it("renders read-only diary attach preview with disabled attach button", () => {
    render(<OperatorEcowittTentPreview />);
    expect(screen.getByTestId("diary-attach-preview")).toBeTruthy();
    expect(screen.getByTestId("diary-preview-notice").textContent).toMatch(/Preview only/i);
    expect(screen.getByTestId("diary-preview-title").textContent).toMatch(/EcoWitt snapshot preview/);
    const btn = screen.getByTestId("diary-preview-attach-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId("diary-preview-disabled-label").textContent).toMatch(/Save disabled in preview/);
  });

  it("export button triggers client-side download (no network)", () => {
    render(<OperatorEcowittTentPreview />);
    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByTestId("export-snapshot-button"));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("DOM never exposes private fields (PASSKEY/MAC/IP/token/station) in accessible names", () => {
    render(<OperatorEcowittTentPreview />);
    const html = document.body.innerHTML.toLowerCase();
    for (const banned of [
      "passkey",
      "token",
      "password",
      "station",
      "secret",
      "private_ip",
      "remote_ip",
      "client_ip",
    ]) {
      expect(html.includes(banned)).toBe(false);
    }
  });
});
