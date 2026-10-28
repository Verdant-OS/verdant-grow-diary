import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { describe, expect, it } from "vitest";
import {
  PRIVACY_PAGE_LAST_UPDATED,
  REFUND_PAGE_LAST_UPDATED,
  TERMS_PAGE_LAST_UPDATED,
} from "@/constants/agreements";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import RefundPolicy from "@/pages/RefundPolicy";
import TermsOfService from "@/pages/TermsOfService";

describe("legal page last-updated binding (#1995)", () => {
  it("Terms of Service uses TERMS_PAGE_LAST_UPDATED", () => {
    render(
      <MemoryRouter>
        <TermsOfService />
      </MemoryRouter>,
    );
    expect(screen.getByText(`Last updated: ${TERMS_PAGE_LAST_UPDATED}`)).toBeTruthy();
  });

  it("Privacy Policy uses PRIVACY_PAGE_LAST_UPDATED", () => {
    render(
      <MemoryRouter>
        <PrivacyPolicy />
      </MemoryRouter>,
    );
    expect(screen.getByText(`Last updated: ${PRIVACY_PAGE_LAST_UPDATED}`)).toBeTruthy();
  });

  it("Refund Policy uses REFUND_PAGE_LAST_UPDATED", () => {
    render(
      <MemoryRouter>
        <RefundPolicy />
      </MemoryRouter>,
    );
    expect(screen.getByText(`Last updated: ${REFUND_PAGE_LAST_UPDATED}`)).toBeTruthy();
  });
});
