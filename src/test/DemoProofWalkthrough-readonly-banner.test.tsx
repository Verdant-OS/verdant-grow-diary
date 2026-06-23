import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DemoProofWalkthrough from "@/pages/DemoProofWalkthrough";

function renderPage() {
  return render(
    <MemoryRouter>
      <DemoProofWalkthrough />
    </MemoryRouter>,
  );
}

describe("DemoProofWalkthrough — read-only banner", () => {
  it("renders the read-only banner near the top", () => {
    renderPage();
    const banner = screen.getByTestId(
      "demo-proof-walkthrough-readonly-banner",
    );
    expect(banner).toBeTruthy();
    const text = banner.textContent ?? "";
    expect(text).toMatch(/Read-only demo walkthrough/i);
    expect(text).toMatch(/does not submit logs/i);
    expect(text).toMatch(/call AI/i);
    expect(text).toMatch(/create alerts/i);
    expect(text).toMatch(/approve actions/i);
    expect(text).toMatch(/control devices/i);
    expect(text).toMatch(/URL surface gate/i);
    expect(text).toMatch(/RLS/);
  });

  it("contains no write/action buttons — only navigation links", () => {
    renderPage();
    // No <button> elements should be rendered by the walkthrough surface
    // (links are <a>, not <button>). Sidebar/page chrome is not mounted
    // here because we render the page in isolation.
    const buttons = screen.queryAllByRole("button");
    expect(buttons.length).toBe(0);
  });
});
