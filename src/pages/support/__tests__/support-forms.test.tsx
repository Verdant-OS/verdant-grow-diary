import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Feedback from "../Feedback";
import Contact from "../Contact";
import LegalFooterLinks, { LEGAL_FOOTER_LINKS } from "@/components/LegalFooterLinks";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

function renderIn(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("support forms", () => {
  it("Feedback renders privacy note and heading", () => {
    renderIn(<Feedback />);
    expect(
      screen.getByText(/never used to train models or shared/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("Contact renders privacy note and heading", () => {
    renderIn(<Contact />);
    expect(
      screen.getByText(/never used to train models or shared/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("footer exposes /feedback and /contact", () => {
    const labels = LEGAL_FOOTER_LINKS.map((l) => l.to);
    expect(labels).toContain("/feedback");
    expect(labels).toContain("/contact");
    renderIn(<LegalFooterLinks />);
    expect(screen.getByRole("link", { name: "Feedback" })).toHaveAttribute("href", "/feedback");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
  });
});
