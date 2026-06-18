/**
 * Customer Mode QR guide page — render + isolation tests.
 *
 * Covers:
 *  - Page renders at /customer/:shareId.
 *  - All 5 branded sections render.
 *  - Customer-facing timeline shell renders with the empty-state copy.
 *  - The shareId path param is NEVER echoed into the visible DOM as a
 *    private grow/plant/tent id.
 *  - The Operator Mode Quick Log / Fast Add trigger is NOT rendered.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomerModeGuide from "@/pages/CustomerModeGuide";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/customer/:shareId" element={<CustomerModeGuide />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CustomerModeGuide", () => {
  it("renders the Customer Mode page shell", () => {
    renderAt("/customer/share-abc");
    expect(screen.getByTestId("customer-mode-guide-page")).toBeInTheDocument();
    expect(screen.getByTestId("customer-mode-shell-disclaimer")).toHaveTextContent(
      /share-token publishing backend not yet available/i,
    );
  });

  it("renders all 5 branded customer-facing sections", () => {
    renderAt("/customer/share-abc");
    for (const id of [
      "brand_intro",
      "batch_summary",
      "cultivation_highlights",
      "care_notes",
      "trust_footer",
    ]) {
      expect(
        screen.getByTestId(`customer-guide-section-${id}`),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`customer-guide-section-${id}-placeholder-label`),
      ).toHaveTextContent(/placeholder content/i);
    }
  });

  it("renders the customer-facing timeline shell with the empty state", () => {
    renderAt("/customer/share-abc");
    const timeline = screen.getByTestId("customer-guide-timeline");
    expect(timeline).toBeInTheDocument();
    expect(timeline).toHaveAttribute("data-empty", "true");
    expect(screen.getByTestId("customer-guide-timeline-empty")).toHaveTextContent(
      /no customer-facing events have been published yet/i,
    );
    expect(
      screen.getByRole("heading", { name: /customer-facing timeline/i }),
    ).toBeInTheDocument();
  });

  it("never echoes the :shareId param into the visible DOM", () => {
    const shareId = "share-abc-12345-PRIVATE";
    renderAt(`/customer/${shareId}`);
    const page = screen.getByTestId("customer-mode-guide-page");
    expect(page.textContent ?? "").not.toContain(shareId);
  });

  it("does NOT render the Operator Mode Quick Log / Fast Add trigger", () => {
    renderAt("/customer/share-abc");
    expect(screen.queryByTestId("global-fast-add")).toBeNull();
    expect(screen.queryByTestId("global-fast-add-trigger")).toBeNull();
  });
});
