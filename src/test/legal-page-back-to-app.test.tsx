/**
 * #2169: Terms, Privacy, and Refund expose a header link back to the app.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import TermsOfService from "@/pages/TermsOfService";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import RefundPolicy from "@/pages/RefundPolicy";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/refund" element={<RefundPolicy />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("legal pages link back to the app (#2169)", () => {
  it.each(["/terms", "/privacy", "/refund"])("%s links Back to home at /", (path) => {
    renderAt(path);
    const link = screen.getByRole("link", { name: "Back to home" });
    expect(link).toHaveAttribute("href", "/");
  });
});
