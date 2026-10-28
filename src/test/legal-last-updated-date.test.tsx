import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { describe, expect, it } from "vitest";
import {
  CURRENT_AGREEMENTS,
  PRIVACY_PAGE_LAST_UPDATED,
  REFUND_PAGE_LAST_UPDATED,
  TERMS_PAGE_LAST_UPDATED,
  formatAgreementEffectiveDate,
} from "@/constants/agreements";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import RefundPolicy from "@/pages/RefundPolicy";
import TermsOfService from "@/pages/TermsOfService";

describe("legal page last-updated dates (#1995)", () => {
  it("formats the consent effective date as a calendar date", () => {
    expect(CURRENT_AGREEMENTS.terms.version).toBe("2026-07-13");
    expect(CURRENT_AGREEMENTS.terms.effectiveDate).toBe("2026-07-13");
    expect(CURRENT_AGREEMENTS.privacy.effectiveDate).toBe("2026-07-13");
    expect(formatAgreementEffectiveDate("2026-07-13")).toBe("July 13, 2026");
    expect(TERMS_PAGE_LAST_UPDATED).toBe("July 13, 2026");
    expect(PRIVACY_PAGE_LAST_UPDATED).toBe("July 13, 2026");
    expect(REFUND_PAGE_LAST_UPDATED).toBe(TERMS_PAGE_LAST_UPDATED);
  });

  it("shows the derived date on Terms, Privacy, and Refund", () => {
    render(
      <MemoryRouter>
        <TermsOfService />
        <PrivacyPolicy />
        <RefundPolicy />
      </MemoryRouter>,
    );
    const labels = screen.getAllByText(`Last updated: ${TERMS_PAGE_LAST_UPDATED}`);
    expect(labels).toHaveLength(3);
    expect(screen.queryByText(/Last updated: July 9, 2026/)).toBeNull();
  });
});
