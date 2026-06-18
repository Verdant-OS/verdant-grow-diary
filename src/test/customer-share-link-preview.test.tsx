/**
 * CustomerShareLinkPreview — component tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CustomerShareLinkPreview from "@/components/customer/CustomerShareLinkPreview";

function renderComponent(initial?: string) {
  return render(
    <MemoryRouter>
      <CustomerShareLinkPreview initialShareId={initial} />
    </MemoryRouter>,
  );
}

describe("CustomerShareLinkPreview", () => {
  it("renders an input and the required disclaimers", () => {
    renderComponent();
    expect(
      screen.getByTestId("customer-share-link-preview-input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("customer-share-link-preview-disclaimer"),
    ).toHaveTextContent(/share-token publishing backend not yet available/i);
    expect(
      screen.getByTestId("customer-share-link-preview-public-only"),
    ).toHaveTextContent(/only explicitly customer-facing content/i);
  });

  it("disables the Open preview action when the input is empty", () => {
    renderComponent();
    const btn = screen.getByTestId("customer-share-link-preview-open");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toBeDisabled();
  });

  it("builds a /customer/:shareId URL when a valid shareId is entered", () => {
    renderComponent();
    fireEvent.change(screen.getByTestId("customer-share-link-preview-input"), {
      target: { value: "share-abc_42" },
    });
    expect(
      screen.getByTestId("customer-share-link-preview-url"),
    ).toHaveTextContent("/customer/share-abc_42");
    const open = screen.getByTestId("customer-share-link-preview-open");
    expect(open.tagName).toBe("A");
    expect(open).toHaveAttribute("href", "/customer/share-abc_42");
  });

  it("normalizes path-unsafe input (slashes, hash, query, whitespace)", () => {
    renderComponent();
    fireEvent.change(screen.getByTestId("customer-share-link-preview-input"), {
      target: { value: "  ab/cd?ef#gh ij " },
    });
    expect(
      screen.getByTestId("customer-share-link-preview-url"),
    ).toHaveTextContent("/customer/abcdefghij");
  });
});
