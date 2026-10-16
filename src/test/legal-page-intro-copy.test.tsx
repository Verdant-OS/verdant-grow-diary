/**
 * Legal page intro copy: each page closes its intro with wording that fits it.
 * Production QA 2026-10-14: /privacy and /refund reused the Terms line
 * "Please review these terms carefully." /terms keeps that line unchanged.
 */
import { describe, it, expect } from "vitest";
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

const TERMS_LINE = /Please review these terms carefully\./;
const POLICY_LINE = /Please read this policy carefully\./;

describe("legal page intro copy", () => {
  it("/terms keeps the terms intro line", () => {
    renderAt("/terms");
    expect(screen.getByText(TERMS_LINE)).toBeInTheDocument();
    expect(screen.queryByText(POLICY_LINE)).toBeNull();
  });

  it.each(["/privacy", "/refund"])("%s uses policy wording, not the terms line", (path) => {
    renderAt(path);
    expect(screen.getByText(POLICY_LINE)).toBeInTheDocument();
    expect(screen.queryByText(TERMS_LINE)).toBeNull();
  });
});
