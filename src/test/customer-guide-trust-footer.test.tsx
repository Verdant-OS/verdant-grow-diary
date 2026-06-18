/**
 * CustomerGuideTrustFooter — component tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CustomerGuideTrustFooter from "@/components/customer/CustomerGuideTrustFooter";

describe("CustomerGuideTrustFooter", () => {
  it("renders the privacy, telemetry, and backend copy", () => {
    render(<CustomerGuideTrustFooter />);
    expect(
      screen.getByTestId("customer-guide-trust-privacy"),
    ).toHaveTextContent(
      /private grow logs, sensor payloads, raw payloads, and operator notes are not shown\./i,
    );
    expect(
      screen.getByTestId("customer-guide-trust-telemetry"),
    ).toHaveTextContent(/this page is not live sensor telemetry\./i);
    expect(
      screen.getByTestId("customer-guide-trust-backend"),
    ).toHaveTextContent(/share-token publishing backend not yet available\./i);
  });

  it("renders the five required FAQ questions", () => {
    render(<CustomerGuideTrustFooter />);
    for (const id of [
      "what_is_this_guide",
      "is_this_live_sensor_data",
      "are_private_grow_logs_shown",
      "are_operator_notes_shown",
      "what_does_verdant_do",
    ]) {
      expect(
        screen.getByTestId(`customer-guide-trust-faq-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("does NOT make medical/compliance/potency/lab claims", () => {
    const { container } = render(<CustomerGuideTrustFooter />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\b(medical|FDA|HIPAA|GDPR|lab[\s-]?tested|potency|THC %|CBD %|cure[ds]?\b|treat[s]?\b)\b/i);
  });
});
