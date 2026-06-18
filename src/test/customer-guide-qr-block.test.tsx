/**
 * CustomerGuideQrBlock — component tests.
 *
 * Verifies:
 *  - Renders the "Customer guide link" label.
 *  - Encodes the absolute Customer Mode URL (via the qrcode.react SVG).
 *  - Renders the plain URL as text.
 *  - Falls back to the "unavailable" state when shareId is missing.
 *  - Does not call external QR APIs (no fetch invocation).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import CustomerGuideQrBlock, {
  CUSTOMER_GUIDE_QR_LABEL,
  CUSTOMER_GUIDE_QR_UNAVAILABLE,
} from "@/components/customer/CustomerGuideQrBlock";

const ORIGIN = "https://verdant.test";

describe("CustomerGuideQrBlock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the 'Customer guide link' label and absolute URL", () => {
    render(<CustomerGuideQrBlock shareId="share-abc" origin={ORIGIN} />);
    expect(
      screen.getByRole("heading", { name: CUSTOMER_GUIDE_QR_LABEL }),
    ).toBeInTheDocument();
    const url = screen.getByTestId("customer-guide-qr-url");
    expect(url).toHaveTextContent(`${ORIGIN}/customer/share-abc`);
  });

  it("renders a real <svg> QR (qrcode.react), not a fake decorative block", () => {
    render(<CustomerGuideQrBlock shareId="share-abc" origin={ORIGIN} />);
    const wrap = screen.getByTestId("customer-guide-qr-svg-wrap");
    const svg = wrap.querySelector("svg");
    expect(svg).not.toBeNull();
    // qrcode.react renders many <path>/<rect> children — enough to be a real QR.
    const children = svg?.querySelectorAll("path, rect") ?? [];
    expect(children.length).toBeGreaterThan(2);
  });

  it("renders the unavailable fallback when shareId is missing", () => {
    render(<CustomerGuideQrBlock shareId={null} origin={ORIGIN} />);
    expect(screen.getByTestId("customer-guide-qr-block")).toHaveAttribute(
      "data-available",
      "false",
    );
    expect(
      screen.getByTestId("customer-guide-qr-unavailable"),
    ).toHaveTextContent(CUSTOMER_GUIDE_QR_UNAVAILABLE);
    // No QR SVG when unavailable.
    expect(screen.queryByTestId("customer-guide-qr-svg-wrap")).toBeNull();
  });

  it("does NOT call window.fetch (no external QR API)", () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.reject(new Error("fetch forbidden")));
    render(<CustomerGuideQrBlock shareId="share-abc" origin={ORIGIN} />);
    expect(spy).not.toHaveBeenCalled();
  });
});
